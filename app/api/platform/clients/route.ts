import { authorize } from "@/lib/server/auth";
import { jsonError, readJson } from "@/lib/server/http";
import { createClient, validateNewClient } from "@/lib/config/clients";
import { recordSecurityEvent } from "@/lib/auth/security-log";

/** Add a client company without code (platform staff only). */
export async function POST(request: Request) {
  const auth = await authorize("settings.edit", { tenantId: "aiuk" }, { action: "client_created" });
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "aiuk_admin") return jsonError("Only platform administrators can add clients.", 403);
  const body = await readJson(request, 20_000);
  const input = validateNewClient((body ?? {}) as Record<string, unknown>);
  if (typeof input === "string") return jsonError(input, 400);
  const client = createClient(input);
  recordSecurityEvent({ eventType: "security.connector_changed", user: auth.user, payload: { tenantId: client.tenant.id, change: "client_created", name: client.tenant.name } });
  return Response.json({ id: client.tenant.id, users: client.users.map((u) => ({ email: u.email, role: u.role })) }, { status: 201 });
}
