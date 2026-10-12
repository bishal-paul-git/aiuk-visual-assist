import type { NextRequest } from "next/server";
import { resolveCustomer } from "@/lib/server/customer";
import { jsonError } from "@/lib/server/http";
import { requestLogger } from "@/lib/server/log";
import { selectSttProvider } from "@/lib/server/voice/select-stt";
import {
  billableSeconds,
  cleanTranscript,
  clientIp,
  createRateLimiter,
  crossOrigin,
  readBodyCapped,
  validateClipBody,
  validateClipHeaders,
} from "@/lib/server/voice/stt-request";

/**
 * Server speech-to-text for one customer turn. The body is the raw clip from
 * MediaRecorder (webm/opus, ogg/opus or mp4/aac), `?durationMs=` its length.
 *
 * The clip goes to the configured provider and is then dropped: it is never
 * stored or logged. A non-empty transcript is dispatched as an ordinary
 * `customer.utterance` (so redaction, audit and the AI turn all apply), with
 * the provider and billed seconds attached for the cost event. The transcript
 * is returned so the customer sees what was heard.
 *
 * 404 when STT_PROVIDER is not configured, so the client keeps browser
 * recognition. Same-origin only, size/duration-capped and rate-limited per IP
 * and per session.
 */

const perIp = createRateLimiter(40, 60_000);
const perSession = createRateLimiter(20, 60_000);
const ENDED = new Set(["completed", "failed"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const provider = selectSttProvider();
  if (!provider) return jsonError("Speech-to-text is not configured", 404);
  if (crossOrigin(request)) return jsonError("Cross-origin requests are not allowed", 403);
  if (perIp.hit(clientIp(request))) return jsonError("Too many requests", 429);

  const c = await resolveCustomer(params);
  if (!c) return jsonError("This link is invalid or has expired", 404);
  if (perSession.hit(c.id)) return jsonError("Too many requests", 429);
  const status = c.rt.get(c.id)?.state.session.status;
  if (status === "awaiting_consent") return jsonError("Session not started", 409);
  if (!status || ENDED.has(status)) return jsonError("Session has ended", 409);

  const head = validateClipHeaders({
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
    durationMs: request.nextUrl.searchParams.get("durationMs"),
  });
  if (!head.ok) return jsonError(head.error, head.status);
  const bytes = await readBodyCapped(request);
  if (!bytes) return jsonError("Audio clip too large", 413);
  const clip = validateClipBody(bytes);
  if (!clip.ok) return jsonError(clip.error, clip.status);

  const log = requestLogger(request, { sessionId: c.id });
  const started = Date.now();
  const r = await provider.transcribe(bytes, clip.mime);
  const latencyMs = Date.now() - started;
  if (!r.ok) {
    log.warn("stt.failed", { provider: provider.id, status: r.status, latencyMs, bytes: bytes.length });
    return jsonError(r.error, r.status);
  }

  const text = cleanTranscript(r.transcription.text);
  const audioSeconds = billableSeconds(r.transcription.durationSeconds, head.durationMs);
  // Never log the transcript: ids, sizes and timings only.
  log.info("stt.transcribed", { provider: provider.id, latencyMs, bytes: bytes.length, audioSeconds, empty: !text });
  if (!text) return Response.json({ ok: true, text: "" });

  const confidence = r.transcription.confidence ?? 0.9;
  const { error } = c.rt.dispatch(c.id, { type: "customer.utterance", text, confidence, speech: { provider: provider.id, audioSeconds } }, c.actor);
  if (error) return jsonError(error, 409);
  return Response.json({ ok: true, text, confidence });
}
