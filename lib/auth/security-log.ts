import type { ActorType, AuditEvent, DomainEventType, User } from "@/lib/domain/types";

/**
 * Security audit trail: sign-in, sign-out and permission denials (docs/06 §2
 * "security logging"). These events have no session, so they live beside the
 * session audit trails and are merged into the audit explorer. In-memory and
 * capped in the POC; production ships them to the durable audit store / SIEM.
 */

const MAX_EVENTS = 5000;
const g = globalThis as unknown as { __aiukSecurityLog?: AuditEvent[] };

export function securityEvents(): AuditEvent[] {
  return (g.__aiukSecurityLog ??= []);
}

export function actorTypeFor(user: Pick<User, "role">): ActorType {
  return user.role === "agent" || user.role === "supervisor" ? "human_agent" : "admin";
}

export function recordSecurityEvent(input: {
  eventType: Extract<DomainEventType, `security.${string}`>;
  user?: Pick<User, "id" | "role" | "tenantId"> | null;
  tenantId?: string;
  payload: Record<string, unknown>;
  now?: Date;
}): AuditEvent {
  const log = securityEvents();
  const event: AuditEvent = {
    id: `aud_${globalThis.crypto.randomUUID().slice(0, 12)}`,
    tenantId: input.tenantId ?? input.user?.tenantId ?? "aiuk",
    actorType: input.user ? actorTypeFor(input.user) : "system",
    actorId: input.user?.id ?? "anonymous",
    eventType: input.eventType,
    payload: input.payload,
    timestamp: (input.now ?? new Date()).toISOString(),
  };
  log.push(event);
  if (log.length > MAX_EVENTS) log.splice(0, log.length - MAX_EVENTS);
  return event;
}
