import type { CustomerUxState, SessionState } from "@/lib/domain/session";
import type {
  Escalation,
  HandoverPayload,
  ObservationStatus,
  OwnerType,
  SessionOutcome,
  SessionStatus,
  WorkflowDefinition,
} from "@/lib/domain/types";
import { buildHandover, buildSummary, isUncertain, latestObservations } from "./handover";
import { demoSceneFor } from "@/lib/simulation/demo-scene";
import type { RouterScene } from "@/lib/media/router-svg";
import { callEligibility } from "@/lib/media/live-call";

/**
 * Role-scoped read models. The customer projection deliberately excludes
 * internal reasoning, confidence values, notes, audit and cost data.
 */

export interface CustomerView {
  sessionId: string;
  reference: string;
  brandName: string;
  brandColor: string;
  status: SessionStatus;
  ownerType: OwnerType;
  customerState: CustomerUxState;
  instruction: { text: string; from: "ai" | "human" | "system"; at: string };
  evidenceRequest?: { id: string; prompt: string; view: string; attempt: number; reason: string; requestedBy: "ai" | "human" };
  transcript: { id: string; speaker: string; speakerName: string; text: string; timestamp: string }[];
  humanName?: string;
  agentName: string;
  /** What the AI read in the latest picture, in plain words ("Internet light: off"), so the customer sees it was understood. */
  seen?: { items: string[]; at: string };
  /** True while a human is (or is about to be) watching — the only time a low-rate preview is relayed. */
  previewRequested: boolean;
  /** True while live video with the human agent may run (agent present, consent, camera on). */
  liveVideo: boolean;
  evidenceMode: string;
  scenario?: string;
  /** Simulation only: what the demo camera should render. */
  demoScene?: RouterScene;
  seq: number;
}

export function toCustomerView(state: SessionState, brand: { name: string; color: string }, evidenceMode: string): CustomerView {
  const human = state.participants.find((p) => p.type === "human_agent" && !p.leftAt);
  const req = state.evidenceRequest;
  return {
    sessionId: state.session.id,
    reference: state.session.reference,
    brandName: brand.name,
    brandColor: brand.color,
    status: state.session.status,
    ownerType: state.session.ownerType,
    customerState: state.customerState,
    instruction: state.instruction,
    evidenceRequest: req
      ? { id: req.id, prompt: req.prompt, view: req.view, attempt: req.attempt, reason: req.reason, requestedBy: req.requestedBy }
      : undefined,
    transcript: state.transcript
      .filter((t) => t.speaker !== "system" || t.text.includes("joined"))
      .map((t) => ({ id: t.id, speaker: t.speaker, speakerName: t.speakerName, text: t.text, timestamp: t.timestamp })),
    humanName: human?.displayName,
    agentName: state.participants.find((p) => p.type === "ai")?.displayName ?? "Visual assistant",
    previewRequested: Boolean(human) || Boolean(state.escalation),
    liveVideo: callEligibility(state).eligible,
    evidenceMode,
    scenario: state.session.scenario,
    demoScene: demoSceneFor(state),
    seen: latestSeen(state),
    seq: state.seq,
  };
}

function latestSeen(state: SessionState): CustomerView["seen"] {
  const read = state.observations.filter((o) => o.status === "confirmed_visible" || o.status === "likely_visible");
  const last = read.at(-1);
  if (!last) return undefined;
  const items = [...new Set(read.filter((o) => o.visualEventId === last.visualEventId).map((o) => o.observationText))];
  return items.length ? { items, at: last.timestamp } : undefined;
}

export interface SessionSummaryView {
  id: string;
  reference: string;
  tenantId: string;
  workflowName: string;
  workflowVersion: number;
  status: SessionStatus;
  ownerType: OwnerType;
  customerState: CustomerUxState;
  customerLabel: string;
  channel: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  outcome?: SessionOutcome;
  escalation?: Pick<Escalation, "reason" | "severity" | "requestedAt" | "acceptedAt" | "assignedUserName" | "mandatoryHuman" | "reasonDetail">;
  currentStepTitle?: string;
  completedSteps: number;
  frames: number;
  observations: number;
  uncertain: number;
  costTotal: number;
  scenario?: string;
  live: boolean;
  lastActivityAt: string;
  issue?: string;
}

export function toSummary(state: SessionState, workflow: WorkflowDefinition, live: boolean): SessionSummaryView {
  const step = state.workflow.currentStep ? workflow.steps.find((s) => s.key === state.workflow.currentStep) : undefined;
  const e = state.escalation;
  return {
    id: state.session.id,
    reference: state.session.reference,
    tenantId: state.session.tenantId,
    workflowName: state.session.workflowName,
    workflowVersion: state.session.workflowVersion,
    status: state.session.status,
    ownerType: state.session.ownerType,
    customerState: state.customerState,
    customerLabel: state.session.customerLabel,
    channel: state.session.channel,
    createdAt: state.session.createdAt,
    startedAt: state.session.startedAt,
    endedAt: state.session.endedAt,
    outcome: state.session.outcome,
    escalation: e
      ? {
          reason: e.reason,
          severity: e.severity,
          requestedAt: e.requestedAt,
          acceptedAt: e.acceptedAt,
          assignedUserName: e.assignedUserName,
          mandatoryHuman: e.mandatoryHuman,
          reasonDetail: e.reasonDetail,
        }
      : undefined,
    currentStepTitle: step?.title,
    completedSteps: state.workflow.history.filter((h) => h.status === "completed").length,
    frames: state.visualEvents.length,
    observations: state.observations.length,
    uncertain: latestObservations(state).filter(isUncertain).length,
    costTotal: state.session.costTotal,
    scenario: state.session.scenario,
    live,
    lastActivityAt: state.audit.at(-1)?.timestamp ?? state.session.createdAt,
    issue: state.workflow.customerIssue,
  };
}

export interface AgentView {
  state: SessionState;
  summary: string;
  handover: HandoverPayload;
  workflow: Pick<WorkflowDefinition, "id" | "name" | "version" | "steps" | "allowedScope" | "prohibitedGuidance">;
  observationStatusCounts: Partial<Record<ObservationStatus, number>>;
  live: boolean;
  previewAvailable: boolean;
  tenantName: string;
  allowedHumanTools: { tool: string; risk: string; mode: string }[];
  returnToAiAllowed: { allowed: boolean; reason: string };
  simulatedProvider: boolean;
}

export function toAgentView(
  state: SessionState,
  workflow: WorkflowDefinition,
  extra: Omit<AgentView, "state" | "summary" | "handover" | "workflow" | "observationStatusCounts">,
): AgentView {
  const counts: Partial<Record<ObservationStatus, number>> = {};
  for (const o of state.observations) counts[o.status] = (counts[o.status] ?? 0) + 1;
  return {
    state,
    summary: buildSummary(state),
    handover: buildHandover(state, workflow),
    workflow: {
      id: workflow.id,
      name: workflow.name,
      version: workflow.version,
      steps: workflow.steps,
      allowedScope: workflow.allowedScope,
      prohibitedGuidance: workflow.prohibitedGuidance,
    },
    observationStatusCounts: counts,
    ...extra,
  };
}
