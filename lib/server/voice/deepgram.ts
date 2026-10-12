import { clamp01, providerError, STT_TIMEOUT_MS, type SpeechToTextProvider, type TranscriptionResult } from "./stt";

/**
 * Deepgram pre-recorded speech-to-text (Nova-3, British English). The clip
 * is the raw request body; Deepgram detects webm/opus and mp4/aac itself and
 * reports a confidence and the audio duration.
 */

export const DEEPGRAM_STT_URL = "https://api.deepgram.com/v1/listen?model=nova-3&language=en-GB&smart_format=true";

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: { channels?: { alternatives?: { transcript?: string; confidence?: number }[] }[] };
}

export function parseDeepgram(body: DeepgramResponse): { text: string; confidence?: number; durationSeconds?: number } {
  const alt = body.results?.channels?.[0]?.alternatives?.[0];
  const duration = body.metadata?.duration;
  return {
    text: (alt?.transcript ?? "").trim(),
    confidence: clamp01(alt?.confidence),
    durationSeconds: typeof duration === "number" && Number.isFinite(duration) ? duration : undefined,
  };
}

export function createDeepgramStt(apiKey: string, fetchImpl: typeof fetch = fetch): SpeechToTextProvider {
  return {
    id: "deepgram-nova-3",
    name: "deepgram",
    async transcribe(audio, mime): Promise<TranscriptionResult> {
      let res: Response;
      try {
        res = await fetchImpl(DEEPGRAM_STT_URL, {
          method: "POST",
          headers: { Authorization: `Token ${apiKey}`, "Content-Type": mime, Accept: "application/json" },
          body: audio as BodyInit,
          signal: AbortSignal.timeout(STT_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, status: 504, error: "Speech provider did not respond" };
      }
      if (!res.ok) return providerError(res.status);
      const body = (await res.json().catch(() => null)) as DeepgramResponse | null;
      if (!body) return providerError(res.status);
      return { ok: true, transcription: parseDeepgram(body) };
    },
  };
}
