/**
 * Request validation for POST /api/assist/[token]/stt, kept free of Next and
 * the runtime so it can be unit tested. The route sends one short clip per
 * customer turn, as recorded by MediaRecorder: webm/opus (Chrome, Android,
 * Firefox may use ogg) or mp4/aac (iOS and macOS Safari).
 */

/** About 30 s of 256 kbit/s audio; real clips are far smaller (opus ~32 kbit/s, Safari aac ~64-128 kbit/s). */
export const MAX_AUDIO_BYTES = 1_000_000;
/** Below this a clip cannot hold a word; refuse it rather than pay to transcribe it. */
export const MIN_AUDIO_BYTES = 400;
/** One turn. The client ends a clip at 25 s; anything longer is refused. */
export const MAX_DURATION_MS = 30_000;
export const MIN_DURATION_MS = 200;
/** Longest transcript accepted into the session, matching customer.utterance. */
export const MAX_TRANSCRIPT_CHARS = 1000;

export type AudioMime = "audio/webm" | "audio/mp4" | "audio/ogg";

const TYPE_ALIASES: Record<string, AudioMime> = {
  "audio/webm": "audio/webm",
  "video/webm": "audio/webm",
  "audio/mp4": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/aac": "audio/mp4",
  "video/mp4": "audio/mp4",
  "audio/ogg": "audio/ogg",
};

type Fail = { ok: false; status: number; error: string };

/** "audio/webm;codecs=opus" -> "audio/webm". Null for anything that isn't a supported recording. */
export function normaliseAudioType(contentType: string | null | undefined): AudioMime | null {
  if (!contentType) return null;
  const base = contentType.split(";")[0].trim().toLowerCase();
  return TYPE_ALIASES[base] ?? null;
}

/** Identify the container from its first bytes, so a mislabelled or non-audio upload is refused. */
export function sniffAudio(bytes: Uint8Array): AudioMime | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "audio/ogg";
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "audio/mp4";
  return null;
}

export interface ClipHeaders {
  contentType: string | null;
  contentLength: string | null;
  /** Client-measured clip length, from the `durationMs` query parameter. */
  durationMs: string | null;
}

/** Checks that need no body: refuse oversize or unsupported uploads before reading them. */
export function validateClipHeaders(h: ClipHeaders): { ok: true; mime: AudioMime; durationMs?: number } | Fail {
  const mime = normaliseAudioType(h.contentType);
  if (!mime) return { ok: false, status: 415, error: "Expected a webm, ogg or mp4 audio clip" };
  if (h.contentLength !== null) {
    const len = Number(h.contentLength);
    if (!Number.isFinite(len) || len < 0) return { ok: false, status: 400, error: "Invalid Content-Length" };
    if (len > MAX_AUDIO_BYTES) return { ok: false, status: 413, error: "Audio clip too large" };
  }
  if (h.durationMs === null || h.durationMs === "") return { ok: true, mime };
  const ms = Number(h.durationMs);
  if (!Number.isFinite(ms) || ms < 0) return { ok: false, status: 400, error: "Invalid durationMs" };
  if (ms > MAX_DURATION_MS) return { ok: false, status: 413, error: `Audio clip is limited to ${MAX_DURATION_MS / 1000} seconds` };
  if (ms < MIN_DURATION_MS) return { ok: false, status: 400, error: "Audio clip too short" };
  return { ok: true, mime, durationMs: ms };
}

/**
 * Checks on the bytes themselves. Returns the container actually found, which
 * is what the provider is told: browsers label some recordings loosely.
 */
export function validateClipBody(bytes: Uint8Array): { ok: true; mime: AudioMime } | Fail {
  if (bytes.length > MAX_AUDIO_BYTES) return { ok: false, status: 413, error: "Audio clip too large" };
  if (bytes.length < MIN_AUDIO_BYTES) return { ok: false, status: 400, error: "Audio clip too short" };
  const sniffed = sniffAudio(bytes);
  if (!sniffed) return { ok: false, status: 415, error: "Unrecognised audio format" };
  return { ok: true, mime: sniffed };
}

/**
 * Read a request body up to `max` bytes. Returns null once the limit is
 * passed, without buffering the rest (Content-Length can be absent or wrong).
 */
export async function readBodyCapped(request: Request, max = MAX_AUDIO_BYTES): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Same-origin check used by the browser-facing voice routes. Requests without an Origin (same-origin GETs, curl) pass. */
export function crossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/**
 * Seconds of audio to bill for a turn: the provider's own measurement when it
 * gives one, else the client's, capped at the turn limit.
 */
export function billableSeconds(providerSeconds: number | undefined, declaredMs: number | undefined): number {
  const s = providerSeconds !== undefined && Number.isFinite(providerSeconds) ? providerSeconds : declaredMs !== undefined ? declaredMs / 1000 : 0;
  return Math.min(MAX_DURATION_MS / 1000, Math.max(0, s));
}

/** Transcript as it enters the session: trimmed, whitespace collapsed, length-capped. */
export function cleanTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS);
}

/** Fixed-window limiter. `hit(key)` counts a request and says whether it is over the limit. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key: string): boolean {
      const t = now();
      const h = hits.get(key);
      if (!h || h.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
        return false;
      }
      h.count += 1;
      return h.count > limit;
    },
  };
}
