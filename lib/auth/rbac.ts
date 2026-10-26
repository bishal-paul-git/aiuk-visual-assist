import type { User, UserRole } from "@/lib/domain/types";

/**
 * Role-based access control (docs/06 §2: RBAC, least privilege, tenant isolation).
 *
 * Pure and isomorphic: the server enforces it on every API route and page, the
 * static demo enforces it in the browser runtime, and the UI uses it only to
 * hide controls a user cannot use. The server is always the authority.
 *
 * Roles (the `UserRole` values on catalog users):
 * - aiuk_admin    Platform administrator (Absolute Intelligence). All tenants.
 * - qa_reviewer   Platform analyst / QA reviewer. Read-only, all tenants, plus QA reviews and evaluation runs.
 * - client_admin  Client administrator. Configuration, and a management platform
 *                 view confined to their own tenant (lib/auth/scope.ts).
 * - supervisor    Contact-centre supervisor. Operates sessions and reads audit for their tenant.
 * - agent         Human agent. Operates sessions for their tenant.
 */

export const PERMISSIONS = [
  "session.view",
  "session.create",
  "session.join",
  "session.take_over",
  "session.end",
  "action.run",
  "workflow.view",
  "workflow.edit",
  "workflow.publish",
  "policy.view",
  "policy.edit",
  "policy.publish",
  "audit.view",
  "settings.view",
  "settings.edit",
  "platform.access",
  "qa.review",
  "qa.evaluate",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "session.view": "View sessions, transcripts and evidence",
  "session.create": "Start sessions and send customer links",
  "session.join": "Join, message, request views, add notes, return to AI",
  "session.take_over": "Take over from the AI",
  "session.end": "End sessions",
  "action.run": "Run business actions",
  "workflow.view": "View workflows",
  "workflow.edit": "Edit workflow drafts",
  "workflow.publish": "Publish workflows",
  "policy.view": "View policies",
  "policy.edit": "Edit policy drafts",
  "policy.publish": "Publish policies",
  "audit.view": "Read audit logs",
  "settings.view": "View settings",
  "settings.edit": "Change settings",
  "platform.access": "Use the management platform (client roles see only their own client)",
  "qa.review": "Review sampled sessions and record QA verdicts",
  "qa.evaluate": "Run AI evaluation sets",
};

export const ROLES: UserRole[] = ["aiuk_admin", "qa_reviewer", "client_admin", "supervisor", "agent"];

export const ROLE_NAMES: Record<UserRole, string> = {
  aiuk_admin: "Platform administrator",
  qa_reviewer: "QA reviewer (read-only)",
  client_admin: "Client administrator",
  supervisor: "Supervisor",
  agent: "Agent",
};

/** Roles that work across every tenant. Everyone else is confined to their own tenant. */
export const PLATFORM_ROLES: readonly UserRole[] = ["aiuk_admin", "qa_reviewer"];

const OPERATE: Permission[] = ["session.view", "session.create", "session.join", "session.take_over", "session.end", "action.run"];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  aiuk_admin: PERMISSIONS.filter((p) => !OPERATE.includes(p) || p === "session.view" || p === "session.create"),
  qa_reviewer: ["session.view", "workflow.view", "policy.view", "audit.view", "settings.view", "platform.access", "qa.review", "qa.evaluate"],
  client_admin: [
    "session.view",
    "workflow.view",
    "workflow.edit",
    "workflow.publish",
    "policy.view",
    "policy.edit",
    "policy.publish",
    "audit.view",
    "settings.view",
    "settings.edit",
    "platform.access",
  ],
  supervisor: [...OPERATE, "workflow.view", "policy.view", "audit.view", "qa.review"],
  agent: OPERATE,
};

/** Anything that belongs to a tenant: a session, workflow, policy or audit record. */
export interface TenantResource {
  tenantId: string;
}

export type Subject = Pick<User, "id" | "role" | "tenantId" | "status">;

export function isPlatformRole(role: UserRole): boolean {
  return PLATFORM_ROLES.includes(role);
}

export function permissionsFor(user: Subject | null | undefined): Permission[] {
  if (!user || user.status !== "active") return [];
  return [...ROLE_PERMISSIONS[user.role]];
}

/**
 * Can `user` exercise `permission`, optionally on a tenant-owned `resource`?
 * Inactive users can do nothing; non-platform roles only act within their tenant.
 */
export function can(user: Subject | null | undefined, permission: Permission, resource?: TenantResource): boolean {
  if (!user || user.status !== "active") return false;
  if (!ROLE_PERMISSIONS[user.role].includes(permission)) return false;
  if (resource && !isPlatformRole(user.role) && resource.tenantId !== user.tenantId) return false;
  return true;
}

/** Tenant filter for list queries: undefined means every tenant. */
export function tenantScope(user: Subject): string | undefined {
  return isPlatformRole(user.role) ? undefined : user.tenantId;
}

/** Narrow a requested tenant filter to what the user may see. Returns null when the request is out of scope. */
export function scopeTenantFilter(user: Subject, requested?: string): string | undefined | null {
  const own = tenantScope(user);
  if (own === undefined) return requested;
  if (requested && requested !== own) return null;
  return own;
}

/** Permission required for each human console command (docs/03 §3). */
export function commandPermission(commandType: string): Permission | null {
  switch (commandType) {
    case "human.join":
    case "human.leave":
    case "human.message":
    case "human.note":
    case "human.request_capture":
    case "human.review_observation":
    case "human.return_to_ai":
      return "session.join";
    case "human.take_over":
      return "session.take_over";
    case "human.run_action":
      return "action.run";
    case "session.end":
      return "session.end";
    default:
      return null;
  }
}

/**
 * Where a user lands after signing in: platform staff (Absolute Intelligence)
 * go to the admin portal, client staff to the client portal.
 */
export function homePathFor(user: Pick<User, "role">): string {
  return isPlatformRole(user.role) ? "/platform" : "/client";
}

/** Plain-English refusal shown to the user. */
export function denialMessage(user: Subject | null | undefined, permission: Permission, resource?: TenantResource): string {
  if (!user) return "Sign in to continue.";
  if (user.status !== "active") return "Your account is not active.";
  if (ROLE_PERMISSIONS[user.role].includes(permission) && resource && resource.tenantId !== user.tenantId) {
    return "This belongs to another client organisation.";
  }
  return `Your role (${ROLE_NAMES[user.role]}) does not allow this: ${permissionPhrase(permission)}.`;
}

/** A permission label for use mid-sentence ("take over from the AI"). */
export function permissionPhrase(permission: Permission): string {
  const label = PERMISSION_LABELS[permission];
  return label.charAt(0).toLowerCase() + label.slice(1);
}
