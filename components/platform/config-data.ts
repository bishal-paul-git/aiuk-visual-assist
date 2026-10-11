import type { SessionState } from "@/lib/domain/session";
import type { Region, Sector, StepCondition, WorkflowDefinition, WorkflowStep } from "@/lib/domain/types";
import { humanize } from "@/lib/domain/labels";

/** Pure helpers shared by the configuration pages (no React). */

export const DAY_MS = 86_400_000;

/** Sessions created (or started) within the last `days` days. */
export function withinDays(states: SessionState[], days: number, now = Date.now()): SessionState[] {
  const from = now - days * DAY_MS;
  return states.filter((s) => Date.parse(s.session.startedAt ?? s.session.createdAt) >= from);
}

export const SECTOR_LABELS: Record<Sector, string> = {
  telecommunications: "Telecommunications",
  utilities: "Utilities",
  insurance: "Insurance",
  retail: "Retail",
  field_service: "Field service",
  local_government: "Local government",
  property: "Property",
};

export const REGION_LABELS: Record<Region, string> = {
  "uk-south": "UK South (London)",
  "uk-west": "UK West (Cardiff)",
  "eu-west": "EU West (Ireland)",
};

export const ROLE_LABELS: Record<string, string> = {
  aiuk_admin: "AIUK administrator",
  client_admin: "Client administrator",
  supervisor: "Supervisor",
  agent: "Human agent",
  qa_reviewer: "QA reviewer",
};

/** Readable form of a deterministic workflow condition, e.g. "internet_light is off / red / amber". */
export function describeCondition(cond: StepCondition): string {
  switch (cond.kind) {
    case "always":
      return "Always";
    case "intent":
      return `If customer intent is ${cond.intents.join(" or ")}`;
    case "observation":
      return `If ${cond.observationType} is ${cond.values.join(" / ")}`;
    case "tool_result":
      return `If ${cond.field} is ${cond.values.join(" / ")}`;
  }
}

/**
 * Steps in reading order: breadth-first from the start step following next
 * rules then failure paths, with any unreachable steps appended at the end.
 */
export function orderSteps(def: WorkflowDefinition): WorkflowStep[] {
  const byKey = new Map(def.steps.map((s) => [s.key, s]));
  const seen = new Set<string>();
  const out: WorkflowStep[] = [];
  const queue = [def.startStep];
  while (queue.length) {
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    const step = byKey.get(key);
    if (!step) continue;
    seen.add(key);
    out.push(step);
    // Non-terminal paths first so escalations/completions group towards the end.
    const targets = [...step.next.map((r) => r.to), ...(step.onFailure ? [step.onFailure.to] : [])];
    const sorted = targets.sort((a, b) => terminalRank(byKey.get(a)) - terminalRank(byKey.get(b)));
    queue.push(...sorted);
  }
  const terminalLast = out.filter((s) => terminalRank(s) === 0).concat(out.filter((s) => terminalRank(s) === 1), out.filter((s) => terminalRank(s) === 2));
  for (const s of def.steps) if (!seen.has(s.key)) terminalLast.push(s);
  return terminalLast;
}

function terminalRank(step: WorkflowStep | undefined): number {
  if (!step) return 3;
  if (step.type === "completion") return 1;
  if (step.type === "human_escalation") return 2;
  return 0;
}

export function stepTitle(def: WorkflowDefinition, key: string): string {
  return def.steps.find((s) => s.key === key)?.title ?? humanize(key);
}

export const CHANNEL_LABELS: Record<string, string> = {
  secure_link: "Secure link",
  sms: "SMS link",
  qr: "QR code",
  website: "Website",
  contact_centre: "Contact centre",
};
