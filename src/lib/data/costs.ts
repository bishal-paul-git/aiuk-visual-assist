import type { ClientId } from "../types";
import type { CostCategory, CostCategoryId } from "../types/costs";
import { combinedSeries, dailySeries, allClientIds } from "./metrics";
import { workflows } from "./workflows";
import { workflowShare } from "./analytics";
import { clients } from "./clients";

/** ALL figures in this file are FICTIONAL demo data. No provider billing is read. */
export const DEMO_LABEL = "FICTIONAL DEMO DATA";

/** Share of an average interaction's cost by category (mirrors the per-session cost lines in session detail). Sums to 1. */
export const categoryDefs: { id: CostCategoryId; label: string; provider: string; share: number }[] = [
  { id: "video", label: "Video transport", provider: "Twilio Video", share: 0.14 },
  { id: "voice", label: "Voice AI", provider: "ElevenLabs", share: 0.25 },
  { id: "model", label: "Multimodal model", provider: "Anthropic", share: 0.23 },
  { id: "compute", label: "Application compute", provider: "AIUK platform", share: 0.05 },
  { id: "orchestration", label: "Workflow orchestration", provider: "n8n", share: 0.03 },
  { id: "storage", label: "Storage", provider: "AIUK platform", share: 0.01 },
  { id: "human", label: "Human handling time", provider: "Contact centre", share: 0.29 },
];

export const ASSUMED_VISIT_COST = 145; // £ per engineer visit (assumption, fictional)

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r2 = (n: number) => +n.toFixed(2);

export interface CostSummary {
  totalSpend: number; sessions: number; perSession: number; resolved: number; perResolved: number; humanShare: number; projected: number; visitsAvoided: number;
  categories: CostCategory[];
}

export function costSummary(): CostSummary {
  const s = combinedSeries(allClientIds, 30);
  const totalSpend = sum(s.map((d) => d.cost));
  const sessions = sum(s.map((d) => d.sessions));
  const resolved = sum(s.map((d) => (d.sessions * d.aiResolved) / 100)) + sum(s.map((d) => d.sessions * d.escalated / 100 * 0.9));
  const perSession = totalSpend / sessions;
  return {
    totalSpend: r2(totalSpend), sessions, perSession: r2(perSession), resolved: Math.round(resolved), perResolved: r2(totalSpend / resolved),
    humanShare: categoryDefs.find((c) => c.id === "human")!.share, projected: r2(totalSpend * 1.045), visitsAvoided: sum(s.map((d) => d.visitsAvoided)),
    categories: categoryDefs.map((c) => ({ id: c.id, label: c.label, provider: c.provider, share: c.share, perSession: r2(perSession * c.share) })),
  };
}

export function costByClient() {
  return clients.map((c) => {
    const s = dailySeries(c.id as ClientId, 30);
    const total = sum(s.map((d) => d.cost)), n = sum(s.map((d) => d.sessions));
    return { id: c.id, name: c.name, total: r2(total), sessions: n, perSession: r2(total / n) };
  });
}

export function costByWorkflow() {
  return workflows.map((w) => {
    const s = dailySeries(w.clientId, 30);
    const sh = workflowShare(w.id);
    const total = sum(s.map((d) => d.cost)) * sh, n = Math.round(sum(s.map((d) => d.sessions)) * sh);
    return { id: w.id, name: w.name, client: clients.find((c) => c.id === w.clientId)!.name, total: r2(total), sessions: n, perSession: n ? r2(total / n) : 0 };
  });
}

export const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
/** 6-month history by category. Human share falls and model share rises as AI resolution improves (fictional). */
export function monthlyTrend() {
  const cur = costSummary().totalSpend;
  return MONTHS.map((m, i) => {
    const total = cur * (0.52 + i * 0.095);
    const drift = (5 - i) * 0.012;
    const shares: Record<CostCategoryId, number> = { video: 0.14, voice: 0.25, model: 0.23 - drift * 0.5, compute: 0.05, orchestration: 0.03, storage: 0.01, human: 0.29 + drift * 0.5 };
    const row: Record<string, number | string> = { month: m, total: r2(total) };
    (Object.keys(shares) as CostCategoryId[]).forEach((k) => { row[k] = r2(total * shares[k]); });
    return row;
  });
}

export function providerBreakdown() {
  const { totalSpend } = costSummary();
  const defs = [
    { name: "Twilio Video", cat: "video", basis: "participant-minutes", unit: 0.0042 },
    { name: "ElevenLabs", cat: "voice", basis: "conversational minutes", unit: 0.058 },
    { name: "Anthropic (multimodal)", cat: "model", basis: "frames + tokens", unit: 0.0031 },
    { name: "n8n", cat: "orchestration", basis: "executions", unit: 0.0009 },
    { name: "AIUK compute", cat: "compute", basis: "gateway CPU-hours", unit: 0.21 },
    { name: "Storage", cat: "storage", basis: "GB-months", unit: 0.019 },
    { name: "Contact centre", cat: "human", basis: "handling minutes", unit: 0.46 },
  ] as const;
  return defs.map((d) => {
    const spend = totalSpend * categoryDefs.find((c) => c.id === d.cat)!.share;
    return { name: d.name, basis: d.basis, unitCost: d.unit, volume: Math.round(spend / d.unit), spend: r2(spend), share: categoryDefs.find((c) => c.id === d.cat)!.share };
  });
}

/** What-if model: cost per interaction as a function of frames analysed and escalation rate. */
export const BASELINE = { frames: 12, escalation: 28 };
export function whatIf(frames: number, escalationPct: number, visitCost: number) {
  const per = costSummary().perSession;
  const b = BASELINE;
  const fixed = per * (0.14 + 0.25 + 0.05 + 0.03 + 0.01);
  const perFrame = (per * 0.23 * 0.5) / b.frames; // half of model cost scales with frames (rest is text/context)
  const modelFixed = per * 0.23 * 0.5;
  const humanPerEsc = (per * 0.29) / (b.escalation / 100);
  const cost = fixed + modelFixed + perFrame * frames + humanPerEsc * (escalationPct / 100);
  const avoidedPerSession = Math.max(0, (1 - escalationPct / 100 - 0.04)) * 0.4;
  const value = avoidedPerSession * visitCost;
  return { cost: r2(cost), avoidedPerSession: +avoidedPerSession.toFixed(3), value: r2(value), net: r2(value - cost), ratio: cost ? +(value / cost).toFixed(1) : 0 };
}

export const formulaTerms = [
  "video_transport", "voice_ai", "multimodal_text", "selected_visual_frames", "application_compute", "orchestration", "storage", "monitoring", "human_agent_cost_if_escalated",
];
