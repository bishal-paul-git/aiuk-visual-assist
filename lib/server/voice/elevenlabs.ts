import { FALLBACK_VOICES, VOICES, type VoiceRole } from "@/lib/voice/voices";

/**
 * Live text-to-speech through the ElevenLabs HTTP API (server edition).
 * Enabled by ELEVENLABS_API_KEY; voices default to the British voices in
 * lib/voice/voices.ts and can be overridden per role.
 */

export function elevenLabsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ELEVENLABS_API_KEY);
}

/**
 * One voice for every line, the assistant's and the agents' alike, so the
 * customer never hears it change. ELEVENLABS_VOICE_ID overrides it. The role
 * is kept so separate agent voices can come back later if wanted.
 */
export function voiceIdFor(role: VoiceRole, env: Record<string, string | undefined> = process.env): string {
  if (role === "customer") return env.ELEVENLABS_CUSTOMER_VOICE_ID || VOICES.customer.id;
  return env.ELEVENLABS_VOICE_ID || VOICES.assistant.id;
}

/** Set once the main voice has been refused: from then on every line uses the stock voice, so it never flips back and forth. */
let stuckFallback: string | null = null;

/** Voices to try, best first: the one voice, then (only if the plan refuses it) one stock British voice. */
export function voiceCandidates(role: VoiceRole, env: Record<string, string | undefined> = process.env): string[] {
  if (role === "customer") return [voiceIdFor(role, env)];
  if (stuckFallback) return [stuckFallback];
  return [...new Set([voiceIdFor(role, env), FALLBACK_VOICES.assistant])];
}

/** Tests only. */
export function resetVoiceFallback() {
  stuckFallback = null;
}

/** Provider answers that mean "this voice is not usable for you"; another voice may work. */
const VOICE_REJECTED = new Set([400, 402, 403, 404, 422]);

export interface VoiceHealth {
  /** Last synthesis outcome; null until a line has been spoken. */
  ok: boolean | null;
  at: string | null;
  status: number | null;
  detail: string | null;
  /** The voice that last worked. */
  voiceId: string | null;
  usedFallback: boolean;
}

const health: VoiceHealth = { ok: null, at: null, status: null, detail: null, voiceId: null, usedFallback: false };

export function voiceHealth(): VoiceHealth {
  return { ...health };
}

function record(r: Omit<VoiceHealth, "at">) {
  Object.assign(health, r, { at: new Date().toISOString() });
}

async function detailOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: { status?: string; message?: string } | string };
    if (typeof j.detail === "string") return j.detail.slice(0, 160);
    return (j.detail?.status ?? j.detail?.message ?? "").slice(0, 160);
  } catch {
    return "";
  }
}

export async function synthesise(
  text: string,
  role: VoiceRole,
  opts: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; audio: ArrayBuffer; voiceId: string } | { ok: false; status: number; error: string }> {
  const env = opts.env ?? process.env;
  const key = env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, status: 404, error: "Live voice is not configured" };
  const f = opts.fetchImpl ?? fetch;
  const candidates = voiceCandidates(role, env);
  let last = { status: 502, detail: "" };
  for (const [i, id] of candidates.entries()) {
    let res: Response;
    try {
      res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: env.ELEVENLABS_MODEL || "eleven_turbo_v2_5",
          language_code: "en",
          voice_settings: { stability: 0.75, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
        }),
      });
    } catch {
      last = { status: 502, detail: "network" };
      break;
    }
    if (res.ok) {
      if (i > 0) stuckFallback = id;
      record({ ok: true, status: 200, detail: null, voiceId: id, usedFallback: i > 0 });
      return { ok: true, audio: await res.arrayBuffer(), voiceId: id };
    }
    last = { status: res.status, detail: await detailOf(res) };
    if (!VOICE_REJECTED.has(res.status)) break; // key, quota or provider trouble: another voice won't help
  }
  record({ ok: false, status: last.status, detail: last.detail || null, voiceId: null, usedFallback: false });
  return { ok: false, status: 502, error: `Voice provider error (${last.status}${last.detail ? `: ${last.detail}` : ""})` };
}
