import type { HandoverPayload, VisualObservation, WorkflowDefinition } from "@/lib/domain/types";
import type { SessionState } from "@/lib/domain/session";
import { ESCALATION_REASON_LABELS } from "@/lib/domain/labels";

const SETTLED = new Set(["confirmed_visible", "likely_visible", "not_visible"]);

export function isUncertain(o: VisualObservation): boolean {
  if (o.humanReview?.verdict === "confirmed") return false;
  return !SETTLED.has(o.status) || o.requiresConfirmation;
}

/** Latest observation per type — what the session currently believes. */
export function latestObservations(state: SessionState): VisualObservation[] {
  const byType = new Map<string, VisualObservation>();
  for (const o of state.observations) {
    if (o.humanReview?.verdict === "rejected") continue;
    byType.set(o.observationType, o);
  }
  return [...byType.values()];
}

/**
 * Deterministic session summary built from authoritative state. A model-written
 * summary can replace the prose later, but the facts must come from here.
 */
export function buildSummary(state: SessionState): string {
  const parts: string[] = [];
  const issue = state.workflow.customerIssue;
  parts.push(issue ? `Customer reports: ${issue}.` : "Customer has not yet described the issue.");
  const settled = latestObservations(state).filter((o) => !isUncertain(o));
  if (settled.length) parts.push(`Observed: ${settled.map((o) => o.observationText.replace(/\.$/, "")).join("; ")}.`);
  const tried = state.workflow.history
    .filter((h) => h.status === "completed" && !["welcome", "intake"].includes(h.stepKey))
    .map((h) => h.title.toLowerCase());
  if (tried.length) parts.push(`Completed: ${tried.join(", ")}.`);
  const actions = state.toolActions.filter((a) => a.status === "completed");
  if (actions.length) parts.push(`Actions: ${actions.map((a) => actionSummary(a.toolName, a.result)).join("; ")}.`);
  const uncertain = latestObservations(state).filter(isUncertain);
  if (uncertain.length) parts.push(`${uncertain.length} observation(s) need confirmation.`);
  return parts.join(" ");
}

export function actionSummary(tool: string, result?: Record<string, unknown>): string {
  if (!result) return tool.replace(/_/g, " ");
  if (tool === "line_test") return `line test — ${String(result.status).replace(/_/g, " ")}${result.detail ? ` (${result.detail})` : ""}`;
  if (tool === "update_case") return `case ${String(result.caseId ?? "")} updated (${String(result.status ?? "")})`;
  if (tool === "create_ticket") return `ticket ${String(result.ticketId ?? "")} created`;
  if (tool === "book_engineer") return `engineer booked ${String(result.slot ?? "")}`;
  return `${tool.replace(/_/g, " ")} completed`;
}

export function recommendedNextStep(state: SessionState, workflow: WorkflowDefinition): string {
  const esc = state.escalation;
  const facts = state.workflow.facts;
  const toolFacts = state.workflow.toolFacts;
  if (esc?.reason === "low_visual_confidence" || esc?.reason === "repeated_capture_failure") {
    return "Review the captured frames, request a clearer view yourself, then confirm or reject the uncertain observations.";
  }
  if (esc?.reason === "customer_requested" && !state.workflow.customerIssue) return "Greet the customer and confirm the issue.";
  if (toolFacts["line_test.status"] === "fault_detected") {
    return "Confirm the line fault with the network team and offer an engineer appointment (human-only action).";
  }
  if (facts.internet_light && facts.internet_light !== "on") {
    return "Check for area outages and perform advanced network checks, or escalate to Level 2.";
  }
  const current = state.workflow.currentStep ? workflow.steps.find((s) => s.key === state.workflow.currentStep) : undefined;
  if (current && current.type !== "human_escalation") return `Continue from “${current.title}”.`;
  return "Confirm the customer's current situation and decide whether to continue the workflow or close the case.";
}

export function buildHandover(state: SessionState, workflow: WorkflowDefinition): HandoverPayload {
  const latest = latestObservations(state);
  return {
    sessionSummary: buildSummary(state),
    customerIssue: state.workflow.customerIssue ?? "Not yet captured",
    workflow: `${workflow.name} v${workflow.version}`,
    completedSteps: state.workflow.history
      .filter((h) => h.status === "completed")
      .map((h) => ({ key: h.stepKey, title: h.title, outcome: h.outcome })),
    visualObservations: latest.map((o) => ({
      id: o.id,
      observationText: o.observationText,
      status: o.status,
      confidence: o.confidence,
      visualEventId: o.visualEventId,
    })),
    uncertainItems: latest.filter(isUncertain).map((o) => ({ id: o.id, observationText: o.observationText, status: o.status, confidence: o.confidence })),
    actionsTaken: state.toolActions.map((a) => ({ tool: a.toolName, status: a.status, summary: actionSummary(a.toolName, a.result) })),
    reasonForEscalation: state.escalation
      ? `${ESCALATION_REASON_LABELS[state.escalation.reason]} — ${state.escalation.reasonDetail}`
      : "Not escalated",
    recommendedNextStep: recommendedNextStep(state, workflow),
  };
}
