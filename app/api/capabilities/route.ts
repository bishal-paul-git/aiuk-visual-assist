import { getRuntime } from "@/lib/server/runtime";
import { sttProviderName } from "@/lib/server/voice/select-stt";
import { elevenLabsConfigured } from "@/lib/server/voice/elevenlabs";
import { parseIceServers } from "@/lib/media/live-call";
import { getConnectorRegistry } from "@/lib/integrations/config";
import { getNotifications } from "@/lib/server/notifications";
import { twilioTurnConfigured } from "@/lib/server/turn";

/**
 * What this deployment can do. The UI uses it to offer live AI and server
 * speech-to-text only when configured; scripts/check-deployment.mjs uses it to
 * report what is switched on. Booleans and provider names only, never secrets.
 */
export async function GET() {
  const live = getRuntime().liveReasoning;
  const stt = sttProviderName();
  const ice = parseIceServers(process.env.ICE_SERVERS);
  const turnRelay = twilioTurnConfigured() || ice.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(u)));
  const connectors = getConnectorRegistry().list().filter((c) => c.config.mode === "http").map((c) => ({ tenantId: c.config.tenantId, tool: c.config.tool }));
  const delivery = getNotifications().status();
  return Response.json({
    liveReasoning: live.available,
    model: live.model ?? null,
    speechToText: stt !== null,
    sttProvider: stt,
    textToSpeech: elevenLabsConfigured(),
    turnRelay,
    connectors,
    delivery,
  });
}
