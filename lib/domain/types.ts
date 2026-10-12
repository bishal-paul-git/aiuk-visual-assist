/**
 * Core domain model for Absolute Intelligence Visual Assist.
 * Mirrors docs/04-DATA-MODEL-AND-EVENTS.md. Field names are camelCase in code;
 * persistence adapters map them to snake_case columns.
 */

export type ISODateString = string;

// ---------------------------------------------------------------------------
// Tenancy and identity
// ---------------------------------------------------------------------------

export type TenantStatus = "active" | "onboarding" | "suspended";
export type Region = "uk-south" | "uk-west" | "eu-west";

export interface BrandConfig {
  displayName: string;
  primaryColor: string;
  supportLine?: string;
  privacyNoticeUrl?: string;
}

export interface RetentionPolicy {
  /** live_only: nothing beyond structured metadata is kept after the session. */
  evidenceMode: "live_only" | "retained_evidence";
  evidenceRetentionDays: number;
  transcriptRetentionDays: number;
  auditRetentionDays: number;
}

export interface Tenant {
  id: string;
  name: string;
  sector: Sector;
  status: TenantStatus;
  brand: BrandConfig;
  region: Region;
  retention: RetentionPolicy;
  featureFlags: Record<string, boolean>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type Sector =
  | "telecommunications"
  | "utilities"
  | "insurance"
  | "retail"
  | "field_service"
  | "local_government"
  | "property";

export type UserRole =
  | "aiuk_admin"
  | "client_admin"
  | "supervisor"
  | "agent"
  | "qa_reviewer";

export interface User {
  id: string;
  tenantId: string;
  role: UserRole;
  name: string;
  email: string;
  status: "active" | "invited" | "disabled";
  teamId?: string;
}

// ---------------------------------------------------------------------------
// AI agent configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
  id: string;
  tenantId: string;
  name: string;
  model: { provider: string; model: string; visionModel: string };
  voice: { provider: string; voiceId: string; speakingRate: number };
  language: { primary: string; supported: string[] };
  policyIds: string[];
  workflowIds: string[];
  promptVersion: string;
  version: number;
  status: "draft" | "active" | "retired";
}

// ---------------------------------------------------------------------------
// Workflow definitions (versioned, tenant-scoped)
// ---------------------------------------------------------------------------

export type WorkflowStepType =
  | "start"
  | "question"
  | "visual_request"
  | "guidance"
  | "business_action"
  | "human_escalation"
  | "completion";

/** Conditions are data, evaluated deterministically by the workflow engine. */
export type StepCondition =
  | { kind: "always" }
  | { kind: "intent"; intents: string[] }
  | {
      kind: "observation";
      observationType: string;
      values: string[];
    }
  | { kind: "tool_result"; field: string; values: string[] };

export interface NextRule {
  when: StepCondition;
  to: string;
  label: string;
}

export interface EvidenceRequirement {
  checkpoint: string;
  description: string;
  /** Observation types that must be present at or above threshold. */
  observationTypes: string[];
  view: "front" | "close_up" | "rear" | "wide" | "detail";
}

export interface StepAction {
  tool: string;
  params: Record<string, string | number | boolean>;
}

export interface WorkflowStep {
  key: string;
  type: WorkflowStepType;
  title: string;
  /** What the AI says when entering this step. */
  instruction: string;
  /** One short instruction for the customer screen (one primary instruction at a time). */
  customerPrompt: string;
  allowedGuidance?: string[];
  evidence?: EvidenceRequirement;
  confidenceThreshold?: number;
  maxAttempts?: number;
  action?: StepAction;
  next: NextRule[];
  /** Step to go to when attempts are exhausted / the step fails. */
  onFailure?: { to: string; reason: EscalationReasonCode };
  escalation?: { reason: EscalationReasonCode; severity: EscalationSeverity; humanOnly?: boolean };
  completion?: { outcome: SessionOutcome };
}

export type WorkflowStatus = "draft" | "in_review" | "published" | "retired";

export interface WorkflowDefinition {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  version: number;
  status: WorkflowStatus;
  /** Version this draft was created from (versioning lineage). */
  basedOnVersion?: number;
  submittedAt?: ISODateString;
  submittedBy?: string;
  /** User id of the submitter; the four-eyes rule stops them approving their own change. */
  submittedById?: string;
  retiredAt?: ISODateString;
  sector: Sector;
  objective: string;
  allowedScope: string[];
  prohibitedGuidance: string[];
  defaultConfidenceThreshold: number;
  maxAiDurationSec: number;
  policyId: string;
  startStep: string;
  steps: WorkflowStep[];
  /**
   * Allowed normalised values per observation type. Model output is validated
   * against this so a reasoning provider can never invent a workflow branch.
   */
  observationVocabulary?: Record<string, { description: string; values: string[] }>;
  changeNote: string;
  publishedAt?: ISODateString;
  publishedBy?: string;
  /** Second administrator who approved the version (four-eyes); also the publisher. */
  approvedBy?: string;
  approvedById?: string;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export type ToolRisk = "low" | "medium" | "high" | "regulated";

export interface ToolPermission {
  tool: string;
  risk: ToolRisk;
  /** allow: AI may run it. human_only: a human must perform it. deny: never. */
  mode: "allow" | "human_only" | "deny";
  requiresIdempotencyKey: boolean;
}

export type SensitiveCategory =
  | "bystanders"
  | "children"
  | "identity_documents"
  | "payment_cards"
  | "medical_information"
  | "confidential_documents"
  | "private_interiors"
  | "computer_screens"
  | "vehicle_plates"
  | "special_category";

/** "active" is the published version of a policy lineage; at most one per key. */
export type PolicyStatus = "draft" | "in_review" | "active" | "retired";

export interface Policy {
  /** Unique per version. The first version of a lineage uses the key as its id. */
  id: string;
  /**
   * Lineage key that workflows and agents reference (defaults to `id`).
   * Resolving a key returns the active version, so new sessions pick up a
   * publish while running sessions keep the policy object they started with.
   */
  key?: string;
  tenantId: string;
  name: string;
  version: number;
  status: PolicyStatus;
  basedOnVersion?: number;
  changeNote?: string;
  submittedAt?: ISODateString;
  submittedBy?: string;
  submittedById?: string;
  publishedAt?: ISODateString;
  publishedBy?: string;
  approvedBy?: string;
  approvedById?: string;
  retiredAt?: ISODateString;
  tools: ToolPermission[];
  /** Escalation reasons that hand control to a human and forbid return to AI. */
  mandatoryHumanReasons: EscalationReasonCode[];
  sensitiveData: { category: SensitiveCategory; handling: "blur" | "avoid_capture" | "escalate" | "allowed" }[];
  minObservationConfidence: number;
  maxCaptureAttempts: number;
  maxAiDurationSec: number;
  allowReturnToAi: boolean;
}

// ---------------------------------------------------------------------------
// Session aggregate pieces
// ---------------------------------------------------------------------------

export type SessionChannel = "secure_link" | "sms" | "qr" | "website" | "contact_centre";
export type SessionStatus =
  | "created"
  | "awaiting_consent"
  | "active"
  | "escalated"
  | "human_active"
  | "completed"
  | "failed";
export type OwnerType = "ai" | "human";
export type SessionOutcome =
  | "resolved_by_ai"
  | "resolved_by_human"
  | "escalated_unresolved"
  | "customer_abandoned"
  | "failed"
  | "out_of_scope";

export interface Participant {
  id: string;
  sessionId: string;
  type: "customer" | "ai" | "human_agent" | "supervisor";
  userId?: string;
  displayName: string;
  joinedAt: ISODateString;
  leftAt?: ISODateString;
}

export type Speaker = "customer" | "ai" | "human_agent" | "system";

export interface TranscriptEvent {
  id: string;
  sessionId: string;
  speaker: Speaker;
  speakerName: string;
  timestamp: ISODateString;
  text: string;
  /** ASR confidence for customer speech; 1 for typed/generated text. */
  confidence: number;
  /** Interpreted intent, set once the reasoning layer has processed the turn. */
  intent?: string;
  /** Personal data removed from `text` before it was stored (docs/06 §3). */
  redactions?: RedactionCount[];
}

/** Kinds of personal data removed from transcript text before storage. */
export type RedactionType = "card_number" | "email" | "phone" | "postcode" | "account_number";

export interface RedactionCount {
  type: RedactionType;
  count: number;
}

export type FrameTrigger =
  | "scheduled_sample"
  | "ai_request"
  | "workflow_checkpoint"
  | "customer_capture"
  | "scene_change"
  | "human_request"
  | "uncertainty_confirmation";

export interface VisualEvent {
  id: string;
  sessionId: string;
  triggerType: FrameTrigger;
  timestamp: ISODateString;
  frameReference: string;
  checkpoint?: string;
  stepKey?: string;
  width: number;
  height: number;
  bytes: number;
  processingStatus: "pending" | "analysing" | "analysed" | "failed";
  /** Set when the frame was deleted under the tenant's retention policy; `frameReference` is then "purged". */
  purgedAt?: ISODateString;
}

export const OBSERVATION_STATUSES = [
  "confirmed_visible",
  "likely_visible",
  "uncertain",
  "unreadable",
  "not_visible",
  "conflicting_evidence",
  "needs_another_view",
] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export interface VisualObservation {
  id: string;
  visualEventId: string;
  sessionId: string;
  observationType: string;
  /** Normalised value used by workflow conditions, e.g. "on" | "off" | "amber". */
  value?: string;
  observationText: string;
  confidence: number;
  status: ObservationStatus;
  requiresConfirmation: boolean;
  recommendedNextAction?: string;
  modelVersion: string;
  timestamp: ISODateString;
  humanReview?: { userId: string; verdict: "confirmed" | "rejected"; at: ISODateString };
}

export interface ToolAction {
  id: string;
  sessionId: string;
  toolName: string;
  idempotencyKey: string;
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: "requested" | "running" | "completed" | "failed" | "duplicate_blocked" | "denied";
  requestedBy: "ai" | "human";
  stepKey?: string;
  startedAt: ISODateString;
  completedAt?: ISODateString;
  error?: string;
}

export type EscalationReasonCode =
  | "customer_requested"
  | "low_visual_confidence"
  | "repeated_capture_failure"
  | "human_only_step"
  | "safety_policy"
  | "regulated_action"
  | "ai_model_failure"
  | "media_failure"
  | "workflow_failure"
  | "max_ai_duration"
  | "out_of_scope"
  | "unresolved_after_workflow"
  | "agent_initiated";

export type EscalationSeverity = "low" | "medium" | "high" | "critical";

export interface Escalation {
  id: string;
  sessionId: string;
  reason: EscalationReasonCode;
  reasonDetail: string;
  severity: EscalationSeverity;
  requestedAt: ISODateString;
  acceptedAt?: ISODateString;
  assignedUserId?: string;
  assignedUserName?: string;
  resolution?: string;
  mandatoryHuman: boolean;
}

export type ActorType = "customer" | "ai" | "human_agent" | "system" | "admin";

export interface AuditEvent {
  id: string;
  tenantId: string;
  sessionId?: string;
  actorType: ActorType;
  actorId: string;
  eventType: DomainEventType;
  payload: Record<string, unknown>;
  timestamp: ISODateString;
  /** Versions in force when the event occurred (docs/06 §7). */
  context?: { workflowVersion?: number; policyVersion?: number; modelVersion?: string; promptVersion?: string };
}

export interface CostEvent {
  id: string;
  sessionId: string;
  provider: string;
  category: "media" | "speech_to_text" | "text_to_speech" | "vision_inference" | "llm_turn" | "workflow_action";
  quantity: number;
  unit: "minute" | "frame" | "turn" | "character" | "call";
  /** Cost in GBP. Measured when `basis` is "measured", otherwise a unit-rate estimate. */
  estimatedCost: number;
  currency: "GBP";
  timestamp: ISODateString;
  /**
   * "measured": priced from token usage reported by the model provider.
   * "estimated" (or absent, for older records): flat unit rate from COST_RATES.
   */
  basis?: "estimated" | "measured";
  /** Provider-reported token usage behind a measured cost. */
  usage?: ModelUsage;
  /** Seconds of customer audio behind a server speech-to-text cost. Audio itself is never stored. */
  audioSeconds?: number;
}

/** Token usage for one model call, as reported by the provider (e.g. Anthropic `usage`). */
export interface ModelUsageParts {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface ModelUsage extends ModelUsageParts {
  /** Per-model breakdown when more than one model ran (e.g. a server-side fallback). */
  parts?: ModelUsageParts[];
  latencyMs?: number;
}

export interface AgentNote {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: ISODateString;
}

/** docs/05 §6 — the structured package a human receives on escalation. */
export interface HandoverPayload {
  sessionSummary: string;
  customerIssue: string;
  workflow: string;
  completedSteps: { key: string; title: string; outcome?: string }[];
  visualObservations: Pick<VisualObservation, "id" | "observationText" | "status" | "confidence" | "visualEventId">[];
  uncertainItems: Pick<VisualObservation, "id" | "observationText" | "status" | "confidence">[];
  actionsTaken: { tool: string; status: ToolAction["status"]; summary: string }[];
  reasonForEscalation: string;
  recommendedNextStep: string;
}

// ---------------------------------------------------------------------------
// Events (docs/04 §2)
// ---------------------------------------------------------------------------

export type DomainEventType =
  | "session.created"
  | "session.started"
  | "session.connected"
  | "session.degraded"
  | "session.completed"
  | "session.failed"
  | "session.consent_recorded"
  | "media.camera_enabled"
  | "media.camera_disabled"
  | "media.microphone_enabled"
  | "media.microphone_disabled"
  | "media.connection_degraded"
  | "media.connection_restored"
  | "media.frame_selected"
  | "media.frame_failed"
  | "ai.turn_started"
  | "ai.turn_completed"
  | "ai.visual_request"
  | "ai.observation_created"
  | "ai.uncertain"
  | "ai.escalation_requested"
  | "ai.failure"
  | "workflow.started"
  | "workflow.step_entered"
  | "workflow.step_completed"
  | "workflow.branch_selected"
  | "workflow.action_requested"
  | "workflow.completed"
  | "workflow.failed"
  | "human.requested"
  | "human.queued"
  | "human.joined"
  | "human.took_over"
  | "human.returned_to_ai"
  | "human.left"
  | "human.note_added"
  | "human.observation_reviewed"
  | "tool.requested"
  | "tool.completed"
  | "tool.failed"
  | "tool.duplicate_blocked"
  | "tool.denied"
  | "policy.check"
  | "config.workflow_draft_created"
  | "config.workflow_updated"
  | "config.workflow_submitted"
  | "config.workflow_published"
  | "config.workflow_retired"
  | "config.workflow_discarded"
  | "config.workflow_step_added"
  | "config.workflow_step_removed"
  | "config.workflow_step_moved"
  | "config.workflow_step_updated"
  | "config.workflow_rules_updated"
  | "config.policy_draft_created"
  | "config.policy_updated"
  | "config.policy_submitted"
  | "config.policy_published"
  | "config.policy_retired"
  | "config.policy_discarded"
  | "notification.sent"
  | "notification.failed"
  | "security.signed_in"
  | "security.signed_out"
  | "security.sign_in_failed"
  | "security.permission_denied"
  | "privacy.redacted"
  | "privacy.retention_purged"
  | "audit.exported"
  | "qa.review_claimed"
  | "qa.review_released"
  | "qa.review_submitted";
