/**
 * Server speech-to-text (docs/02 §3.3, §7). One short customer clip in, one
 * transcript out. Audio is passed straight to the provider and never stored
 * or logged; only the transcript enters the session, through the normal
 * `customer.utterance` command.
 *
 * Selected by STT_PROVIDER = elevenlabs | deepgram, with the matching key
 * (ELEVENLABS_API_KEY or DEEPGRAM_API_KEY). Unset means off: the customer app
 * keeps using the browser's own recognition. Selection: ./select-stt.ts.
 */

export type Env = Record<string, string | undefined>;

export interface Transcription {
  text: string;
  /** 0..1 where the provider reports one. */
  confidence?: number;
  /** Audio duration the provider measured, in seconds. */
  durationSeconds?: number;
}

export type TranscriptionResult = { ok: true; transcription: Transcription } | { ok: false; status: number; error: string };

export interface SpeechToTextProvider {
  /** Provider id recorded on cost events, e.g. "deepgram-nova-3". Must match STT_PRICES_USD_PER_MINUTE. */
  readonly id: string;
  /** Short vendor name for capabilities and logs. */
  readonly name: SttProviderName;
  transcribe(audio: Uint8Array, mime: string): Promise<TranscriptionResult>;
}

export const STT_PROVIDERS = ["elevenlabs", "deepgram"] as const;
export type SttProviderName = (typeof STT_PROVIDERS)[number];

/** Upstream calls give up after this long; a customer is waiting for a reply. */
export const STT_TIMEOUT_MS = 15_000;

/** Shared failure mapping: provider problems are a 502 to our caller; never echo the provider body. */
export function providerError(status: number): TranscriptionResult {
  return { ok: false, status: 502, error: `Speech provider error (${status})` };
}

export function clamp01(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined;
}
