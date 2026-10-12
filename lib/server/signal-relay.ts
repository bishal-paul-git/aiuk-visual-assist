import { callEligibility, parseIceServers, parseSignal, type CallRole, type IceServer, type Signal } from "@/lib/media/live-call";
import type { SessionRuntime } from "@/lib/runtime/session-runtime";

/**
 * WebRTC signalling relay (server edition). Offers, answers and ICE candidates
 * pass from one side of a session to the other over a dedicated SSE stream.
 * Messages are held only for the instant they are fanned out: never stored,
 * persisted, audited or added to the transcript.
 *
 * In-process, like the session runtime: a multi-instance deployment needs
 * sticky sessions or a shared pub/sub (e.g. Redis) in place of this map.
 */

type Listener = (msg: Signal) => void;

const GLOBAL_KEY = "__aiukVisualAssistSignalRelay";
/** Per session and side: at most this many messages per window (ICE bursts stay well under it). */
const RATE_LIMIT = 200;
const RATE_WINDOW_MS = 10_000;

export class SignalRelay {
  private listeners = new Map<string, Set<Listener>>();
  private rate = new Map<string, { windowStart: number; count: number }>();

  /** Receive the messages addressed to `role` in this session. */
  subscribe(sessionId: string, role: CallRole, fn: Listener): () => void {
    const key = `${sessionId}:${role}`;
    let set = this.listeners.get(key);
    if (!set) this.listeners.set(key, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (!set.size) this.listeners.delete(key);
    };
  }

  /** Deliver to the other side. Returns false when rate limited. */
  publish(msg: Signal, now = Date.now()): boolean {
    const key = `${msg.sessionId}:${msg.from}`;
    const r = this.rate.get(key);
    if (!r || now - r.windowStart > RATE_WINDOW_MS) this.rate.set(key, { windowStart: now, count: 1 });
    else if (++r.count > RATE_LIMIT) return false;
    const to: CallRole = msg.from === "customer" ? "agent" : "customer";
    for (const fn of this.listeners.get(`${msg.sessionId}:${to}`) ?? []) fn(msg);
    return true;
  }

  listenerCount(sessionId: string, role: CallRole): number {
    return this.listeners.get(`${sessionId}:${role}`)?.size ?? 0;
  }
}

export function getSignalRelay(): SignalRelay {
  const g = globalThis as unknown as Record<string, unknown>;
  return (g[GLOBAL_KEY] ??= new SignalRelay()) as SignalRelay;
}

export type RelayResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Validate and relay one message from an authenticated side of a session. The
 * sender's role and session come from the route's authorisation, not the body.
 * `agentUserId` is the signed-in user when the sender is the agent: only the
 * human agent the call is with may signal.
 */
export function relaySignal(
  rt: SessionRuntime,
  relay: SignalRelay,
  input: { sessionId: string; from: CallRole; agentUserId?: string; body: unknown },
): RelayResult {
  const entry = rt.get(input.sessionId);
  if (!entry) return { ok: false, status: 404, error: "Session not found" };
  const eligibility = callEligibility(entry.state);
  const msg = parseSignal(input.body, { sessionId: input.sessionId, from: input.from });
  if (!msg) return { ok: false, status: 400, error: "Invalid signal" };
  // A hang-up is always allowed, so the other side can stop promptly.
  if (msg.kind !== "bye") {
    if (!eligibility.eligible) return { ok: false, status: 409, error: "Live video is not available for this session" };
    if (input.from === "agent" && eligibility.agentUserId !== input.agentUserId) return { ok: false, status: 403, error: "Only the agent with the customer can start live video" };
  }
  if (!relay.publish(msg)) return { ok: false, status: 429, error: "Too many signalling messages" };
  return { ok: true };
}

/** ICE servers for authorised clients: `ICE_SERVERS` (JSON array of RTCIceServer), else public STUN. */
export function iceServers(): IceServer[] {
  return parseIceServers(process.env.ICE_SERVERS);
}
