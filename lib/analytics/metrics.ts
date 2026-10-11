import type { SessionState } from "@/lib/domain/session";
import type { CostEvent, EscalationReasonCode, SessionOutcome } from "@/lib/domain/types";

/**
 * Operational and unit-economics metrics (docs/01 §8.9, §11), derived purely
 * from session records so every number is traceable to sessions and events.
 */

export interface Metrics {
  sessions: number;
  completed: number;
  aiResolved: number;
  humanResolved: number;
  escalated: number;
  abandoned: number;
  failed: number;
  aiResolutionRate: number;
  escalationRate: number;
  firstContactResolutionRate: number;
  avgDurationSec: number;
  avgFramesPerSession: number;
  framesTotal: number;
  uncertainObservationRate: number;
  visualConfidenceEscalations: number;
  workflowCompletionRate: number;
  avgQueueWaitSec: number;
  avgHumanHandlingSec: number;
  costTotal: number;
  costPerSession: number;
  costPerResolution: number;
  businessActions: number;
  businessActionSuccessRate: number;
}

const DONE = new Set(["completed", "failed"]);

export function computeMetrics(states: SessionState[]): Metrics {
  const started = states.filter((s) => s.session.startedAt);
  const ended = started.filter((s) => DONE.has(s.session.status));
  const count = (o: SessionOutcome) => ended.filter((s) => s.session.outcome === o).length;
  const aiResolved = count("resolved_by_ai");
  const humanResolved = count("resolved_by_human");
  const escalated = started.filter((s) => s.escalation).length;
  const durations = ended.map((s) => (Date.parse(s.session.endedAt!) - Date.parse(s.session.startedAt!)) / 1000);
  const frames = started.reduce((n, s) => n + s.visualEvents.length, 0);
  const observations = started.flatMap((s) => s.observations);
  const uncertain = observations.filter((o) => !["confirmed_visible", "likely_visible", "not_visible"].includes(o.status)).length;
  const waits = started
    .filter((s) => s.escalation?.acceptedAt)
    .map((s) => (Date.parse(s.escalation!.acceptedAt!) - Date.parse(s.escalation!.requestedAt)) / 1000);
  const handling = ended
    .map((s) => {
      const took = s.audit.find((a) => a.eventType === "human.took_over");
      return took ? (Date.parse(s.session.endedAt!) - Date.parse(took.timestamp)) / 1000 : undefined;
    })
    .filter((x): x is number => x !== undefined);
  const costTotal = states.reduce((n, s) => n + s.session.costTotal, 0);
  const actions = started.flatMap((s) => s.toolActions.filter((a) => a.status !== "denied" && a.status !== "duplicate_blocked"));
  const workflowsFinished = started.filter((s) => s.audit.some((a) => a.eventType === "workflow.completed") || s.escalation).length;

  return {
    sessions: started.length,
    completed: ended.length,
    aiResolved,
    humanResolved,
    escalated,
    abandoned: count("customer_abandoned"),
    failed: count("failed"),
    aiResolutionRate: safe(aiResolved, ended.length),
    escalationRate: safe(escalated, started.length),
    firstContactResolutionRate: safe(aiResolved + humanResolved, ended.length),
    avgDurationSec: avg(durations),
    avgFramesPerSession: safe(frames, started.length),
    framesTotal: frames,
    uncertainObservationRate: safe(uncertain, observations.length),
    visualConfidenceEscalations: started.filter((s) => s.escalation && ["low_visual_confidence", "repeated_capture_failure"].includes(s.escalation.reason)).length,
    workflowCompletionRate: safe(workflowsFinished, started.length),
    avgQueueWaitSec: avg(waits),
    avgHumanHandlingSec: avg(handling),
    costTotal,
    costPerSession: safe(costTotal, started.length),
    costPerResolution: safe(costTotal, aiResolved + humanResolved),
    businessActions: actions.length,
    businessActionSuccessRate: safe(actions.filter((a) => a.status === "completed").length, actions.length),
  };
}

export interface DailyPoint {
  day: string;
  sessions: number;
  aiResolved: number;
  humanResolved: number;
  escalated: number;
  other: number;
  cost: number;
}

export function dailySeries(states: SessionState[], days: number, now = Date.now()): DailyPoint[] {
  const out: DailyPoint[] = [];
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d0 = start.getTime() - i * 86_400_000;
    const d1 = d0 + 86_400_000;
    const inDay = states.filter((s) => s.session.startedAt && Date.parse(s.session.startedAt) >= d0 && Date.parse(s.session.startedAt) < d1);
    const ai = inDay.filter((s) => s.session.outcome === "resolved_by_ai").length;
    const human = inDay.filter((s) => s.session.outcome === "resolved_by_human").length;
    const esc = inDay.filter((s) => s.escalation && s.session.outcome !== "resolved_by_human").length;
    out.push({
      day: new Date(d0).toISOString(),
      sessions: inDay.length,
      aiResolved: ai,
      humanResolved: human,
      escalated: esc,
      other: Math.max(0, inDay.length - ai - human - esc),
      cost: inDay.reduce((n, s) => n + s.session.costTotal, 0),
    });
  }
  return out;
}

export function escalationReasons(states: SessionState[]): { reason: EscalationReasonCode; count: number }[] {
  const m = new Map<EscalationReasonCode, number>();
  for (const s of states) if (s.escalation) m.set(s.escalation.reason, (m.get(s.escalation.reason) ?? 0) + 1);
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function outcomeBreakdown(states: SessionState[]): { outcome: SessionOutcome; count: number }[] {
  const m = new Map<SessionOutcome, number>();
  for (const s of states) if (s.session.outcome && DONE.has(s.session.status)) m.set(s.session.outcome, (m.get(s.session.outcome) ?? 0) + 1);
  return [...m.entries()].map(([outcome, count]) => ({ outcome, count })).sort((a, b) => b.count - a.count);
}

/** How many sessions reached each workflow step — the workflow funnel. */
export function stepFunnel(states: SessionState[]): Map<string, { entered: number; completed: number; failed: number }> {
  const m = new Map<string, { entered: number; completed: number; failed: number }>();
  for (const s of states) {
    const seen = new Set<string>();
    for (const h of s.workflow.history) {
      const row = m.get(h.stepKey) ?? { entered: 0, completed: 0, failed: 0 };
      if (!seen.has(h.stepKey)) row.entered += 1;
      if (h.status === "completed") row.completed += 1;
      if (h.status === "failed") row.failed += 1;
      seen.add(h.stepKey);
      m.set(h.stepKey, row);
    }
  }
  return m;
}

export function costByCategory(states: SessionState[]): { category: CostEvent["category"]; cost: number; quantity: number; unit: string }[] {
  const m = new Map<CostEvent["category"], { cost: number; quantity: number; unit: string }>();
  for (const s of states)
    for (const c of s.costs) {
      const row = m.get(c.category) ?? { cost: 0, quantity: 0, unit: c.unit };
      row.cost += c.estimatedCost;
      row.quantity += c.quantity;
      m.set(c.category, row);
    }
  return [...m.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.cost - a.cost);
}

export function latencyStats(states: SessionState[]): { visionP50: number; visionP95: number; samples: number } {
  const xs = states
    .flatMap((s) => s.audit.filter((a) => a.eventType === "ai.observation_created").map((a) => Number(a.payload.latencyMs)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const q = (p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : NaN);
  return { visionP50: q(0.5), visionP95: q(0.95), samples: xs.length };
}

function safe(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
