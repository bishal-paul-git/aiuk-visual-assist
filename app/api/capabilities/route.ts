import { getRuntime } from "@/lib/server/runtime";
import { sttProviderName } from "@/lib/server/voice/select-stt";

/** What this deployment can do — lets the UI offer live AI and server speech-to-text only when configured. */
export async function GET() {
  const live = getRuntime().liveReasoning;
  const stt = sttProviderName();
  return Response.json({ liveReasoning: live.available, model: live.model ?? null, speechToText: stt !== null, sttProvider: stt });
}
