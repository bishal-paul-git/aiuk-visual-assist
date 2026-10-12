import { tenantName } from "@/lib/config/catalog";
import { tenantScope, type Subject, type TenantResource } from "./rbac";

/**
 * Data scope of the management platform (docs/06 §2, tenant isolation).
 *
 * Platform roles (AIUK admin, QA reviewer) see every client. Everyone else
 * (client admins today, client supervisors later) sees only their own tenant.
 * Pure and isomorphic so the filtering is unit-tested once and reused by every
 * platform page and the audit export.
 *
 * `tenantId: undefined` means "all clients". The static demo has no signed-in
 * user on the server, so it always renders the all-clients view.
 */
export interface DataScope {
  tenantId?: string;
}

export const ALL_CLIENTS: DataScope = Object.freeze({});

export function scopeFor(user: Subject | null | undefined): DataScope {
  if (!user) return ALL_CLIENTS;
  const tenantId = tenantScope(user);
  return tenantId ? { tenantId } : ALL_CLIENTS;
}

/** True when the scope covers every client (a platform role, or the static demo). */
export function isAllClients(scope: DataScope): boolean {
  return scope.tenantId === undefined;
}

export function inScope(scope: DataScope, tenantId: string | undefined): boolean {
  return scope.tenantId === undefined || tenantId === scope.tenantId;
}

export function filterByScope<T extends TenantResource>(scope: DataScope, rows: readonly T[]): T[] {
  return scope.tenantId === undefined ? [...rows] : rows.filter((r) => r.tenantId === scope.tenantId);
}

/** Header label for the scope: "All clients" or the client's name. */
export function scopeLabel(scope: DataScope): string {
  return scope.tenantId === undefined ? "All clients" : tenantName(scope.tenantId);
}

/**
 * Narrow a client filter requested in a URL (e.g. `?client=` or `?tenantId=`)
 * to the scope. Out-of-scope requests resolve to the scope's own tenant, so a
 * client admin can never widen their view by editing the URL.
 */
export function effectiveClientFilter(scope: DataScope, requested: string | undefined): string | undefined {
  if (scope.tenantId !== undefined) return scope.tenantId;
  return requested || undefined;
}

/** Everything the management platform lists, keyed by collection. */
export interface PlatformDataset<Tn extends { id: string }, R extends TenantResource> {
  tenants: readonly Tn[];
  workflows: readonly R[];
  policies: readonly R[];
  agents: readonly R[];
  teams: readonly R[];
  users: readonly R[];
  integrations: readonly R[];
  sessions: readonly R[];
  auditEvents: readonly R[];
}

/**
 * Filter a whole platform dataset to a scope. Tenants are matched on `id`,
 * everything else on `tenantId`. Records owned by the internal platform tenant
 * (`aiuk`, e.g. platform staff, platform SSO, platform security events) are
 * never visible to a client-scoped user.
 */
export function scopeDataset<Tn extends { id: string }, R extends TenantResource>(scope: DataScope, data: PlatformDataset<Tn, R>): PlatformDataset<Tn, R> {
  return {
    tenants: scope.tenantId === undefined ? [...data.tenants] : data.tenants.filter((t) => t.id === scope.tenantId),
    workflows: filterByScope(scope, data.workflows),
    policies: filterByScope(scope, data.policies),
    agents: filterByScope(scope, data.agents),
    teams: filterByScope(scope, data.teams),
    users: filterByScope(scope, data.users),
    integrations: filterByScope(scope, data.integrations),
    sessions: filterByScope(scope, data.sessions),
    auditEvents: filterByScope(scope, data.auditEvents),
  };
}
