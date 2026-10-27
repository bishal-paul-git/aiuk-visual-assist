import type { Escalation, EscalationReasonCode, Policy, ToolAction } from "@/lib/domain/types";
import { ESCALATION_REASON_LABELS } from "@/lib/domain/labels";

export type PolicyDecision =
  | { decision: "allow"; reason: string; requiresIdempotencyKey: boolean }
  | { decision: "requires_human"; reason: string }
  | { decision: "deny"; reason: string };

/**
 * Deterministic tool permission check (docs/02 §4 rule 6). The model never
 * decides whether a tool may run; the active policy does.
 */
export function checkTool(policy: Policy, tool: string, actor: "ai" | "human"): PolicyDecision {
  const permission = policy.tools.find((t) => t.tool === tool);
  if (!permission) return { decision: "deny", reason: `Tool "${tool}" is not in policy ${policy.name} v${policy.version}` };
  if (permission.mode === "deny") return { decision: "deny", reason: `Tool "${tool}" is prohibited by policy` };
  if (permission.mode === "human_only" && actor === "ai") {
    return { decision: "requires_human", reason: `Tool "${tool}" (${permission.risk} risk) may only be performed by a human` };
  }
  if (permission.risk === "regulated" && actor === "ai") {
    return { decision: "requires_human", reason: `Tool "${tool}" is a regulated action` };
  }
  return { decision: "allow", reason: `Permitted for ${actor} by policy`, requiresIdempotencyKey: permission.requiresIdempotencyKey };
}

export interface PolicyIssue {
  tool?: string;
  severity: "error" | "warning" | "info";
  message: string;
}

/**
 * Static checks run on every policy edit and before publishing. Regulated
 * tools can never be allowed for the AI, whatever else a version changes.
 */
export function validatePolicy(policy: Policy): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  const seen = new Set<string>();
  for (const t of policy.tools) {
    if (seen.has(t.tool)) issues.push({ tool: t.tool, severity: "error", message: "Tool is listed more than once" });
    seen.add(t.tool);
    if (t.risk === "regulated" && t.mode === "allow") {
      issues.push({ tool: t.tool, severity: "error", message: "Regulated tools can never be allowed for the AI; use human only or deny" });
    }
    if (t.risk === "high" && t.mode === "allow") issues.push({ tool: t.tool, severity: "warning", message: "High-risk tool can run without a person" });
    if (t.mode !== "deny" && !t.requiresIdempotencyKey) issues.push({ tool: t.tool, severity: "warning", message: "Runs without an idempotency key; retries may repeat the action" });
  }
  if (policy.minObservationConfidence < 0.5 || policy.minObservationConfidence > 0.99) {
    issues.push({ severity: "error", message: "Minimum observation confidence must be between 0.50 and 0.99" });
  }
  if (!Number.isInteger(policy.maxCaptureAttempts) || policy.maxCaptureAttempts < 1 || policy.maxCaptureAttempts > 5) {
    issues.push({ severity: "error", message: "Maximum capture attempts must be 1–5" });
  }
  if (!Number.isInteger(policy.maxAiDurationSec) || policy.maxAiDurationSec < 60 || policy.maxAiDurationSec > 3600) {
    issues.push({ severity: "error", message: "Maximum AI duration must be between 1 and 60 minutes" });
  }
  if (!policy.mandatoryHumanReasons.includes("customer_requested")) {
    issues.push({ severity: "warning", message: "A customer asking for a person does not force a human to finish the session" });
  }
  return issues;
}

export function isMandatoryHuman(policy: Policy, reason: EscalationReasonCode): boolean {
  return policy.mandatoryHumanReasons.includes(reason);
}

export function canReturnToAi(policy: Policy, escalation: Escalation | undefined): { allowed: boolean; reason: string } {
  if (!policy.allowReturnToAi) return { allowed: false, reason: "Policy does not permit returning control to AI" };
  if (escalation?.mandatoryHuman) {
    const why =
      escalation.reason === "customer_requested"
        ? "the customer asked for a person, so a person finishes this conversation"
        : `"${ESCALATION_REASON_LABELS[escalation.reason] ?? escalation.reason}" must be finished by a person`;
    return { allowed: false, reason: why.charAt(0).toUpperCase() + why.slice(1) };
  }
  return { allowed: true, reason: "Permitted by policy" };
}

/** Business-action idempotency (docs/07 §6). */
export function findDuplicate(actions: ToolAction[], idempotencyKey: string): ToolAction | undefined {
  return actions.find(
    (a) => a.idempotencyKey === idempotencyKey && (a.status === "completed" || a.status === "running" || a.status === "requested"),
  );
}

const HUMAN_REQUEST_PATTERNS = [
  /\b(speak|talk|chat)\s+(to|with)\s+(a|an|someone|somebody|a real)?\s*(person|human|agent|someone|adviser|advisor|operator|engineer)/i,
  /\b(real|actual|live)\s+(person|human|agent)\b/i,
  /\bhuman\b/i,
  /\b(agent|operator|adviser|advisor)\s*(please)?\s*$/i,
  /\bget me (a|someone)\b/i,
];

/**
 * Deterministic guard so a customer asking for a person always escalates,
 * even when the reasoning layer is slow or unavailable (docs/02 §4 rule 8).
 */
export function detectHumanRequest(text: string): boolean {
  return HUMAN_REQUEST_PATTERNS.some((p) => p.test(text));
}
