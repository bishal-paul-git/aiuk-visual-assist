// Core domain types. Shapes mirror the production data model in the product spec (§12)
// so that mock data can later be swapped for real API responses without UI changes.

export type ClientId = "northstar" | "clearwave" | "horizon";
export type Owner = "AI" | "Human";

export type SessionStatus =
  | "ai_handling"
  | "awaiting_evidence"
  | "analysing"
  | "escalating"
  | "human_joined"
  | "resolved"
  | "failed";

export type ConnectionQuality = "excellent" | "good" | "fair" | "poor";

export type ObservationStatus =
  | "confirmed_visible"
  | "likely_visible"
  | "uncertain"
  | "unreadable"
  | "not_visible"
  | "conflicting_evidence"
  | "needs_another_view";

export type SceneKind =
  | "router_front"
  | "router_lights"
  | "router_rear"
  | "router_blur"
  | "boiler_panel"
  | "boiler_pressure"
  | "damage_wall"
  | "damage_vehicle"
  | "meter";

export type FrameTrigger =
  | "workflow_checkpoint"
  | "customer_language"
  | "scene_change"
  | "ai_request"
  | "periodic_sample"
  | "human_request";

export interface Client {
  id: ClientId;
  name: string;
  industry: string;
  status: "live" | "pilot" | "onboarding";
  region: string;
  accent: string; // brand colour hex for the tenant preview
  initials: string;
  retentionDays: number;
  retentionMode: "live_only" | "selected_frames" | "full_evidence";
  contractTier: string;
}

export interface VisualObservation {
  id: string;
  text: string;
  confidence: number; // 0..1
  status: ObservationStatus;
  frameId: string;
  requiresConfirmation: boolean;
  at: string; // mm:ss into session
}

export interface Frame {
  id: string;
  scene: SceneKind;
  label: string;
  trigger: FrameTrigger;
  at: string;
  quality: number; // 0..1
  selectedForModel: boolean;
}

export type StepState = "done" | "current" | "pending" | "skipped" | "escalated";
export interface WorkflowStepProgress {
  key: string;
  label: string;
  state: StepState;
  at?: string;
  note?: string;
}

export interface ToolAction {
  id: string;
  tool: string;
  request: string;
  result: string;
  status: "success" | "pending" | "failed" | "blocked";
  at: string;
  actor: "AI" | "Human" | "System";
}

export interface TranscriptLine {
  id: string;
  speaker: "customer" | "ai" | "human" | "system";
  at: string;
  text: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  event: string;
  detail: string;
  tone?: "neutral" | "ok" | "warn" | "bad" | "human";
}

export interface CostLine {
  category: string;
  provider: string;
  amount: number;
  detail: string;
}

export interface Session {
  id: string;
  clientId: ClientId;
  workflowId: string;
  workflowName: string;
  workflowVersion: string;
  agentId: string;
  agentName: string;
  status: SessionStatus;
  owner: Owner;
  customer: string;
  channel: "QR code" | "SMS link" | "Web journey" | "Support portal";
  startedAt: string; // display string
  durationSec: number;
  aiDurationSec: number;
  humanDurationSec: number;
  framesAnalysed: number;
  aiConfidence: number;
  connection: ConnectionQuality;
  escalated: boolean;
  escalationReason?: string;
  outcome: string;
  cost: number;
  scene: SceneKind;
  humanAgent?: string;
  modelVersion: string;
  policyVersion: string;
}

export interface SessionDetail {
  sessionId: string;
  summary: string;
  recommendedNext: string;
  uncertaintyFlags: string[];
  observations: VisualObservation[];
  frames: Frame[];
  steps: WorkflowStepProgress[];
  actions: ToolAction[];
  transcript: TranscriptLine[];
  audit: AuditEntry[];
  cost: CostLine[];
  retention: string;
}

export interface Incident {
  id: string;
  title: string;
  service: string;
  severity: "sev1" | "sev2" | "sev3";
  state: "investigating" | "monitoring" | "resolved";
  startedAt: string;
  durationMin: number;
  impact: string;
  summary: string;
}
