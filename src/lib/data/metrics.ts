import type { ClientId, Incident } from "../types";

export interface DayPoint {
  date: string; // "20 Sep"
  sessions: number;
  aiResolved: number; // %
  escalated: number; // %
  failed: number; // count
  avgDurationSec: number;
  frames: number; // avg frames per session
  confidence: number; // avg 0..1
  workflowCompletion: number; // %
  visitsAvoided: number;
  cost: number; // total £
}

function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

const BASE: Record<ClientId, { vol: number; ai: number; dur: number; frames: number; cost: number; wf: number }> = {
  clearwave: { vol: 142, ai: 71, dur: 341, frames: 11, cost: 0.62, wf: 74 },
  northstar: { vol: 98, ai: 63, dur: 387, frames: 13, cost: 0.78, wf: 66 },
  horizon: { vol: 21, ai: 48, dur: 483, frames: 17, cost: 1.12, wf: 58 },
};

/** Daily series for a client (30 days ending 3 Oct 2026). */
export function dailySeries(clientId: ClientId, days = 30): DayPoint[] {
  const b = BASE[clientId];
  const r = rng(clientId.length * 977 + 13);
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 9, 3 - i));
    const wk = [0, 6].includes(d.getUTCDay()) ? 0.62 : 1;
    const growth = 1 + (days - i) * 0.006;
    const sessions = Math.round(b.vol * wk * growth * (0.9 + r() * 0.2));
    const ai = Math.min(92, b.ai + (days - i) * 0.12 + (r() - 0.5) * 6);
    const esc = Math.max(4, 100 - ai - 4 - r() * 3);
    const failed = Math.round(sessions * (0.015 + r() * 0.025));
    out.push({
      date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }), sessions,
      aiResolved: +ai.toFixed(1), escalated: +esc.toFixed(1), failed, avgDurationSec: Math.round(b.dur * (0.92 + r() * 0.16)),
      frames: +(b.frames * (0.9 + r() * 0.2)).toFixed(1), confidence: +(0.8 + r() * 0.07).toFixed(2),
      workflowCompletion: +(b.wf + (r() - 0.4) * 6).toFixed(1), visitsAvoided: Math.round(sessions * (ai / 100) * 0.42),
      cost: +(sessions * b.cost * (0.95 + r() * 0.1)).toFixed(2),
    });
  }
  return out;
}

export const allClientIds: ClientId[] = ["clearwave", "northstar", "horizon"];

export function combinedSeries(ids: ClientId[] = allClientIds, days = 30): DayPoint[] {
  const per = ids.map((c) => dailySeries(c, days));
  return per[0].map((_, i) => {
    const pts = per.map((p) => p[i]);
    const tot = pts.reduce((a, p) => a + p.sessions, 0) || 1;
    const w = (f: (p: DayPoint) => number) => +(pts.reduce((a, p) => a + f(p) * p.sessions, 0) / tot).toFixed(2);
    return {
      date: pts[0].date, sessions: tot, aiResolved: w((p) => p.aiResolved), escalated: w((p) => p.escalated),
      failed: pts.reduce((a, p) => a + p.failed, 0), avgDurationSec: Math.round(w((p) => p.avgDurationSec)), frames: w((p) => p.frames),
      confidence: w((p) => p.confidence), workflowCompletion: w((p) => p.workflowCompletion),
      visitsAvoided: pts.reduce((a, p) => a + p.visitsAvoided, 0), cost: +pts.reduce((a, p) => a + p.cost, 0).toFixed(2),
    };
  });
}

export const failureReasons = [
  { reason: "Customer disconnected", count: 41 },
  { reason: "Camera permission denied", count: 28 },
  { reason: "Poor network (media drop)", count: 23 },
  { reason: "Visual timeout", count: 11 },
  { reason: "No human available", count: 7 },
  { reason: "Tool timeout", count: 5 },
];

export const incidents: Incident[] = [
  { id: "INC-0412", title: "Elevated visual-inference latency (p95 > 4s)", service: "Visual AI", severity: "sev2", state: "monitoring", startedAt: "03 Oct 2026, 11:42", durationMin: 170, impact: "Frame analysis slower than SLO; no failed sessions", summary: "Upstream multimodal provider reported increased queue depth. Traffic shifted to secondary region at 12:05. p95 recovering; under observation." },
  { id: "INC-0411", title: "Notification delays to SMS provider", service: "Notifications", severity: "sev3", state: "resolved", startedAt: "02 Oct 2026, 16:20", durationMin: 38, impact: "SMS summaries delayed up to 6 minutes", summary: "Carrier throttling on bulk templates. Backoff tuned and queue drained." },
  { id: "INC-0409", title: "WebRTC TURN relay degraded — EU West", service: "WebRTC", severity: "sev2", state: "resolved", startedAt: "30 Sep 2026, 09:05", durationMin: 74, impact: "Higher reconnection rate for mobile networks", summary: "One TURN node unhealthy. Removed from pool and replaced." },
  { id: "INC-0405", title: "Workflow engine scheduled maintenance", service: "Workflow Engine", severity: "sev3", state: "resolved", startedAt: "27 Sep 2026, 02:00", durationMin: 45, impact: "No customer impact (planned)", summary: "Planned upgrade of orchestration runtime." },
];
