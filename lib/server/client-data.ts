import { cache } from "react";
import { connection } from "next/server";
import { getRuntime } from "./runtime";
import { requirePageUser } from "./auth";
import { STATIC_EXPORT } from "./platform-data";
import { getTenant, workflows } from "@/lib/config/catalog";
import type { Tenant, User } from "@/lib/domain/types";
import { can, isPlatformRole, tenantScope, type Permission } from "@/lib/auth/rbac";

/** The client shown to Absolute Intelligence staff previewing the portal, and in the static demo. */
export const DEFAULT_CLIENT = "tnt_northline";

export const CLIENT_SIGN_IN = "/client/sign-in";

/**
 * What one client-portal page may show: one client (the signed-in user's own
 * organisation) and what the user may do there. Platform staff may preview
 * any client with `?org=`; everyone else is confined to their own tenant, so
 * editing the URL can never widen the view.
 */
export interface ClientScope {
  /** Signed-in user; null in the static demo (no server identity). */
  user: User | null;
  tenant: Tenant;
  /** True when platform staff are previewing a client's portal. */
  previewing: boolean;
  rt: ReturnType<typeof getRuntime>;
  states(): ReturnType<ReturnType<typeof getRuntime>["states"]>;
  summaries(): ReturnType<ReturnType<typeof getRuntime>["summaries"]>;
  /** May this user do this in this client's portal? The static demo defers to the browser's demo identity. */
  allows(permission: Permission): boolean;
}

export const clientScope = cache(async (next: string, org?: string): Promise<ClientScope> => {
  let user: User | null = null;
  if (!STATIC_EXPORT) {
    await connection();
    user = await requirePageUser("session.view", next, undefined, CLIENT_SIGN_IN);
  }
  const requested = !STATIC_EXPORT && user && isPlatformRole(user.role) ? getTenant(org ?? "") : undefined;
  const own = user ? tenantScope(user) : undefined;
  const tenant = (own ? getTenant(own) : requested) ?? getTenant(DEFAULT_CLIENT)!;
  const rt = getRuntime();
  return {
    user,
    tenant,
    previewing: Boolean(user && isPlatformRole(user.role)),
    rt,
    states: () => rt.states({ tenantId: tenant.id }),
    summaries: () => rt.summaries({ tenantId: tenant.id }),
    allows: (permission) => (user ? can(user, permission, { tenantId: tenant.id }) : true),
  };
});

/**
 * The workflow a client can try: its newest published one. Northline's router
 * workflow also has simulation scenarios; every other client's workflow runs
 * on live AI only.
 */
export function testableWorkflow(tenantId: string): { key: string; name: string; scenarios: boolean } | undefined {
  const published = workflows
    .filter((w) => w.tenantId === tenantId && w.status === "published")
    .sort((a, b) => b.version - a.version)[0];
  return published ? { key: published.key, name: `${getTenant(tenantId)?.name ?? ""} · ${published.name}`, scenarios: published.key === "router-troubleshooting" } : undefined;
}
