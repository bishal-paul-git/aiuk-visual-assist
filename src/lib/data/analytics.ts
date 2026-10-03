import type { ClientId } from "../types";
import { combinedSeries, failureReasons, allClientIds, type DayPoint } from "./metrics";
import { workflows } from "./workflows";
import { agents } from "./agents";
import { clients } from "./clients";

export type RangeId = "7d" | "14d" | "30d";
export const rangeDays: Record<RangeId, number> = { "7d": 7, "14d": 14, "30d": 30 };

/** Share of a client's traffic handled by each workflow / agent (deterministic demo weights). */
const WF_SHARE: Record<string, number> = { "boiler-visual-triage": 0.84, "meter-reading-assist": 0.16 };
const AG_SHARE: Record<string, number> = { ava: 0.94, "ava-cy": 0.06 };
export const workflowShare = (id: string) => WF_SHARE[id] ?? 1;
export const agentShare = (id: string) => AG_SHARE[id] ?? 1;

export interface Filters { client: ClientId | "all"; workflow: string; agent: string; range: RangeId }

export function effectiveClients(f: Filters): ClientId[] {
  const wf = workflows.find((w) => w.id === f.workflow);
  if (wf) return [wf.clientId];
  const ag = agents.find((a) => a.id === f.agent);
  if (ag) return [ag.clientId];
  return f.client === "all" ? allClientIds : [f.client];
}

function scaled(series: DayPoint[], share: number, tilt: number): DayPoint[] {
  if (share === 1 && tilt === 0) return series;
  return series.map((d) => ({
    ...d, sessions: Math.round(d.sessions * share), failed: Math.round(d.failed * share), visitsAvoided: Math.round(d.visitsAvoided * share), cost: +(d.cost * share).toFixed(2),
    aiResolved: +Math.min(95, d.aiResolved + tilt).toFixed(1), escalated: +Math.max(3, d.escalated - tilt).toFixed(1),
    confidence: +Math.min(0.97, d.confidence + tilt / 400).toFixed(2), workflowCompletion: +Math.min(98, d.workflowCompletion + tilt).toFixed(1),
  }));
}

/** Returns the current window, the prior window of equal length (for deltas) and the traffic share applied. */
export function analyticsData(f: Filters) {
  const n = rangeDays[f.range];
  const ids = effectiveClients(f);
  const full = combinedSeries(ids, 60);
  const wfShare = f.workflow !== "all" ? workflowShare(f.workflow) : 1;
  const agShare = f.agent !== "all" ? agentShare(f.agent) : 1;
  const share = wfShare * agShare;
  const tilt = (f.workflow !== "all" ? (f.workflow === "meter-reading-assist" ? -4 : 1) : 0) + (f.agent !== "all" ? (f.agent === "ava-cy" ? -3 : 0.5) : 0);
  const s = scaled(full, share, tilt);
  const cur = s.slice(-n), prev = s.slice(-2 * n, -n);
  return { cur, prev, share, ids };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const wavg = (p: DayPoint[], g: (d: DayPoint) => number) => sum(p.map((d) => g(d) * d.sessions)) / (sum(p.map((d) => d.sessions)) || 1);

export interface Summary { label: string; value: number; prev: number; fmt: "int" | "pct" | "dur" | "conf" | "gbp"; goodWhenUp: boolean; spark: number[] }
export function summarise(cur: DayPoint[], prev: DayPoint[]): Summary[] {
  const mk = (label: string, g: (p: DayPoint[]) => number, fmt: Summary["fmt"], goodWhenUp: boolean, sp: (d: DayPoint) => number): Summary => ({ label, value: g(cur), prev: g(prev), fmt, goodWhenUp, spark: cur.map(sp) });
  return [
    mk("Sessions", (p) => sum(p.map((d) => d.sessions)), "int", true, (d) => d.sessions),
    mk("AI resolution rate", (p) => wavg(p, (d) => d.aiResolved), "pct", true, (d) => d.aiResolved),
    mk("Human escalation rate", (p) => wavg(p, (d) => d.escalated), "pct", false, (d) => d.escalated),
    mk("Avg session duration", (p) => wavg(p, (d) => d.avgDurationSec), "dur", false, (d) => d.avgDurationSec),
    mk("Visual confidence", (p) => wavg(p, (d) => d.confidence), "conf", true, (d) => d.confidence),
    mk("Visits avoided", (p) => sum(p.map((d) => d.visitsAvoided)), "int", true, (d) => d.visitsAvoided),
  ];
}
export const deltaPct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

export function failureBreakdown(cur: DayPoint[]) {
  const total = sum(failureReasons.map((r) => r.count));
  const failed = sum(cur.map((d) => d.failed));
  return failureReasons.map((r) => ({ reason: r.reason, count: Math.max(0, Math.round((r.count / total) * failed)) }));
}

export function workflowTable(f: Filters, range: RangeId) {
  const n = rangeDays[range];
  return workflows.filter((w) => (f.client === "all" || w.clientId === f.client) && (f.workflow === "all" || f.workflow === w.id) && (f.agent === "all" || agents.find((a) => a.id === f.agent)?.workflowIds.includes(w.id))).map((w) => {
    const s = scaled(combinedSeries([w.clientId], 30), workflowShare(w.id), w.id === "meter-reading-assist" ? -4 : 0).slice(-n);
    return {
      id: w.id, name: w.name, client: clients.find((c) => c.id === w.clientId)!.name, status: w.status, sessions: sum(s.map((d) => d.sessions)),
      ai: wavg(s, (d) => d.aiResolved), completion: wavg(s, (d) => d.workflowCompletion), confidence: wavg(s, (d) => d.confidence), avoided: sum(s.map((d) => d.visitsAvoided)), cost: sum(s.map((d) => d.cost)),
    };
  });
}
