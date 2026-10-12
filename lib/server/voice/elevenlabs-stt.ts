import { clamp01, providerError, STT_TIMEOUT_MS, type SpeechToTextProvider, type TranscriptionResult } from "./stt";

/**
 * ElevenLabs Scribe speech-to-text (POST /v1/speech-to-text, multipart).
 * Scribe reports per-word log-probabilities rather than one confidence, so
 * the turn's confidence is the mean word probability.
 */

export const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
export const ELEVENLABS_STT_MODEL = "scribe_v1";

interface ScribeWord {
  text?: string;
  type?: string;
  start?: number;
  end?: number;
  logprob?: number;
}

interface ScribeResponse {
  text?: string;
  words?: ScribeWord[];
}

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/aac": "aac", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" };

export function parseScribe(body: ScribeResponse): { text: string; confidence?: number; durationSeconds?: number } {
  const words = (body.words ?? []).filter((w) => w.type === undefined || w.type === "word");
  const probs = words.map((w) => (typeof w.logprob === "number" ? Math.exp(w.logprob) : NaN)).filter(Number.isFinite);
  const ends = (body.words ?? []).map((w) => w.end).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return {
    text: (body.text ?? "").trim(),
    confidence: probs.length ? clamp01(probs.reduce((a, b) => a + b, 0) / probs.length) : undefined,
    durationSeconds: ends.length ? Math.max(...ends) : undefined,
  };
}

export function createElevenLabsStt(apiKey: string, fetchImpl: typeof fetch = fetch): SpeechToTextProvider {
  return {
    id: "elevenlabs-scribe",
    name: "elevenlabs",
    async transcribe(audio, mime): Promise<TranscriptionResult> {
      const form = new FormData();
      form.set("model_id", ELEVENLABS_STT_MODEL);
      form.set("language_code", "en");
      form.set("tag_audio_events", "false");
      form.set("file", new Blob([audio as BlobPart], { type: mime }), `utterance.${EXT[mime] ?? "webm"}`);
      let res: Response;
      try {
        res = await fetchImpl(ELEVENLABS_STT_URL, {
          method: "POST",
          headers: { "xi-api-key": apiKey, Accept: "application/json" },
          body: form,
          signal: AbortSignal.timeout(STT_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, status: 504, error: "Speech provider did not respond" };
      }
      if (!res.ok) return providerError(res.status);
      const body = (await res.json().catch(() => null)) as ScribeResponse | null;
      if (!body) return providerError(res.status);
      return { ok: true, transcription: parseScribe(body) };
    },
  };
}
