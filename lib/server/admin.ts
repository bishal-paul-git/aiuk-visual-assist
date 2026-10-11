import { users } from "@/lib/config/catalog";
import type { WorkflowDefinition } from "@/lib/domain/types";

/**
 * POC admin identity. Production resolves this from SSO with RBAC
 * (docs/06 §2); the tenant check below is the rule that must survive.
 */
export function resolveAdmin(value: unknown, wf?: WorkflowDefinition): { id: string; name: string } | null {
  const id = typeof value === "string" ? value : "usr_james";
  const u = users.find((x) => x.id === id && (x.role === "aiuk_admin" || x.role === "client_admin") && x.status === "active");
  if (!u) return null;
  if (wf && u.role === "client_admin" && u.tenantId !== wf.tenantId) return null;
  return { id: u.id, name: u.name };
}
