import type { WorkflowDefinition } from "@/lib/domain/types";
import type { Permission } from "@/lib/auth/rbac";
import { authorize } from "./auth";
import { getRuntime } from "./runtime";

export type ConfigAuth = { ok: true; actor: { id: string; name: string } } | { ok: false; response: Response };

/**
 * Configuration changes are made by the signed-in user (docs/06 §2), never by
 * an identity named in the request body. Client admins are confined to their
 * own tenant's configuration; platform admins can act on every tenant.
 */
export async function authorizeConfig(
  permission: Permission,
  target?: Pick<WorkflowDefinition, "id" | "tenantId">,
  kind: "workflow" | "policy" = "workflow",
): Promise<ConfigAuth> {
  // Boot the runtime first: it restores persisted configuration and attaches
  // the store that saves every configuration change (lib/server/store/config.ts).
  getRuntime();
  const auth = await authorize(permission, target ? { tenantId: target.tenantId } : undefined, target ? { [`${kind}Id`]: target.id } : {});
  if (!auth.ok) return auth;
  return { ok: true, actor: { id: auth.user.id, name: auth.user.name } };
}
