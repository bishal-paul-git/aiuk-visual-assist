import type { Session } from "../types";
import type { QaFlag, QaMetrics, FlagKind } from "../types/qa";
import type { QaState } from "../store";
import { getSessionDetail } from "./session-details";

/** Stable string hash -> 0..1 (FNV-1a). No Math.random anywhere: values are identical on server and client. */
export function hash01(s: string, salt = ""): number {
  let h = 2166136261;
  const str = s + "|" + salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

export const qaStateMeta: Record<QaState, { label: string; tone: "neutral" | "info" | "ok" | "bad" | "warn" }> = {
  pending: { label: "Awaiting review", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  needs_coaching: { label: "Needs coaching", tone: "warn" },
  rejected: { label: "Rejected", tone: "bad" },
};
export const flagLabel: Record<FlagKind, string> = { hallucination: "Possible hallucination", low_confidence: "Low confidence", conflicting_evidence: "Conflicting evidence", unreadable: "Unreadable" };

const cache = new Map<string, QaMetrics>();

export function qaMetricsFor(s: Session): QaMetrics {
  const hit = cache.get(s.id);
  if (hit) return hit;
  const d = getSessionDetail(s.id);
  const flags: QaFlag[] = [];
  d?.observations.forEach((o, i) => {
    let kind: FlagKind | null = null;
    if (o.status === "unreadable") kind = "unreadable";
    else if (o.status === "conflicting_evidence") kind = "conflicting_evidence";
    else if (o.confidence < 0.7) kind = "low_confidence";
    else if (o.confidence >= 0.85 && hash01(s.id, "h" + i) > 0.965) kind = "hallucination"; // high-confidence claim a reviewer should verify
    if (kind) flags.push({ sessionId: s.id, observationId: o.id, kind, text: o.text, confidence: o.confidence });
  });
  const r = (k: string) => hash01(s.id, k);
  const accuracy = Math.round(Math.max(52, Math.min(99, 95 - flags.length * 6 - (s.aiConfidence < 0.7 ? 6 : 0) + (r("a") - 0.5) * 8)));
  const compliance = Math.round(Math.max(60, Math.min(100, 96 - (s.status === "failed" ? 12 : 0) + (r("c") - 0.6) * 12)));
  const escalation = Math.round(Math.max(55, Math.min(100, (s.escalated ? 90 : 95) - (s.aiConfidence < 0.7 && !s.escalated ? 18 : 0) + (r("e") - 0.5) * 10)));
  const score = Math.round(accuracy * 0.4 + compliance * 0.3 + escalation * 0.3);
  const roll = r("s");
  const baseState: QaState = roll < 0.55 ? "pending" : roll < 0.68 ? "in_review" : roll < 0.9 ? "approved" : roll < 0.96 ? "needs_coaching" : "rejected";
  const m: QaMetrics = { sessionId: s.id, score, accuracy, compliance, escalation, flags, baseState };
  cache.set(s.id, m);
  return m;
}

export const scoreTone = (n: number): "ok" | "info" | "warn" | "bad" => (n >= 90 ? "ok" : n >= 80 ? "info" : n >= 70 ? "warn" : "bad");

/** Static trend context for KPI sparklines (fictional prior-period series). */
export const qaTrends = {
  score: { delta: 1.8, spark: [84, 85, 84, 86, 85, 87, 88, 88] },
  accuracy: { delta: 2.4, spark: [86, 87, 88, 87, 89, 90, 90, 91] },
  compliance: { delta: 0.6, spark: [92, 91, 93, 93, 92, 94, 94, 94] },
  escalation: { delta: -1.1, spark: [92, 93, 92, 91, 92, 91, 91, 90] },
  awaiting: { delta: -8.0, spark: [24, 22, 25, 21, 20, 19, 18, 17] },
};
