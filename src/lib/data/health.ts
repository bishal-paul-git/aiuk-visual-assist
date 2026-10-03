import type { BudgetStage, FallbackPath, IncidentUpdate, LatencyPoint, ServiceHealth } from "../types/health";
import type { Incident } from "../types";

function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

const hours = Array.from({ length: 24 }, (_, i) => `${String((15 + i) % 24).padStart(2, "0")}:00`); // 15:00 yesterday -> 14:00 today

function latency(seed: number, p50: number, p95: number, errBase: number, spikeFrom = 99, spikeMul = 1): LatencyPoint[] {
  const r = rng(seed);
  return hours.map((t, i) => {
    const spike = i >= spikeFrom ? spikeMul * (1 - (i - spikeFrom) * 0.04) : 1;
    return {
      t,
      p50: Math.round(p50 * (0.9 + r() * 0.2) * (1 + (spike - 1) * 0.6)),
      p95: Math.round(p95 * (0.88 + r() * 0.24) * spike),
      errors: Math.round(errBase * (0.5 + r()) * (i >= spikeFrom ? 1 + (spikeMul - 1) * 1.5 : 1)),
    };
  });
}

function uptime(seed: number, base: number, dips: Record<number, number> = {}): number[] {
  const r = rng(seed);
  return Array.from({ length: 30 }, (_, i) => dips[i] ?? Math.min(100, +(base + r() * (100 - base) * 0.9).toFixed(2)));
}

export const services: ServiceHealth[] = [
  {
    id: "webrtc", name: "WebRTC", description: "Camera and audio media transport (SFU + TURN)", status: "Operational", p50: 86, p95: 210, uptime30: 99.97, errors24h: 14,
    region: "UK South (London)", provider: "Managed WebRTC SFU (demo)", latency24h: latency(101, 86, 210, 0.6), uptimeDays: uptime(1, 99.9, { 28: 99.4 }),
    dependencies: ["Media Gateway", "Notifications"], runbook: "RB-WEBRTC-01 · TURN relay health",
    events: [{ at: "02 Oct 14:10", text: "TURN pool rebalanced after INC-0409 follow-up", tone: "neutral" }, { at: "30 Sep 10:19", text: "INC-0409 resolved: TURN node replaced", tone: "ok" }],
  },
  {
    id: "voice", name: "Voice AI", description: "Speech-to-text, dialogue and text-to-speech", status: "Operational", p50: 340, p95: 780, uptime30: 99.95, errors24h: 22,
    region: "UK South (London)", provider: "Voice model provider (demo)", latency24h: latency(102, 340, 780, 0.9), uptimeDays: uptime(2, 99.88, { 11: 99.2 }),
    dependencies: ["Workflow Engine", "Queue"], runbook: "RB-VOICE-03 · Barge-in and ASR latency",
    events: [{ at: "01 Oct 09:02", text: "ASR model patch rolled out (canary 10% then 100%)", tone: "neutral" }],
  },
  {
    id: "visual", name: "Visual AI", description: "Frame selection and multimodal inference", status: "Degraded", p50: 1850, p95: 4200, uptime30: 99.81, errors24h: 63,
    region: "UK South (London) · failover UK West", provider: "Multimodal inference provider (demo)", latency24h: latency(103, 1100, 2300, 1.2, 20, 1.9),
    uptimeDays: uptime(3, 99.8, { 29: 99.3 }), dependencies: ["Queue", "Media Gateway", "Database"], incidentId: "INC-0412", runbook: "RB-VISUAL-02 · Provider latency and regional failover",
    events: [
      { at: "03 Oct 12:05", text: "Traffic shifted to secondary region; p95 recovering", tone: "warn" },
      { at: "03 Oct 11:42", text: "INC-0412 opened: p95 inference latency above 4s", tone: "bad" },
    ],
  },
  {
    id: "workflow", name: "Workflow Engine", description: "Workflow orchestration, policy checks and tool calls", status: "Maintenance", p50: 48, p95: 120, uptime30: 99.98, errors24h: 3,
    region: "UK South (London)", provider: "Orchestration runtime (demo)", latency24h: latency(104, 48, 120, 0.15), uptimeDays: uptime(4, 99.95),
    dependencies: ["Database", "Queue"], runbook: "RB-WF-05 · Rolling runtime upgrade",
    maintenance: { window: "04 Oct 2026, 02:00 to 02:45 BST", note: "Rolling upgrade of the orchestration runtime. In-flight sessions drain; new sessions are routed to the standby pool. No customer impact expected." },
    events: [{ at: "03 Oct 09:30", text: "Maintenance window scheduled for 04 Oct 02:00", tone: "neutral" }, { at: "27 Sep 02:45", text: "INC-0405 planned maintenance completed", tone: "ok" }],
  },
  {
    id: "database", name: "Database", description: "Primary relational store and evidence metadata", status: "Operational", p50: 6, p95: 19, uptime30: 99.99, errors24h: 1,
    region: "UK South (London) · replica UK West", provider: "Managed Postgres (demo)", latency24h: latency(105, 6, 19, 0.05), uptimeDays: uptime(5, 99.97),
    dependencies: [], runbook: "RB-DB-01 · Failover and point-in-time recovery",
    events: [{ at: "02 Oct 03:00", text: "Nightly backup completed and verified", tone: "ok" }],
  },
  {
    id: "queue", name: "Queue", description: "Human-escalation and background job queues", status: "Operational", p50: 22, p95: 64, uptime30: 99.96, errors24h: 5,
    region: "UK South (London)", provider: "Managed message queue (demo)", latency24h: latency(106, 22, 64, 0.2), uptimeDays: uptime(6, 99.9, { 5: 99.5 }),
    dependencies: ["Database"], runbook: "RB-QUEUE-02 · Escalation queue depth",
    events: [{ at: "03 Oct 13:20", text: "Escalation queue depth peaked at 6, within threshold of 10", tone: "neutral" }],
  },
  {
    id: "notifications", name: "Notifications", description: "SMS, email and webhook delivery", status: "Operational", p50: 410, p95: 1300, uptime30: 99.9, errors24h: 9,
    region: "UK South (London)", provider: "SMS and email gateways (demo)", latency24h: latency(107, 410, 1300, 0.4), uptimeDays: uptime(7, 99.8, { 25: 99.1 }),
    dependencies: ["Queue"], runbook: "RB-NOTIFY-01 · Carrier throttling",
    events: [{ at: "02 Oct 16:58", text: "INC-0411 resolved: SMS delays cleared", tone: "ok" }],
  },
  {
    id: "media", name: "Media Gateway", description: "Frame ingest, transcoding and secure storage", status: "Operational", p50: 120, p95: 340, uptime30: 99.94, errors24h: 11,
    region: "UK South (London)", provider: "Object storage and transcoder (demo)", latency24h: latency(108, 120, 340, 0.45), uptimeDays: uptime(8, 99.9),
    dependencies: ["Database"], runbook: "RB-MEDIA-02 · Frame ingest backlog",
    events: [{ at: "01 Oct 22:10", text: "Retention purge job completed (1,842 objects)", tone: "ok" }],
  },
];

export const serviceById = (id: string) => services.find((s) => s.id === id);

export const fallbackPaths: FallbackPath[] = [
  { id: "voice-only", name: "Revert to voice-only", trigger: "Camera or video connection fails, or customer revokes camera consent", behaviour: "Session continues over audio with the workflow's voice-only branch; visual steps are skipped and flagged.", status: "Ready", last24h: 18, lastTested: "02 Oct 2026" },
  { id: "still-image", name: "Ask for a still image", trigger: "Live video quality too low for analysis (poor network)", behaviour: "AI asks the customer to capture a single high-resolution photo and uploads it as evidence.", status: "Active", last24h: 41, lastTested: "02 Oct 2026" },
  { id: "human", name: "Transfer to human", trigger: "Low confidence, policy block, safety rule or customer request", behaviour: "Warm handover to the escalation queue with summary, frames and uncertainty flags.", status: "Ready", last24h: 37, lastTested: "03 Oct 2026" },
  { id: "callback", name: "Create callback", trigger: "No human available within wait threshold", behaviour: "Customer is offered a scheduled callback; case is created with captured evidence attached.", status: "Ready", last24h: 4, lastTested: "30 Sep 2026" },
];

export const latencyBudget: BudgetStage[] = [
  { id: "capture", label: "Capture", budgetMs: 250, actualMs: 190, detail: "Camera frame to uplink" },
  { id: "select", label: "Select", budgetMs: 150, actualMs: 120, detail: "Frame quality and trigger selection" },
  { id: "inference", label: "Inference", budgetMs: 1200, actualMs: 2650, detail: "Multimodal analysis (Visual AI, INC-0412)" },
  { id: "response", label: "Response", budgetMs: 400, actualMs: 360, detail: "Policy check, dialogue and speech output" },
];

/** Deterministic timeline for an incident (visual demo). */
export function incidentUpdates(inc: Incident, resolvedLocally: boolean): IncidentUpdate[] {
  const hhmm = inc.startedAt.split(", ")[1] ?? "00:00";
  const [h, m] = hhmm.split(":").map(Number);
  const at = (add: number) => { const t = h * 60 + m + add; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const ups: IncidentUpdate[] = [
    { at: at(0), state: "Investigating", text: `Alert fired for ${inc.service}. On-call engineer paged.` },
    { at: at(8), state: "Investigating", text: "Impact assessed. " + inc.impact + "." },
    { at: at(23), state: "Mitigating", text: inc.summary.split(". ")[0] + "." },
  ];
  if (inc.state === "monitoring" || inc.state === "resolved") ups.push({ at: at(Math.min(inc.durationMin, 45)), state: "Monitoring", text: "Mitigation applied. Metrics under observation." });
  if (inc.state === "resolved" || resolvedLocally) ups.push({ at: at(inc.state === "resolved" ? inc.durationMin : 180), state: "Resolved", text: resolvedLocally && inc.state !== "resolved" ? "Marked resolved by administrator (demo)." : "Service restored. Post-incident review scheduled." });
  return ups;
}
