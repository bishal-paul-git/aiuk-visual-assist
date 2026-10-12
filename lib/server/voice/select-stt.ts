import { createDeepgramStt } from "./deepgram";
import { createElevenLabsStt } from "./elevenlabs-stt";
import type { Env, SpeechToTextProvider, SttProviderName } from "./stt";

/** Provider selection for server speech-to-text: STT_PROVIDER plus the matching key. */

export interface SttOptions {
  env?: Env;
  fetchImpl?: typeof fetch;
}

/** Which provider the environment asks for, if it is also given its key. */
export function sttProviderName(env: Env = process.env): SttProviderName | null {
  const name = env.STT_PROVIDER?.trim().toLowerCase();
  if (name === "elevenlabs") return env.ELEVENLABS_API_KEY ? "elevenlabs" : null;
  if (name === "deepgram") return env.DEEPGRAM_API_KEY ? "deepgram" : null;
  return null;
}

export function sttConfigured(env: Env = process.env): boolean {
  return sttProviderName(env) !== null;
}

/** The configured provider, or null when server speech-to-text is off. */
export function selectSttProvider(opts: SttOptions = {}): SpeechToTextProvider | null {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  switch (sttProviderName(env)) {
    case "elevenlabs":
      return createElevenLabsStt(env.ELEVENLABS_API_KEY!, fetchImpl);
    case "deepgram":
      return createDeepgramStt(env.DEEPGRAM_API_KEY!, fetchImpl);
    default:
      return null;
  }
}
