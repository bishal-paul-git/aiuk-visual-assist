"use client";

import type { AgentView, CustomerView, SessionSummaryView } from "@/lib/session/projections";
import type { VisualEvent } from "@/lib/domain/types";
import { syntheticFrameSrc } from "@/lib/media/frame-src";
import { postJson } from "./use-event-stream";

/**
 * How the UI reaches the session runtime.
 *
 * - "server" (default): REST commands + SSE streams to the Next.js runtime.
 * - "browser" (static demo, e.g. GitHub Pages): the same runtime runs inside
 *   the browser; tabs on one device share state through localStorage and
 *   BroadcastChannel. No server, so different devices cannot share a session.
 */

import { STATIC_DEMO, consolePath, customerPath } from "@/lib/paths";
export { STATIC_DEMO, BASE_PATH, consolePath, customerPath } from "@/lib/paths";

export type StreamStatus = "connecting" | "open" | "reconnecting" | "closed";
export type Result = { ok: boolean; error?: string; data?: unknown };

export interface CreateSessionInput {
  workflowKey: string;
  tenantId: string;
  scenario: string;
  channel: string;
  /** Server edition only: send the customer link by SMS and/or email. */
  deliverTo?: { sms?: string; email?: string };
}

export interface LinkDelivery {
  channel: "sms" | "email";
  to: string;
  provider: string;
  simulated: boolean;
  ok: boolean;
  error?: string;
}

export interface Transport {
  readonly mode: "server" | "browser";
  customerSnapshot(token: string): Promise<CustomerView | undefined>;
  agentSnapshot(id: string): Promise<AgentView | undefined>;
  subscribeCustomer(token: string, onData: (v: CustomerView) => void, onStatus: (s: StreamStatus) => void): () => void;
  subscribeAgent(id: string, onData: (v: AgentView) => void, onStatus: (s: StreamStatus) => void): () => void;
  subscribeLive(onData: (sessions: SessionSummaryView[]) => void, onStatus: (s: StreamStatus) => void): () => void;
  customerCommand(token: string, command: Record<string, unknown>): Promise<Result>;
  uploadFrame(token: string, frame: { dataUrl: string; width: number; height: number; bytes: number; trigger: string; evidenceRequestId?: string }): Promise<Result>;
  uploadPreview(token: string, dataUrl: string): Promise<void>;
  agentCommand(id: string, agentId: string, command: Record<string, unknown>): Promise<Result>;
  /** Latest live preview as a displayable URL, or null. `revoke` means the caller owns an object URL. */
  latestPreview(id: string): Promise<{ url: string; revoke: boolean } | null>;
  frameUrl(sessionId: string, frame: Pick<VisualEvent, "id" | "frameReference">): string;
  createSession(
    input: CreateSessionInput,
  ): Promise<{ ok: true; id: string; customerPath: string; consolePath: string; delivery?: LinkDelivery[] } | { ok: false; error: string }>;
  capabilities(): Promise<Capabilities>;
  /**
   * Server speech-to-text for one customer turn. The server dispatches a
   * non-empty transcript as the customer's utterance itself and returns it.
   * Unavailable (ok: false) in the static demo.
   */
  transcribe(token: string, clip: { audio: Blob; durationMs: number }): Promise<TranscribeResult>;
}

export interface Capabilities {
  liveReasoning: boolean;
  model: string | null;
  /** Server speech-to-text is configured (STT_PROVIDER). Always false in the static demo. */
  speechToText: boolean;
  mode: "server" | "browser";
}

export type TranscribeResult = { ok: true; text: string; confidence?: number } | { ok: false; status: number; error: string };

export const syntheticFrameUrl = syntheticFrameSrc;

// ---------------------------------------------------------------------------
// Server transport
// ---------------------------------------------------------------------------

function sse<T>(url: string, onData: (v: T) => void, onStatus: (s: StreamStatus) => void): () => void {
  const es = new EventSource(url);
  onStatus("connecting");
  es.onopen = () => onStatus("open");
  es.onmessage = (e) => {
    try {
      const v = JSON.parse(e.data) as T | null;
      if (v) onData(v);
      onStatus("open");
    } catch {
      /* ignore malformed frame */
    }
  };
  es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
  return () => es.close();
}

const serverTransport: Transport = {
  mode: "server",
  async customerSnapshot(token) {
    const r = await fetch(`/api/assist/${token}`);
    return r.ok ? r.json() : undefined;
  },
  async agentSnapshot(id) {
    const r = await fetch(`/api/sessions/${id}`);
    return r.ok ? r.json() : undefined;
  },
  subscribeCustomer: (token, onData, onStatus) => sse(`/api/assist/${token}/events`, onData, onStatus),
  subscribeAgent: (id, onData, onStatus) => sse(`/api/sessions/${id}/events`, onData, onStatus),
  subscribeLive: (onData, onStatus) => sse<{ sessions: SessionSummaryView[] }>("/api/sessions/events", (v) => onData(v.sessions), onStatus),
  customerCommand: (token, command) => postJson(`/api/assist/${token}/commands`, { command }),
  uploadFrame: (token, frame) => postJson(`/api/assist/${token}/frames`, frame),
  async uploadPreview(token, dataUrl) {
    await postJson(`/api/assist/${token}/preview`, { dataUrl });
  },
  agentCommand: (id, agentId, command) => postJson(`/api/sessions/${id}/commands`, { agentId, command }),
  async latestPreview(id) {
    const res = await fetch(`/api/sessions/${id}/preview`, { cache: "no-store" });
    if (res.status !== 200) return null;
    return { url: URL.createObjectURL(await res.blob()), revoke: true };
  },
  frameUrl: (sessionId, frame) => syntheticFrameUrl(frame.frameReference) ?? `/api/sessions/${sessionId}/frames/${frame.id}`,
  async createSession(input) {
    const r = await postJson("/api/sessions", input);
    if (!r.ok) return { ok: false, error: r.error ?? "Could not create session" };
    const d = r.data as { id: string; token: string; delivery?: LinkDelivery[] };
    return { ok: true, id: d.id, customerPath: customerPath(d.token), consolePath: consolePath(d.id), delivery: d.delivery };
  },
  async capabilities() {
    const r = (await fetch("/api/capabilities")
      .then((x) => x.json())
      .catch(() => ({}))) as Partial<Capabilities>;
    return { liveReasoning: r.liveReasoning === true, model: r.model ?? null, speechToText: r.speechToText === true, mode: "server" as const };
  },
  async transcribe(token, clip) {
    try {
      const res = await fetch(`/api/assist/${token}/stt?durationMs=${Math.round(clip.durationMs)}`, {
        method: "POST",
        headers: { "Content-Type": clip.audio.type || "audio/webm" },
        body: clip.audio,
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; confidence?: number; error?: string };
      if (!res.ok) return { ok: false, status: res.status, error: data.error ?? `Request failed (${res.status})` };
      return { ok: true, text: data.text ?? "", confidence: data.confidence };
    } catch {
      return { ok: false, status: 0, error: "Network error" };
    }
  },
};

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

let browserTransport: Promise<Transport> | undefined;

/** Resolve the transport for this build. The browser runtime is loaded lazily. */
export function getTransport(): Promise<Transport> {
  if (!STATIC_DEMO) return Promise.resolve(serverTransport);
  browserTransport ??= import("./browser-transport").then((m) => m.createBrowserTransport());
  return browserTransport;
}
