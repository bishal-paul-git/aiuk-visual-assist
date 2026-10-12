import type { SessionState } from "@/lib/domain/session";
import type { EscalationReasonCode } from "@/lib/domain/types";

/**
 * Deterministic sampling of completed sessions for human QA review (docs/08 §2,
 * docs/05 §7).
 *
 * Every session that escalated because the visual evidence was uncertain, that
 * escalated because the model failed, or that has an observation a human
 * rejected is always sampled. A further share of AI-resolved sessions is
 * sampled at random, seeded by the session id: the same session is always in
 * or out for a given rate, and raising the rate only adds sessions.
 *
 * Pure and isomorphic.
 */

export type SampleReason = "uncertainty_escalation" | "model_failure" | "human_rejected" | "random_ai_resolved";

export const SAMPLE_REASON_LABELS: Record<SampleReason, string> = {
  uncertainty_escalation: "Escalated: visual evidence unclear",
  model_failure: "Escalated: AI model failure",
  human_rejected: "Observation rejected by a human",
  random_ai_resolved: "Random sample of AI-resolved sessions",
};

export interface SamplingConfig {
  /** Share of AI-resolved sessions sampled at random, 0..1. */
  aiResolvedRate: number;
  /** Changes which AI-resolved sessions fall in the sample, without changing the rate. */
  salt?: string;
}

export const DEFAULT_AI_RESOLVED_RATE = 0.2;

const UNCERTAINTY_REASONS: EscalationReasonCode[] = ["low_visual_confidence", "repeated_capture_failure"];
const FAILURE_REASONS: EscalationReasonCode[] = ["ai_model_failure"];

/** FNV-1a 32-bit hash mapped to [0, 1). Stable across runtimes and processes. */
export function hashUnit(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/** A session is reviewable once it has ended. */
export function isCompleted(st: SessionState): boolean {
  return Boolean(st.session.endedAt) || st.session.status === "completed" || st.session.status === "failed";
}

/** Clamp a configured rate to 0..1; percentages above 1 are read as percent. */
export function normaliseRate(value: number | string | undefined, fallback = DEFAULT_AI_RESOLVED_RATE): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === undefined || !Number.isFinite(n) || n < 0) return fallback;
  const r = n > 1 ? n / 100 : n;
  return Math.min(1, r);
}

/** Why a completed session is in the review sample; empty when it is not sampled. */
export function sampleReasons(st: SessionState, config: SamplingConfig): SampleReason[] {
  if (!isCompleted(st)) return [];
  const reasons: SampleReason[] = [];
  const escalationReason = st.escalation?.reason ?? st.session.escalationReason;
  if (escalationReason && UNCERTAINTY_REASONS.includes(escalationReason)) reasons.push("uncertainty_escalation");
  if (escalationReason && FAILURE_REASONS.includes(escalationReason)) reasons.push("model_failure");
  if (st.observations.some((o) => o.humanReview?.verdict === "rejected")) reasons.push("human_rejected");
  if (st.session.outcome === "resolved_by_ai" && hashUnit(`${config.salt ?? "qa"}:${st.session.id}`) < config.aiResolvedRate) reasons.push("random_ai_resolved");
  return reasons;
}

export interface SampledSession {
  state: SessionState;
  reasons: SampleReason[];
}

/** Completed sessions in the review sample, newest first. */
export function sampleSessions(states: SessionState[], config: SamplingConfig): SampledSession[] {
  return states
    .map((state) => ({ state, reasons: sampleReasons(state, config) }))
    .filter((s) => s.reasons.length > 0)
    .sort((a, b) => (b.state.session.endedAt ?? "").localeCompare(a.state.session.endedAt ?? "") || a.state.session.id.localeCompare(b.state.session.id));
}
