import type { Escalation, EscalationReasonCode, Policy, ToolAction } from "@/lib/domain/types";

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

export function isMandatoryHuman(policy: Policy, reason: EscalationReasonCode): boolean {
  return policy.mandatoryHumanReasons.includes(reason);
}

export function canReturnToAi(policy: Policy, escalation: Escalation | undefined): { allowed: boolean; reason: string } {
  if (!policy.allowReturnToAi) return { allowed: false, reason: "Policy does not permit returning control to AI" };
  if (escalation?.mandatoryHuman) {
    return { allowed: false, reason: `Escalation reason "${escalation.reason}" requires a human to finish the session` };
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
