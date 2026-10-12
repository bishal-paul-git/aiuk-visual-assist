import { cache } from "react";
import { connection } from "next/server";
import { getRuntime } from "./runtime";
import { requirePageUser } from "./auth";
import type { User } from "@/lib/domain/types";
import type { Permission, TenantResource } from "@/lib/auth/rbac";
import { filterByScope, inScope, scopeFor, scopeLabel, type DataScope } from "@/lib/auth/scope";

export const STATIC_EXPORT = process.env.STATIC_EXPORT === "1";

/** What one platform page may show: the signed-in user and the tenant they are confined to (if any). */
export interface PlatformScope extends DataScope {
  /** Signed-in user; null in the static demo build (no server identity). */
  user: User | null;
  /** Set for client-scoped roles (client admin, later client supervisor); undefined means all clients. */
  tenantId?: string;
  /** "All clients" or the client's name. */
  label: string;
  /** True for platform roles and the static demo. */
  allClients: boolean;
  rt: ReturnType<typeof getRuntime>;
  /** Session states / summaries already filtered to the scope. */
  states(): ReturnType<ReturnType<typeof getRuntime>["states"]>;
  summaries(): ReturnType<ReturnType<typeof getRuntime>["summaries"]>;
  /** Does the scope include this tenant? */
  includes(tenantId: string | undefined): boolean;
  /** Filter tenant-owned rows to the scope. */
  filter<T extends TenantResource>(rows: readonly T[]): T[];
}

/**
 * Entry point for platform pages: authorise the signed-in user and work out
 * which clients they may see. Platform roles see every client; client roles
 * see only their own tenant. Memoised per request, so a page and its metadata
 * share one check.
 *
 * The static demo build has no request or cookies: it prerenders the
 * all-clients view of the seeded runtime, and the client-side demo identity
 * only changes what the browser runtime allows.
 */
export const platformScope = cache(async (permission: Permission = "platform.access", next = "/platform"): Promise<PlatformScope> => {
  let user: User | null = null;
  if (!STATIC_EXPORT) {
    await connection();
    user = await requirePageUser(permission, next);
  }
  const rt = getRuntime();
  const scope = scopeFor(user);
  const tenantId = scope.tenantId;
  return {
    user,
    tenantId,
    label: scopeLabel(scope),
    allClients: tenantId === undefined,
    rt,
    states: () => rt.states({ tenantId }),
    summaries: () => rt.summaries({ tenantId }),
    includes: (t) => inScope(scope, t),
    filter: (rows) => filterByScope(scope, rows),
  };
});

/**
 * Render per request from the live runtime, for a signed-in user allowed to
 * use the management platform (redirects to sign-in otherwise). Prefer
 * `platformScope()` in pages, which also confines the data to the user's tenant.
 */
export async function platformRuntime(permission: Permission = "platform.access", next = "/platform") {
  return (await platformScope(permission, next)).rt;
}

/** Search params are a request-time API; the static build renders the unfiltered view. */
export async function staticSafeSearchParams<T extends object>(sp: Promise<T>): Promise<T> {
  return STATIC_EXPORT ? ({} as T) : sp;
}
