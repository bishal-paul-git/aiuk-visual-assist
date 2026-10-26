import { describeCapabilities } from "./capabilities";
import { getConnectorRegistry } from "@/lib/integrations/config";
import { lookupSecret } from "@/lib/integrations/secret-vault";
import { connectorStatuses } from "@/lib/integrations/status";
import { STATIC_EXPORT } from "./platform-data";

export interface ReadinessItem {
  label: string;
  state: "on" | "off" | "demo";
  detail: string;
}

/**
 * What is switched on for a client, in plain words (no provider names, no
 * secrets). The static demo has no server, so everything there is scripted.
 */
export function clientReadiness(tenantId: string): ReadinessItem[] {
  if (STATIC_EXPORT) {
    return [
      { label: "AI that reads photos", state: "demo", detail: "Scripted for this online demo. The full version uses real AI." },
      { label: "Voice and speech", state: "demo", detail: "Uses your browser's built-in voice in this demo." },
      { label: "Text-message links", state: "demo", detail: "Not sent in this demo. Copy the link instead." },
      { label: "Live video to an agent", state: "demo", detail: "Works between tabs of this browser only." },
      { label: "Business actions", state: "demo", detail: "Simulated in this demo." },
    ];
  }
  const caps = describeCapabilities();
  const rows = connectorStatuses(tenantId, getConnectorRegistry(), [], lookupSecret);
  const built = rows.filter((r) => r.mode === "builtin").length;
  const api = rows.filter((r) => r.mode === "http").length;
  const sandbox = rows.filter((r) => r.mode === "simulated").length;
  const parts = [built && `${built} recorded by Visual Assist`, api && `${api} sent to your systems`, sandbox && `${sandbox} simulated`].filter(Boolean);
  return [
    caps.liveReasoning
      ? { label: "AI that reads photos", state: "on", detail: "Real AI looks at what the customer shows the camera." }
      : { label: "AI that reads photos", state: "off", detail: "Not switched on. Sessions use scripted scenarios." },
    caps.textToSpeech
      ? { label: "Voice", state: "on", detail: "The assistant speaks every reply." }
      : { label: "Voice", state: "off", detail: "The assistant uses the phone's own voice." },
    caps.speechToText
      ? { label: "Speech recognition", state: "on", detail: "Customers can speak, including on iPhones." }
      : { label: "Speech recognition", state: "off", detail: "Only browsers with built-in recognition (mostly Chrome) can speak." },
    !caps.delivery.sms.simulated
      ? { label: "Text-message links", state: "on", detail: "The secure link is sent to the customer by SMS." }
      : { label: "Text-message links", state: "off", detail: "Not sent yet. Copy the link and send it yourself." },
    caps.turnRelay
      ? { label: "Live video to an agent", state: "on", detail: "Works on Wi-Fi and mobile data." }
      : { label: "Live video to an agent", state: "off", detail: "May fail on mobile data or strict networks." },
    { label: "Business actions", state: built || api ? "on" : "off", detail: parts.length ? `${parts.join(", ")}.` : "All simulated." },
  ];
}
