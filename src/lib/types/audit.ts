export type AuditResult = "Success" | "Blocked" | "Warning" | "Failed";
export type ActorType = "AI agent" | "Human adviser" | "System" | "Policy engine" | "Admin user";

export interface AuditEvent {
  id: string;
  iso: string; // sortable
  at: string; // display
  tenant: string;
  sessionId: string | null;
  actor: string;
  actorType: ActorType;
  event: string;
  workflowVersion: string | null;
  policyVersion: string;
  modelVersion: string;
  result: AuditResult;
  payload: Record<string, unknown>;
  hash: string;
  prevHash: string;
}
