import { authorize } from "@/lib/server/auth";
import { jsonError, readJson, str } from "@/lib/server/http";
import { getPersistence, runtimeReady } from "@/lib/server/runtime";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { tenants } from "@/lib/config/catalog";
import { log } from "@/lib/server/log";

/**
 * Delete every conversation of one client (test data), from memory and the
 * database, so a client starts with an empty history. Admins only; a client
 * admin can only reset their own organisation. Needs { tenantId, confirm: "RESET" }.
 */
export async function POST(request: Request) {
  const body = await readJson(request, 2_000);
  const tenantId = str(body?.tenantId, 80);
  if (!tenantId || !tenants.some((t) => t.id === tenantId)) return jsonError("Choose a client", 400);
  const auth = await authorize("settings.edit", { tenantId }, { action: "reset_test_data" });
  if (!auth.ok) return auth.response;
  if (body?.confirm !== "RESET") return jsonError('Type RESET to confirm', 400);

  const rt = await runtimeReady();
  const ids = rt.summaries({ tenantId }).map((s) => s.id);
  const store = getPersistence().store;
  let removed = 0;
  for (const id of ids) {
    if (!rt.removeSession(id)) continue;
    removed += 1;
    await store.deleteSession(id).catch((err) => log.error("store.delete_failed", { sessionId: id, err }));
  }
  recordSecurityEvent({ eventType: "security.test_data_reset", user: auth.user, payload: { tenantId, sessions: removed } });
  log.info("admin.test_data_reset", { tenantId, sessions: removed, by: auth.user.id });
  return Response.json({ removed });
}
