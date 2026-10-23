import { authorize } from "@/lib/server/auth";
import { getRuntime } from "@/lib/server/runtime";
import { jsonError, readJson, str } from "@/lib/server/http";
import { applyConnectorEdits, type ConnectorEdit } from "@/lib/server/connector-admin";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { log } from "@/lib/server/log";

const MODES = new Set(["simulated", "builtin", "http"]);

/**
 * Set how one or more of a client's business actions run: sandbox, built-in
 * records, or the client's HTTPS endpoint, optionally with a new shared secret.
 * Requires settings.edit for that client. The secret is never echoed back.
 */
export async function PUT(request: Request) {
  // Boot the runtime: it restores saved configuration and attaches the store that persists this edit.
  getRuntime();
  const body = await readJson(request, 20_000);
  if (!body) return jsonError("Invalid request");
  const tenantId = str(body.tenantId, 64);
  if (!tenantId) return jsonError("tenantId is required");
  const auth = await authorize("settings.edit", { tenantId }, { area: "integrations" });
  if (!auth.ok) return auth.response;

  const tools = Array.isArray(body.tools) ? body.tools.filter((t): t is string => typeof t === "string" && t.length <= 64) : str(body.tool, 64) ? [body.tool as string] : [];
  if (!tools.length || tools.length > 32) return jsonError("Choose at least one tool");
  const mode = str(body.mode, 16);
  if (!mode || !MODES.has(mode)) return jsonError('mode must be "simulated", "builtin" or "http"');
  const secret = body.secret === undefined || body.secret === "" ? undefined : str(body.secret, 512);
  if (secret === null) return jsonError("Invalid secret");

  const edit: ConnectorEdit = {
    mode: mode as ConnectorEdit["mode"],
    endpoint: str(body.endpoint, 2048) ?? undefined,
    timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : undefined,
    secretHeader: body.secretHeader === true,
    includeScenarioSessions: body.includeScenarioSessions === true,
    system: str(body.system, 80) ?? undefined,
  };
  const out = applyConnectorEdits(tenantId, tools, edit, secret);
  if (out.error) return jsonError(out.error);

  const changed = out.results.filter((r) => r.ok).map((r) => r.tool);
  recordSecurityEvent({
    eventType: "security.connector_changed",
    user: auth.user,
    tenantId,
    payload: { tools: changed, mode, endpointHost: edit.mode === "http" && edit.endpoint ? safeHost(edit.endpoint) : undefined, secretChanged: out.secretSaved },
  });
  log.info("integration.connector_changed", { tenantId, tools: changed, mode, secretChanged: out.secretSaved, by: auth.user.id });
  const failed = out.results.filter((r) => !r.ok);
  return Response.json({ results: out.results, secretSaved: out.secretSaved }, { status: failed.length === out.results.length ? 400 : 200 });
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
