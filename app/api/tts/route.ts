import { jsonError, readJson, str } from "@/lib/server/http";
import { clipKey, VOICES, type VoiceRole } from "@/lib/voice/voices";
import { elevenLabsConfigured, synthesise } from "@/lib/server/voice/elevenlabs";

/**
 * Speech for assistant and agent lines that have no pre-recorded clip.
 * Responds 404 when live voice isn't configured, so the browser falls back
 * to its own voice. Same-origin only, length-capped, cached and rate-limited.
 */

const MAX_CHARS = 600;
const CACHE_LIMIT = 200;
const cache = new Map<string, ArrayBuffer>();
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  h.count += 1;
  return h.count > 60;
}

export async function POST(request: Request) {
  if (!elevenLabsConfigured()) return jsonError("Live voice is not configured", 404);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return jsonError("Cross-origin requests are not allowed", 403);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return jsonError("Too many requests", 429);

  const body = await readJson(request);
  const text = str(body?.text, 10_000);
  if (!text) return jsonError("text is required");
  if (text.length > MAX_CHARS) return jsonError(`text is limited to ${MAX_CHARS} characters`);
  const role = (str(body?.role, 20) ?? "assistant") as VoiceRole;
  if (!(role in VOICES)) return jsonError("Unknown voice role");

  const key = clipKey(role, text);
  let audio = cache.get(key);
  if (!audio) {
    const r = await synthesise(text, role);
    if (!r.ok) return jsonError(r.error, r.status);
    audio = r.audio;
    cache.set(key, audio);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  }
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}
