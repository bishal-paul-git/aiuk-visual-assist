import { randomBytes } from "node:crypto";
import type { ToolAction } from "@/lib/domain/types";
import { getTenant } from "@/lib/config/catalog";
import { ConnectorConfigError, defaultSecretRef, getConnectorRegistry, MIN_SECRET_LENGTH, type ConnectorMode } from "@/lib/integrations/config";
import { ToolCallError } from "@/lib/integrations/contract";
import { HttpToolExecutor } from "@/lib/integrations/http-executor";
import { RoutingToolExecutor } from "@/lib/integrations/routing-executor";
import { getSecretVault, lookupSecret } from "@/lib/integrations/secret-vault";
import { tenantTools } from "@/lib/integrations/status";
import { MockToolExecutor } from "@/lib/providers/mock/tools";

/**
 * Connector edits from Platform → Integrations (server edition). Entries are
 * saved to the config store; a secret, when given, goes to the encrypted
 * vault under the tenant's secretRef, so one secret serves all its tools.
 * Tools set by INTEGRATIONS_CONFIG cannot be edited here (the env wins).
 */

export interface ConnectorEdit {
  mode: ConnectorMode;
  endpoint?: string;
  timeoutMs?: number;
  secretHeader?: boolean;
  includeScenarioSessions?: boolean;
  system?: string;
}

export type EditOutcome = { tool: string; ok: true; mode: ConnectorMode } | { tool: string; ok: false; error: string };

export function applyConnectorEdits(tenantId: string, tools: string[], edit: ConnectorEdit, secret?: string): { results: EditOutcome[]; secretSaved: boolean; error?: string } {
  if (!getTenant(tenantId)) return { results: [], secretSaved: false, error: "Unknown client" };
  const registry = getConnectorRegistry();
  const known = new Set(tenantTools(tenantId, registry));
  if (secret !== undefined && secret.length < MIN_SECRET_LENGTH) return { results: [], secretSaved: false, error: `The secret must be at least ${MIN_SECRET_LENGTH} characters` };

  const results: EditOutcome[] = tools.map((tool) => {
    if (!known.has(tool)) return { tool, ok: false, error: "Not a tool of this client" };
    if (registry.sourceOf(tenantId, tool) === "env") return { tool, ok: false, error: "Set by INTEGRATIONS_CONFIG on the server; change it there" };
    if (edit.mode === "simulated") {
      registry.removeStored(tenantId, tool);
      return { tool, ok: true, mode: "simulated" };
    }
    const entry: Record<string, unknown> = { tenantId, tool, mode: edit.mode };
    if (edit.mode === "http") {
      entry.endpoint = edit.endpoint;
      if (edit.timeoutMs !== undefined) entry.timeoutMs = edit.timeoutMs;
      if (edit.secretHeader) entry.secretHeader = true;
      if (edit.system) entry.system = edit.system.slice(0, 80);
    }
    if (edit.includeScenarioSessions) entry.includeScenarioSessions = true;
    try {
      registry.upsertStored(entry);
      return { tool, ok: true, mode: edit.mode };
    } catch (e) {
      return { tool, ok: false, error: e instanceof ConnectorConfigError ? e.message : "Invalid connector" };
    }
  });

  let secretSaved = false;
  if (secret) {
    getSecretVault().set(defaultSecretRef(tenantId), secret);
    secretSaved = true;
  }
  return { results, secretSaved };
}

/** Parameters a test call sends, matching what the published workflows send. */
const TEST_PARAMS: Record<string, Record<string, string>> = {
  line_test: { depth: "standard" },
  update_case: { status: "updated" },
};

export interface TestResult {
  route: "simulated" | "builtin" | "http" | "invalid";
  ok: boolean;
  latencyMs?: number;
  httpStatus?: number;
  errorCode?: string;
  externalRef?: string;
  message: string;
  result?: Record<string, unknown>;
}

/**
 * One real call through the same routing the sessions use, with a throwaway
 * action id (act_test…) and session id ses_connection_test. Nothing is saved
 * to a session. For a client API this is a real request: the receiver should
 * treat ses_connection_test as a test.
 */
export async function testConnector(tenantId: string, tool: string, opts: { fetch?: typeof fetch } = {}): Promise<TestResult> {
  const registry = getConnectorRegistry();
  const http = new HttpToolExecutor(
    (t, tl) => {
      const r = registry.resolve(t, tl);
      return r.kind === "configured" ? r.config : undefined;
    },
    { fetch: opts.fetch },
  );
  const exec = new RoutingToolExecutor(registry, new MockToolExecutor({ default: 0 }), http);
  const route = exec.route(tenantId, tool);
  const action: ToolAction = {
    id: `act_test${randomBytes(5).toString("hex")}`,
    sessionId: "ses_connection_test",
    toolName: tool,
    idempotencyKey: `connection_test:${tool}:${Date.now()}`,
    request: TEST_PARAMS[tool] ?? {},
    status: "running",
    requestedBy: "human",
    startedAt: new Date().toISOString(),
  };
  try {
    const { result, outcome } = await exec.executeWithOutcome(action, { tenantId });
    const where = route === "http" ? (outcome.endpointHost ?? "the client API") : route === "builtin" ? "the built-in records" : "the sandbox";
    return { route, ok: true, latencyMs: outcome.latencyMs, httpStatus: outcome.httpStatus, externalRef: outcome.externalRef, result, message: `Succeeded via ${where}` };
  } catch (e) {
    const o = e instanceof ToolCallError ? e.outcome : undefined;
    return { route, ok: false, latencyMs: o?.latencyMs, httpStatus: o?.httpStatus, errorCode: o?.errorCode, message: explain(o?.errorCode, (e as Error).message) };
  }
}

function explain(code: string | undefined, fallback: string): string {
  switch (code) {
    case "secret_missing":
      return "No secret set. Enter the shared secret and save.";
    case "http_401":
    case "http_403":
      return "The receiver refused the secret (HTTP 401/403). Check the secret matches on both sides.";
    case "http_404":
      return "The endpoint was not found (HTTP 404). Check the URL, and that the n8n workflow is published (active).";
    case "timeout":
      return "No answer in time. Check the receiver is running, or raise the timeout.";
    case "network_error":
      return "Could not reach the endpoint. Check the address and that it is public HTTPS.";
    case "invalid_response":
      return `The receiver answered, but not in the contract shape: ${fallback}`;
    default:
      return fallback;
  }
}

export function secretState(tenantId: string): { set: boolean; source?: "env" | "stored" } {
  const s = lookupSecret(defaultSecretRef(tenantId));
  return { set: Boolean(s.value && s.value.length >= MIN_SECRET_LENGTH), source: s.source };
}
