import type { ClientId, ConnectionQuality, Session, SessionStatus, SceneKind } from "../types";

/** Fixed demo clock so server and client render identically. */
export const DEMO_NOW = "03 Oct 2026, 14:32 BST";

// Deterministic PRNG so mock data is stable between renders.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface Seed {
  id: string; clientId: ClientId; wf: string; wfName: string; wfVer: string; agent: string; agentName: string;
  scene: SceneKind; customer: string; humanAgents: string[];
}

const SEEDS: Record<ClientId, Seed> = {
  clearwave: { id: "cw", clientId: "clearwave", wf: "router-troubleshooting", wfName: "Router Troubleshooting", wfVer: "v3", agent: "ava", agentName: "Ava", scene: "router_front", customer: "", humanAgents: ["Priya Nair", "Daniel Hughes", "Megan Foster"] },
  northstar: { id: "ns", clientId: "northstar", wf: "boiler-visual-triage", wfName: "Boiler Visual Triage", wfVer: "v2", agent: "sophie", agentName: "Sophie", scene: "boiler_panel", customer: "", humanAgents: ["Tom Ellery", "Aisha Rahman"] },
  horizon: { id: "hz", clientId: "horizon", wf: "property-damage-capture", wfName: "Property Damage Capture", wfVer: "v1", agent: "ella", agentName: "Ella", scene: "damage_wall", customer: "", humanAgents: ["Claire Bennett", "Jonas Weber"] },
};

const customers = ["J. Morrison", "A. Kapoor", "S. Lindqvist", "R. Davies", "M. O'Neill", "H. Tanaka", "L. Fraser", "B. Adeyemi", "C. Whitaker", "E. Moreau", "P. Singh", "D. Walsh", "K. Novak", "T. Hargreaves", "N. Okoye", "F. Bishop"];
const channels = ["QR code", "SMS link", "Web journey", "Support portal"] as const;
const reasons = ["Low visual confidence", "Customer requested a human", "Prohibited workflow step", "Repeated failed capture", "Safety rule triggered", "Media connection failure"];

const live: { status: SessionStatus; owner: "AI" | "Human"; client: ClientId; dur: number; conf: number; conn: ConnectionQuality; esc?: string }[] = [
  { status: "human_joined", owner: "Human", client: "clearwave", dur: 372, conf: 0.58, conn: "good", esc: "Low visual confidence" },
  { status: "ai_handling", owner: "AI", client: "clearwave", dur: 134, conf: 0.91, conn: "excellent" },
  { status: "analysing", owner: "AI", client: "northstar", dur: 211, conf: 0.84, conn: "good" },
  { status: "awaiting_evidence", owner: "AI", client: "northstar", dur: 96, conf: 0.77, conn: "fair" },
  { status: "escalating", owner: "AI", client: "horizon", dur: 288, conf: 0.52, conn: "good", esc: "Customer requested a human" },
  { status: "ai_handling", owner: "AI", client: "clearwave", dur: 58, conf: 0.89, conn: "good" },
  { status: "awaiting_evidence", owner: "AI", client: "clearwave", dur: 187, conf: 0.69, conn: "poor" },
  { status: "ai_handling", owner: "AI", client: "horizon", dur: 244, conf: 0.86, conn: "excellent" },
];

const sceneFor = (c: ClientId, i: number): SceneKind =>
  c === "clearwave" ? (["router_front", "router_lights", "router_rear"] as const)[i % 3]
  : c === "northstar" ? (["boiler_panel", "boiler_pressure"] as const)[i % 2]
  : (["damage_wall", "damage_vehicle"] as const)[i % 2];

function build(): Session[] {
  const r = rng(27413);
  const out: Session[] = [];

  // The primary demo session — values come straight from the product spec.
  out.push({
    id: "VA-27413", clientId: "clearwave", workflowId: "router-troubleshooting", workflowName: "Router Troubleshooting", workflowVersion: "v3",
    agentId: "ava", agentName: "Ava", status: "resolved", owner: "Human", customer: "J. Morrison", channel: "QR code",
    startedAt: "03 Oct 2026, 13:18", durationSec: 372, aiDurationSec: 288, humanDurationSec: 84, framesAnalysed: 14, aiConfidence: 0.61,
    connection: "good", escalated: true, escalationReason: "Low visual confidence", outcome: "Resolved by human", cost: 0.84,
    scene: "router_lights", humanAgent: "Priya Nair", modelVersion: "vision-4.2 (demo)", policyVersion: "POL-VC v2.3",
  });

  // Live / in-flight sessions
  live.forEach((l, i) => {
    const seed = SEEDS[l.client];
    const n = 27420 + i;
    out.push({
      id: `VA-${n + 8}`, clientId: l.client, workflowId: seed.wf, workflowName: seed.wfName, workflowVersion: seed.wfVer,
      agentId: seed.agent, agentName: seed.agentName, status: l.status, owner: l.owner, customer: customers[i], channel: channels[i % 4],
      startedAt: `03 Oct 2026, 14:${String(32 - Math.ceil(l.dur / 60)).padStart(2, "0")}`, durationSec: l.dur,
      aiDurationSec: l.owner === "Human" ? Math.round(l.dur * 0.6) : l.dur, humanDurationSec: l.owner === "Human" ? Math.round(l.dur * 0.4) : 0,
      framesAnalysed: Math.max(1, Math.round(l.dur / 28)), aiConfidence: l.conf, connection: l.conn,
      escalated: !!l.esc, escalationReason: l.esc, outcome: "In progress", cost: +(l.dur * 0.0021).toFixed(2),
      scene: sceneFor(l.client, i), humanAgent: l.owner === "Human" ? seed.humanAgents[0] : undefined,
      modelVersion: "vision-4.2 (demo)", policyVersion: "POL-VC v2.3",
    });
  });

  // Historical sessions
  const clientsArr: ClientId[] = ["clearwave", "clearwave", "northstar", "clearwave", "horizon", "northstar"];
  for (let i = 0; i < 34; i++) {
    const c = clientsArr[Math.floor(r() * clientsArr.length)];
    const seed = SEEDS[c];
    const roll = r();
    const failed = roll > 0.95;
    const escalated = !failed && roll > 0.68;
    const dur = Math.round(150 + r() * 420);
    const aiShare = escalated ? 0.45 + r() * 0.3 : 1;
    const ai = Math.round(dur * aiShare);
    const day = i < 14 ? "03" : i < 26 ? "02" : "01";
    const hour = 8 + Math.floor(r() * 10);
    const frames = Math.max(4, Math.round(dur / 30 + r() * 4));
    const conf = failed ? 0.4 + r() * 0.2 : escalated ? 0.5 + r() * 0.2 : 0.8 + r() * 0.17;
    const cost = +(0.35 + dur * 0.0011 + (escalated ? 0.28 : 0) + r() * 0.1).toFixed(2);
    out.push({
      id: `VA-${27412 - i}`, clientId: c, workflowId: seed.wf, workflowName: seed.wfName, workflowVersion: seed.wfVer,
      agentId: seed.agent, agentName: seed.agentName, status: failed ? "failed" : "resolved", owner: escalated ? "Human" : "AI",
      customer: customers[(i + 3) % customers.length], channel: channels[Math.floor(r() * 4)],
      startedAt: `${day} Oct 2026, ${String(hour).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}`,
      durationSec: dur, aiDurationSec: ai, humanDurationSec: dur - ai, framesAnalysed: frames, aiConfidence: +conf.toFixed(2),
      connection: failed ? "poor" : (["excellent", "good", "good", "fair"] as const)[Math.floor(r() * 4)],
      escalated, escalationReason: escalated ? reasons[Math.floor(r() * reasons.length)] : failed ? "Media connection failure" : undefined,
      outcome: failed ? "Failed — customer disconnected" : escalated ? "Resolved by human" : r() > 0.78 ? "Case created" : "Resolved by AI",
      cost, scene: sceneFor(c, i), humanAgent: escalated ? seed.humanAgents[Math.floor(r() * seed.humanAgents.length)] : undefined,
      modelVersion: "vision-4.2 (demo)", policyVersion: "POL-VC v2.3",
    });
  }
  return out;
}

export const sessions: Session[] = build();
export const sessionById = (id: string) => sessions.find((s) => s.id === id);
export const isLiveStatus = (s: SessionStatus) => !["resolved", "failed"].includes(s);

export const statusMeta: Record<SessionStatus, { label: string; tone: "ok" | "info" | "warn" | "bad" | "human" | "neutral" }> = {
  ai_handling: { label: "AI handling", tone: "info" },
  awaiting_evidence: { label: "Awaiting visual evidence", tone: "warn" },
  analysing: { label: "Analysing", tone: "info" },
  escalating: { label: "Escalating", tone: "warn" },
  human_joined: { label: "Human joined", tone: "human" },
  resolved: { label: "Resolved", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};

export function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export const gbp = (n: number, dp = 2) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
