import type {
  AgentNote,
  AuditEvent,
  CostEvent,
  Escalation,
  EscalationReasonCode,
  FrameTrigger,
  ISODateString,
  OwnerType,
  Participant,
  SessionChannel,
  SessionOutcome,
  SessionStatus,
  ToolAction,
  TranscriptEvent,
  VisualEvent,
  VisualObservation,
} from "./types";

/**
 * The customer-facing UX state (docs/03 §2). "AI listening" and "AI speaking"
 * are layered on by the client from the voice layer; everything else is owned
 * by the orchestrator so every surface agrees on what is happening.
 */
export type CustomerUxState =
  | "consent"
  | "conversation"
  | "show_object"
  | "analysing"
  | "need_closer_view"
  | "need_another_angle"
  | "guidance"
  | "waiting_action"
  | "resolved"
  | "escalating"
  | "human_connected"
  | "ended";

export interface SessionRecord {
  id: string;
  reference: string;
  tenantId: string;
  workflowId: string;
  workflowKey: string;
  workflowName: string;
  workflowVersion: number;
  agentId: string;
  policyId: string;
  policyVersion: number;
  modelVersion: string;
  promptVersion: string;
  channel: SessionChannel;
  status: SessionStatus;
  ownerType: OwnerType;
  createdAt: ISODateString;
  startedAt?: ISODateString;
  endedAt?: ISODateString;
  outcome?: SessionOutcome;
  escalationReason?: EscalationReasonCode;
  costTotal: number;
  customerLabel: string;
  /** Mock-provider scenario used for simulated reasoning. Never set in production. */
  scenario?: string;
  evidenceMode: "live_only" | "retained_evidence";
}

export interface StepRecord {
  stepKey: string;
  title: string;
  enteredAt: ISODateString;
  completedAt?: ISODateString;
  outcome?: string;
  status: "active" | "completed" | "failed" | "abandoned";
}

export interface EvidenceRequest {
  id: string;
  stepKey?: string;
  checkpoint: string;
  prompt: string;
  view: string;
  attempt: number;
  maxAttempts: number;
  reason: "initial" | "closer" | "another_angle" | "human";
  trigger: FrameTrigger;
  requestedBy: "ai" | "human";
  requestedAt: ISODateString;
}

export interface MediaState {
  camera: boolean;
  microphone: boolean;
  quality: "good" | "fair" | "poor" | "lost";
  facing: "environment" | "user";
}

export interface WorkflowProgress {
  currentStep: string | null;
  history: StepRecord[];
  attempts: Record<string, number>;
  intent?: string;
  customerIssue?: string;
  /** Latest accepted observation values, keyed by observation type. */
  facts: Record<string, string>;
  /** Latest tool result fields, keyed `${tool}.${field}`. */
  toolFacts: Record<string, string>;
}

export interface SessionState {
  seq: number;
  session: SessionRecord;
  participants: Participant[];
  transcript: TranscriptEvent[];
  visualEvents: VisualEvent[];
  observations: VisualObservation[];
  toolActions: ToolAction[];
  escalation?: Escalation;
  workflow: WorkflowProgress;
  evidenceRequest?: EvidenceRequest;
  instruction: { text: string; from: "ai" | "human" | "system"; at: ISODateString };
  customerState: CustomerUxState;
  media: MediaState;
  notes: AgentNote[];
  audit: AuditEvent[];
  costs: CostEvent[];
  consent?: { acceptedAt: ISODateString; noticeVersion: string; evidenceMode: string };
  /** What the retention job has deleted from this session (docs/06 §3). */
  retention?: RetentionRecord;
}

export interface RetentionRecord {
  evidencePurgedAt?: ISODateString;
  framesPurged?: number;
  transcriptPurgedAt?: ISODateString;
  transcriptEventsPurged?: number;
}
