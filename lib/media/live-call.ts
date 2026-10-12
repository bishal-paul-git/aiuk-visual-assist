import type { SessionState } from "@/lib/domain/session";

/**
 * Live video between the customer's phone and the human agent (WebRTC).
 *
 * Pure logic only, shared by both builds and by the server relay:
 * - when a call may run (eligibility),
 * - ICE server configuration,
 * - validation of signalling messages,
 * - the per-peer call state machine.
 *
 * The customer sends camera video and microphone audio and receives agent
 * audio; the agent receives both and sends microphone audio. The customer is
 * always the offerer and the agent the answerer. Signalling is ephemeral: it is
 * relayed, never stored, audited or added to the transcript, and video is not
 * recorded (docs/06 §3).
 */

export type CallRole = "customer" | "agent";

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface CallEligibility {
  eligible: boolean;
  /** The human agent the call is with: the earliest one still in the session. */
  agentUserId?: string;
  reason: "ok" | "ended" | "no_consent" | "camera_off" | "no_human";
}

/** A call runs only while a human agent is present and the customer has consented with the camera on. */
export function callEligibility(state: SessionState): CallEligibility {
  const status = state.session.status;
  if (status === "completed" || status === "failed") return { eligible: false, reason: "ended" };
  if (status === "created" || status === "awaiting_consent" || !state.consent) return { eligible: false, reason: "no_consent" };
  if (!state.media.camera) return { eligible: false, reason: "camera_off" };
  const human = state.participants
    .filter((p) => p.type === "human_agent" && !p.leftAt && p.userId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
  if (!human) return { eligible: false, reason: "no_human" };
  return { eligible: true, agentUserId: human.userId, reason: "ok" };
}

// ---------------------------------------------------------------------------
// ICE servers
// ---------------------------------------------------------------------------

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const DEFAULT_ICE_SERVERS: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const ICE_URL = /^(stun|stuns|turn|turns):[^\s]{1,250}$/;

/**
 * Parse `ICE_SERVERS` (a JSON array of RTCIceServer). Invalid entries are
 * dropped; an empty or invalid value falls back to the public STUN default.
 */
export function parseIceServers(raw: string | undefined): IceServer[] {
  if (!raw?.trim()) return DEFAULT_ICE_SERVERS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
  if (!Array.isArray(value)) return DEFAULT_ICE_SERVERS;
  const servers: IceServer[] = [];
  for (const entry of value.slice(0, 10)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const urls = (Array.isArray(e.urls) ? e.urls : [e.urls]).filter((u): u is string => typeof u === "string" && ICE_URL.test(u));
    if (!urls.length) continue;
    const server: IceServer = { urls: urls.length === 1 ? urls[0] : urls };
    const needsAuth = urls.some((u) => u.startsWith("turn"));
    if (typeof e.username === "string" && typeof e.credential === "string") {
      server.username = e.username.slice(0, 256);
      server.credential = e.credential.slice(0, 256);
    } else if (needsAuth) continue; // TURN without credentials cannot work.
    servers.push(server);
  }
  return servers.length ? servers : DEFAULT_ICE_SERVERS;
}

// ---------------------------------------------------------------------------
// Signalling messages
// ---------------------------------------------------------------------------

export const SIGNAL_VERSION = 1;
export const MAX_SDP_LENGTH = 32_000;

export interface IceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

interface SignalBase {
  v: typeof SIGNAL_VERSION;
  sessionId: string;
  from: CallRole;
  /** Random id of the sending page instance, so a reloaded console is a new peer. */
  peer: string;
}

/** Agent → customer: ready to receive a call (repeated while waiting). */
export type ReadySignal = SignalBase & { kind: "ready" };
/** Customer → agent: SDP offer, addressed to the agent peer that announced itself. */
export type OfferSignal = SignalBase & { kind: "offer"; callId: string; to: string; sdp: string };
export type AnswerSignal = SignalBase & { kind: "answer"; callId: string; sdp: string };
/** `candidate: null` marks the end of candidates. */
export type IceSignal = SignalBase & { kind: "ice"; callId: string; candidate: IceCandidateInit | null };
export type ByeSignal = SignalBase & { kind: "bye"; callId?: string; reason?: string };

export type Signal = ReadySignal | OfferSignal | AnswerSignal | IceSignal | ByeSignal;
export type SignalKind = Signal["kind"];

/** What a client sends; the relay stamps `v`, `sessionId` and `from`. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type OutgoingSignal = DistributiveOmit<Signal, "v" | "sessionId" | "from">;

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{1,80}$/;

const isId = (x: unknown): x is string => typeof x === "string" && ID.test(x);
const isSdp = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= MAX_SDP_LENGTH && x.startsWith("v=");
const optStr = (x: unknown, max: number) => x === undefined || x === null || (typeof x === "string" && x.length <= max);

function parseCandidate(x: unknown): IceCandidateInit | null | undefined {
  if (x === null) return null;
  if (!x || typeof x !== "object") return undefined;
  const c = x as Record<string, unknown>;
  if (typeof c.candidate !== "string" || c.candidate.length > 1000) return undefined;
  if (!optStr(c.sdpMid, 64) || !optStr(c.usernameFragment, 256)) return undefined;
  const idx = c.sdpMLineIndex;
  if (!(idx === undefined || idx === null || (Number.isInteger(idx) && (idx as number) >= 0 && (idx as number) < 64))) return undefined;
  return {
    candidate: c.candidate,
    sdpMid: (c.sdpMid as string | null | undefined) ?? null,
    sdpMLineIndex: (idx as number | null | undefined) ?? null,
    usernameFragment: (c.usernameFragment as string | null | undefined) ?? null,
  };
}

/**
 * Validate a signalling message. Returns a normalised copy with only known
 * fields, or null. With `stamp`, the sender's role and session are taken from
 * the stamp (the relay's authenticated view), not from the message.
 */
export function parseSignal(value: unknown, stamp?: { sessionId: string; from: CallRole }): Signal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  const sessionId = stamp?.sessionId ?? m.sessionId;
  const from = stamp?.from ?? m.from;
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return null;
  if (from !== "customer" && from !== "agent") return null;
  if (!stamp && m.v !== SIGNAL_VERSION) return null;
  if (!isId(m.peer)) return null;
  const base: SignalBase = { v: SIGNAL_VERSION, sessionId, from, peer: m.peer };
  switch (m.kind) {
    case "ready":
      return from === "agent" ? { ...base, kind: "ready" } : null;
    case "offer":
      return from === "customer" && isId(m.callId) && isId(m.to) && isSdp(m.sdp) ? { ...base, kind: "offer", callId: m.callId, to: m.to, sdp: m.sdp } : null;
    case "answer":
      return from === "agent" && isId(m.callId) && isSdp(m.sdp) ? { ...base, kind: "answer", callId: m.callId, sdp: m.sdp } : null;
    case "ice": {
      if (!isId(m.callId)) return null;
      const candidate = parseCandidate(m.candidate);
      return candidate === undefined ? null : { ...base, kind: "ice", callId: m.callId, candidate };
    }
    case "bye":
      if (m.callId !== undefined && !isId(m.callId)) return null;
      if (!optStr(m.reason, 80)) return null;
      return { ...base, kind: "bye", ...(m.callId ? { callId: m.callId as string } : {}), ...(m.reason ? { reason: m.reason as string } : {}) };
    default:
      return null;
  }
}

/** A random id for peers and calls (URL-safe, 16 chars). */
export function randomId(): string {
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Call state machine
// ---------------------------------------------------------------------------

/**
 * idle: not eligible. waiting: eligible, no call yet (the agent announces
 * itself; the customer waits for an announcement). connecting: offer/answer
 * exchanged, ICE in progress (also used while recovering from a dropped
 * connection). live: media flowing. fallback: WebRTC failed or is unsupported;
 * the preview relay (snapshots) carries on until eligibility resets or the
 * agent retries.
 */
export type CallPhase = "idle" | "waiting" | "connecting" | "live" | "fallback";

export interface CallState {
  role: CallRole;
  phase: CallPhase;
  callId?: string;
  /** The remote peer of the current call. */
  remotePeer?: string;
  /** Failed attempts since the call became eligible. */
  attempts: number;
  /** When the current phase started (ms). */
  since: number;
  reason?: string;
}

export const MAX_ATTEMPTS = 3;
export const CONNECT_TIMEOUT_MS = 15_000;
/** How long the agent waits for an offer before counting a failed attempt. */
export const WAIT_TIMEOUT_MS = 20_000;
/** How often the agent repeats "ready" while waiting. */
export const READY_INTERVAL_MS = 2_500;

export function initialCall(role: CallRole, now = 0): CallState {
  return { role, phase: "idle", attempts: 0, since: now };
}

export type CallEvent =
  | { type: "eligibility"; eligible: boolean; now: number }
  | { type: "unsupported"; now: number }
  /** Customer: an offer for `callId` was sent to `to`. Agent: an offer was accepted. */
  | { type: "started"; callId: string; remotePeer: string; now: number }
  | { type: "connected"; now: number }
  | { type: "disconnected"; now: number }
  | { type: "failed"; reason: string; now: number }
  | { type: "remote_bye"; now: number }
  | { type: "tick"; now: number }
  /** Agent pressed "Retry live video" after a fallback. */
  | { type: "retry"; now: number };

/**
 * Only the agent gives up: it stops announcing itself, so the customer simply
 * keeps waiting (and keeps sending snapshots) until a new call or retry.
 */
function fail(s: CallState, reason: string, now: number): CallState {
  const attempts = s.attempts + 1;
  return attempts >= MAX_ATTEMPTS && s.role === "agent"
    ? { role: s.role, phase: "fallback", attempts, since: now, reason }
    : { role: s.role, phase: "waiting", attempts, since: now, reason };
}

export function callReducer(s: CallState, e: CallEvent): CallState {
  switch (e.type) {
    case "eligibility":
      if (!e.eligible) return s.phase === "idle" ? s : initialCall(s.role, e.now);
      return s.phase === "idle" ? { ...s, phase: "waiting", attempts: 0, since: e.now, reason: undefined } : s;
    case "unsupported":
      return { role: s.role, phase: "fallback", attempts: s.attempts, since: e.now, reason: "unsupported" };
    case "started":
      if (s.phase === "idle" || s.phase === "fallback") return s;
      return { ...s, phase: "connecting", callId: e.callId, remotePeer: e.remotePeer, since: e.now, reason: undefined };
    case "connected":
      return s.phase === "connecting" ? { ...s, phase: "live", attempts: 0, since: e.now } : s;
    case "disconnected":
      return s.phase === "live" ? { ...s, phase: "connecting", since: e.now, reason: "reconnecting" } : s;
    case "failed":
      return s.phase === "connecting" || s.phase === "live" ? fail(s, e.reason, e.now) : s;
    case "remote_bye":
      // The other side hung up cleanly (e.g. the console reloaded): wait for the next call.
      return s.phase === "connecting" || s.phase === "live" ? { role: s.role, phase: "waiting", attempts: s.attempts, since: e.now } : s;
    case "tick":
      if (s.phase === "connecting" && e.now - s.since > CONNECT_TIMEOUT_MS) return fail(s, "timeout", e.now);
      if (s.role === "agent" && s.phase === "waiting" && e.now - s.since > WAIT_TIMEOUT_MS) return fail(s, "no_offer", e.now);
      return s;
    case "retry":
      return s.phase === "fallback" && s.reason !== "unsupported" ? { role: s.role, phase: "waiting", attempts: 0, since: e.now } : s;
  }
}

/** Hang-up reasons that mean the connection failed (as opposed to someone leaving). */
export const FAILURE_REASONS = new Set(["ice_failed", "negotiation", "timeout"]);

/** What the WebRTC layer should do with an incoming signal. */
export type SignalAction =
  | { type: "ignore" }
  /** Customer: create a peer connection and send an offer to `to`. */
  | { type: "offer"; to: string }
  /** Agent: replace any current call and answer this offer. */
  | { type: "answer"; offer: OfferSignal }
  | { type: "apply_answer"; sdp: string }
  | { type: "add_ice"; candidate: IceCandidateInit | null }
  /** The current call was hung up by the other side; `failed` when it gave up on the connection. */
  | { type: "close"; failed: boolean }
  /** Agent: the customer's browser cannot do WebRTC. */
  | { type: "unsupported" };

/**
 * Route an incoming signal for this peer. Messages for other sessions, from
 * the same role, for other calls or addressed to other peers are ignored.
 */
export function routeSignal(s: CallState, msg: Signal, self: { sessionId: string; peer: string }): SignalAction {
  if (msg.sessionId !== self.sessionId || msg.from === s.role) return { type: "ignore" };
  if (s.phase === "idle" || s.phase === "fallback") return { type: "ignore" };
  const current = (callId?: string) => Boolean(callId) && callId === s.callId && (s.phase === "connecting" || s.phase === "live");
  switch (msg.kind) {
    case "ready":
      // Only a waiting customer starts a call; a ready that crosses an offer in flight is stale.
      return s.role === "customer" && s.phase === "waiting" ? { type: "offer", to: msg.peer } : { type: "ignore" };
    case "offer":
      return s.role === "agent" && msg.to === self.peer && msg.callId !== s.callId ? { type: "answer", offer: msg } : { type: "ignore" };
    case "answer":
      return s.role === "customer" && s.phase === "connecting" && msg.callId === s.callId && msg.peer === s.remotePeer
        ? { type: "apply_answer", sdp: msg.sdp }
        : { type: "ignore" };
    case "ice":
      return current(msg.callId) && msg.peer === s.remotePeer ? { type: "add_ice", candidate: msg.candidate } : { type: "ignore" };
    case "bye":
      if (s.role === "agent" && s.phase === "waiting" && msg.reason === "unsupported") return { type: "unsupported" };
      return current(msg.callId) || (!msg.callId && msg.peer === s.remotePeer && (s.phase === "connecting" || s.phase === "live"))
        ? { type: "close", failed: Boolean(msg.reason && FAILURE_REASONS.has(msg.reason)) }
        : { type: "ignore" };
  }
}

/** Status line shown in the console. */
export function callStatusLabel(s: CallState): string | null {
  switch (s.phase) {
    case "idle":
      return null;
    case "waiting":
      return s.attempts > 0 ? "Reconnecting" : "Connecting";
    case "connecting":
      return s.reason === "reconnecting" ? "Reconnecting" : "Connecting";
    case "live":
      return "Live";
    case "fallback":
      return "Fallback: snapshots";
  }
}
