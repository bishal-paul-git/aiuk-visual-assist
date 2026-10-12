import type { ActorType, AuditEvent } from "@/lib/domain/types";
import { users } from "@/lib/config/catalog";

/** Shared formatting for audit events (session detail + audit explorer). */

export const EVENT_CATEGORIES = ["session", "media", "ai", "workflow", "human", "tool", "policy", "notification", "config", "privacy", "security", "audit", "qa"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  session: "Session",
  media: "Media",
  ai: "AI",
  workflow: "Workflow",
  human: "Human",
  tool: "Tool",
  policy: "Policy",
  notification: "Notification",
  config: "Configuration",
  privacy: "Privacy",
  security: "Security",
  audit: "Audit export",
  qa: "QA review",
};

export const ACTOR_TYPES: ActorType[] = ["customer", "ai", "human_agent", "system", "admin"];

export const ACTOR_LABELS: Record<ActorType, string> = {
  customer: "Customer",
  ai: "AI",
  human_agent: "Human agent",
  system: "System",
  admin: "Admin",
};

export function eventCategory(eventType: string): EventCategory | undefined {
  const prefix = eventType.split(".")[0];
  return (EVENT_CATEGORIES as readonly string[]).includes(prefix) ? (prefix as EventCategory) : undefined;
}

export function actorName(actorType: ActorType, actorId: string): string {
  if (actorType === "human_agent" || actorType === "admin") return users.find((u) => u.id === actorId)?.name ?? actorId;
  return actorId;
}

function short(v: unknown, max = 60): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > max ? `${v.slice(0, max - 1)}…` : v;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** One-line, human-readable rendering of an audit payload (keys in recorded order). */
export function summarizePayload(payload: Record<string, unknown>, max = 4): string {
  const entries = Object.entries(payload).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "—";
  const parts = entries.slice(0, max).map(([k, v]) => `${k}: ${short(v)}`);
  if (entries.length > max) parts.push(`+${entries.length - max} more`);
  return parts.join(" · ");
}

/** Versions in force when the event happened (docs/06 §7). */
export function versionContext(ctx: AuditEvent["context"]): string {
  if (!ctx) return "—";
  const parts: string[] = [];
  if (ctx.workflowVersion !== undefined) parts.push(`workflow v${ctx.workflowVersion}`);
  if (ctx.policyVersion !== undefined) parts.push(`policy v${ctx.policyVersion}`);
  if (ctx.modelVersion) parts.push(ctx.modelVersion);
  if (ctx.promptVersion) parts.push(ctx.promptVersion);
  return parts.length ? parts.join(" · ") : "—";
}

export function firstParam(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
