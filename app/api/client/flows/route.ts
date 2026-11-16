import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { getTenant, workflows } from "@/lib/config/catalog";

/**
 * What a customer link can be sent for: the client's published flows
 * (e.g. "Router troubleshooting", "New router setup"). Used by the
 * "Start test session" / "Send a customer link" dialog.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant") ?? "";
  const tenant = getTenant(tenantId);
  if (!tenant) return jsonError("Client not found", 404);
  const auth = await authorize("session.create", { tenantId });
  if (!auth.ok) return auth.response;
  const latest = new Map<string, { key: string; name: string; version: number }>();
  for (const w of workflows) {
    if (w.tenantId !== tenantId || w.status !== "published") continue;
    const cur = latest.get(w.key);
    if (!cur || w.version > cur.version) latest.set(w.key, { key: w.key, name: w.name, version: w.version });
  }
  return Response.json({
    tenantName: tenant.brand.displayName,
    private: Boolean(tenant.featureFlags.private_client),
    flows: [...latest.values()].map(({ key, name }) => ({ key, name })),
  });
}
