import { VOICES, type VoiceRole } from "@/lib/voice/voices";

/**
 * Live text-to-speech through the ElevenLabs HTTP API (server edition).
 * Enabled by ELEVENLABS_API_KEY; voices default to the British voices in
 * lib/voice/voices.ts and can be overridden per role.
 */

export function elevenLabsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ELEVENLABS_API_KEY);
}

export function voiceIdFor(role: VoiceRole, env: Record<string, string | undefined> = process.env): string {
  const override = role === "assistant" ? env.ELEVENLABS_VOICE_ID : role === "agentMale" ? env.ELEVENLABS_AGENT_VOICE_ID_MALE : env.ELEVENLABS_AGENT_VOICE_ID;
  return override || VOICES[role].id;
}

export async function synthesise(
  text: string,
  role: VoiceRole,
  opts: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; audio: ArrayBuffer } | { ok: false; status: number; error: string }> {
  const env = opts.env ?? process.env;
  const key = env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, status: 404, error: "Live voice is not configured" };
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceIdFor(role, env))}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL || "eleven_turbo_v2_5" }),
  });
  if (!res.ok) return { ok: false, status: 502, error: `Voice provider error (${res.status})` };
  return { ok: true, audio: await res.arrayBuffer() };
}
