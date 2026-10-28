import type { EscalationReasonCode, ObservationStatus, SessionOutcome, SessionStatus } from "./types";
import type { CustomerUxState } from "./session";

export const ESCALATION_REASON_LABELS: Record<EscalationReasonCode, string> = {
  customer_requested: "Customer requested a person",
  low_visual_confidence: "Visual evidence unclear",
  repeated_capture_failure: "Repeated capture failure",
  human_only_step: "Human-only workflow step",
  safety_policy: "Safety policy triggered",
  regulated_action: "Regulated action required",
  ai_model_failure: "AI model failure",
  media_failure: "Media failure",
  workflow_failure: "Workflow / integration failure",
  max_ai_duration: "Maximum AI duration exceeded",
  out_of_scope: "Outside workflow scope",
  unresolved_after_workflow: "Unresolved after approved steps",
  agent_initiated: "Agent-initiated takeover",
};

export const OUTCOME_LABELS: Record<SessionOutcome, string> = {
  resolved_by_ai: "Resolved by AI",
  resolved_by_human: "Resolved by human",
  escalated_unresolved: "Escalated — unresolved",
  customer_abandoned: "Customer left",
  failed: "Failed",
  out_of_scope: "Out of scope",
};

export const STATUS_LABELS: Record<SessionStatus, string> = {
  created: "Created",
  awaiting_consent: "Awaiting consent",
  active: "AI active",
  escalated: "Awaiting human",
  human_active: "Human active",
  completed: "Completed",
  failed: "Failed",
};

/** docs/03 §6 — UI vocabulary for observation certainty. */
export const OBSERVATION_STATUS_LABELS: Record<ObservationStatus, string> = {
  confirmed_visible: "Confirmed",
  likely_visible: "Likely",
  uncertain: "Uncertain",
  unreadable: "Unreadable",
  not_visible: "Not visible",
  conflicting_evidence: "Conflicting",
  needs_another_view: "Needs another view",
};

export const CUSTOMER_STATE_LABELS: Record<CustomerUxState, string> = {
  consent: "Privacy notice",
  conversation: "In conversation",
  show_object: "Show object",
  analysing: "Analysing",
  need_closer_view: "Need closer view",
  need_another_angle: "Need another angle",
  guidance: "Following guidance",
  waiting_action: "Running action",
  resolved: "Resolved",
  escalating: "Escalating",
  human_connected: "Human connected",
  ended: "Ended",
};

export function humanize(key: string): string {
  const s = key.replace(/[_.]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Fictional, masked account label for demo and test sessions (matches seeded data). */
export function demoCustomerLabel(): string {
  return `Account ••${String(1000 + Math.floor(Math.random() * 9000))}`;
}

/** Customer label of the automated production check's test conversations (scripts/check-journey.mjs). */
export const AUTOMATED_CHECK_LABEL = "Automated production check";
