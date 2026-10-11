/**
 * Operational model for System Health (docs/02 §3.10, docs/10). In the POC the
 * service list reflects what actually runs: the orchestrator and SSE transport
 * are real; media, speech and reasoning are browser-native or simulated.
 */
export interface ServiceStatus {
  key: string;
  name: string;
  layer: "customer" | "media" | "voice" | "reasoning" | "orchestration" | "workflow" | "human" | "data" | "observability";
  provider: string;
  mode: "live" | "browser_native" | "simulated" | "not_deployed";
  status: "operational" | "degraded" | "outage" | "not_deployed";
  region: string;
  p95Ms?: number;
  note: string;
}

export const SERVICES: ServiceStatus[] = [
  { key: "web", name: "Customer web app", layer: "customer", provider: "Next.js", mode: "live", status: "operational", region: "uk-south", note: "Mobile browser session, no install" },
  { key: "transport", name: "Session event transport", layer: "orchestration", provider: "SSE (in-process)", mode: "live", status: "operational", region: "uk-south", p95Ms: 40, note: "Replace with durable event bus for multi-instance" },
  { key: "orchestrator", name: "Session orchestrator", layer: "orchestration", provider: "AIUK orchestrator", mode: "live", status: "operational", region: "uk-south", p95Ms: 3, note: "Deterministic state machine; authoritative session state" },
  { key: "media", name: "Real-time media (WebRTC)", layer: "media", provider: "Low-rate preview relay", mode: "simulated", status: "degraded", region: "uk-south", note: "Interim JPEG relay; WebRTC SFU planned for Phase 2" },
  { key: "gateway", name: "Media gateway / frame selection", layer: "media", provider: "Client-side gateway", mode: "browser_native", status: "operational", region: "device", note: "Stability-gated capture, compression, scene-change detection" },
  { key: "asr", name: "Speech recognition", layer: "voice", provider: "Browser Web Speech", mode: "browser_native", status: "operational", region: "device", note: "Typed fallback where unsupported" },
  { key: "tts", name: "Speech synthesis", layer: "voice", provider: "Browser speechSynthesis", mode: "browser_native", status: "operational", region: "device", note: "Provider voice planned" },
  { key: "reasoning", name: "Multimodal reasoning", layer: "reasoning", provider: "aiuk-vision-sim-1", mode: "simulated", status: "operational", region: "uk-south", p95Ms: 1700, note: "Scenario-driven simulation behind ReasoningProvider interface" },
  { key: "tools", name: "Business action executor", layer: "workflow", provider: "Sandbox tools", mode: "simulated", status: "operational", region: "uk-south", p95Ms: 2900, note: "Idempotent, outside the media loop" },
  { key: "queue", name: "Human escalation queue", layer: "human", provider: "AIUK console", mode: "live", status: "operational", region: "uk-south", note: "Works when AI inference is unavailable" },
  { key: "store", name: "Session data store", layer: "data", provider: "In-memory (POC)", mode: "live", status: "degraded", region: "uk-south", note: "Not durable — restarts clear live state" },
  { key: "telemetry", name: "Logs, metrics, traces", layer: "observability", provider: "OpenTelemetry", mode: "not_deployed", status: "not_deployed", region: "—", note: "Audit events captured; OTel export planned" },
];

export interface Incident {
  id: string;
  severity: "P0" | "P1" | "P2" | "P3";
  title: string;
  status: "open" | "monitoring" | "resolved";
  openedAt: string;
  resolvedAt?: string;
  service: string;
  runbook: string;
}

export const INCIDENTS: Incident[] = [
  { id: "INC-0042", severity: "P3", title: "Elevated line-test latency from NetOps sandbox", status: "monitoring", openedAt: "2026-10-11T07:55:00.000Z", service: "tools", runbook: "workflow-outage" },
  { id: "INC-0039", severity: "P2", title: "Vision provider timeouts (simulated outage drill)", status: "resolved", openedAt: "2026-10-07T13:10:00.000Z", resolvedAt: "2026-10-07T13:42:00.000Z", service: "reasoning", runbook: "model-outage" },
];

export const RUNBOOKS = [
  { key: "media-outage", title: "Media outage", owner: "Real-time media" },
  { key: "voice-outage", title: "Voice outage", owner: "Real-time media" },
  { key: "model-outage", title: "Model outage", owner: "AI quality" },
  { key: "workflow-outage", title: "Workflow / integration outage", owner: "Client integrations" },
  { key: "human-queue-outage", title: "Human queue outage", owner: "Customer support" },
  { key: "database-issue", title: "Database issue", owner: "Platform operations" },
  { key: "high-latency", title: "High latency", owner: "Platform operations" },
  { key: "cost-anomaly", title: "Cost anomaly", owner: "Platform operations" },
  { key: "incorrect-ai-behaviour", title: "Incorrect AI behaviour", owner: "AI quality" },
];
