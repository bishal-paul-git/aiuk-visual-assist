import { authorize } from "@/lib/server/auth";
import { getRuntime } from "@/lib/server/runtime";
import { jsonError, readJson, str } from "@/lib/server/http";
import { testConnector } from "@/lib/server/connector-admin";
import { log } from "@/lib/server/log";

/** Send one test call for a client's tool through its current connector and report what happened. */
export async function POST(request: Request) {
  getRuntime();
  const body = await readJson(request, 4_000);
  const tenantId = str(body?.tenantId, 64);
  const tool = str(body?.tool, 64);
  if (!tenantId || !tool) return jsonError("tenantId and tool are required");
  const auth = await authorize("settings.edit", { tenantId }, { area: "integrations" });
  if (!auth.ok) return auth.response;
  const result = await testConnector(tenantId, tool);
  log.info("integration.connector_tested", { tenantId, tool, route: result.route, ok: result.ok, errorCode: result.errorCode, by: auth.user.id });
  return Response.json(result);
}
