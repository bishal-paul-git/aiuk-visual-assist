import { currentUser } from "./auth";
import { can } from "@/lib/auth/rbac";

/**
 * The administrator a configuration editor acts as: always the signed-in user
 * (docs/06 §2). Four-eyes approval therefore needs a second administrator to
 * sign in and publish. Empty when the user cannot edit this tenant's config.
 */
export async function editorIdentity(tenantId: string, permission: "workflow.edit" | "policy.edit"): Promise<{ id: string; name: string; role: string }[]> {
  const user = await currentUser();
  if (!user) return [];
  return can(user, permission, { tenantId }) ? [{ id: user.id, name: user.name, role: user.role }] : [];
}
