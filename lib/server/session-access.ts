import type { Permission } from "@/lib/auth/rbac";
import { authError, checkUser, currentUser, type AuthResult } from "./auth";
import { jsonError } from "./http";
import { getRuntime } from "./runtime";

/**
 * Authorise the signed-in user for `permission` on one session. Sessions are
 * tenant-owned, so non-platform roles are refused for other tenants' sessions.
 * 401 when signed out, 404 when the session does not exist, 403 when refused.
 */
export async function authorizeSession(sessionId: string, permission: Permission, context: Record<string, unknown> = {}): Promise<AuthResult> {
  const user = await currentUser();
  if (!user) return { ok: false, response: authError(401, "Sign in required") };
  const entry = getRuntime().get(sessionId);
  if (!entry) return { ok: false, response: jsonError("Session not found", 404) };
  return checkUser(user, permission, { tenantId: entry.state.session.tenantId }, { sessionId, ...context });
}
