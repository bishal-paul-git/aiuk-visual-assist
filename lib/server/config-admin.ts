import { users } from "@/lib/config/catalog";
import type { Policy } from "@/lib/domain/types";
import { resolveAdmin } from "./admin";

/**
 * Admin identity for policy changes: the same POC identity as workflows
 * (resolveAdmin), with the same tenant rule — a client administrator may only
 * change their own tenant's policies.
 */
export function resolvePolicyAdmin(value: unknown, policy: Policy): { id: string; name: string } | null {
  const admin = resolveAdmin(value);
  if (!admin) return null;
  const user = users.find((u) => u.id === admin.id);
  if (user?.role === "client_admin" && user.tenantId !== policy.tenantId) return null;
  return admin;
}

/** Administrators who may act on a tenant's configuration (for the "Acting as" picker). */
export function eligibleAdmins(tenantId: string): { id: string; name: string; role: string }[] {
  return users
    .filter((u) => u.status === "active" && (u.role === "aiuk_admin" || (u.role === "client_admin" && u.tenantId === tenantId)))
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));
}
