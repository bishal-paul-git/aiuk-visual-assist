import type { WorkflowDefinition } from "@/lib/domain/types";
import type { Permission } from "@/lib/auth/rbac";
import { authorize } from "./auth";

export type ConfigAuth = { ok: true; actor: { id: string; name: string } } | { ok: false; response: Response };

/**
 * Configuration changes are made by the signed-in user (docs/06 §2), never by
 * an identity named in the request body. Client admins are confined to their
 * own tenant's configuration; platform admins can act on every tenant.
 */
export async function authorizeConfig(permission: Permission, wf?: Pick<WorkflowDefinition, "id" | "tenantId">): Promise<ConfigAuth> {
  const auth = await authorize(permission, wf ? { tenantId: wf.tenantId } : undefined, wf ? { workflowId: wf.id } : {});
  if (!auth.ok) return auth;
  return { ok: true, actor: { id: auth.user.id, name: auth.user.name } };
}
