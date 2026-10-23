import type { SessionState } from "@/lib/domain/session";
import type { ToolCallOutcome } from "@/lib/domain/types";
import { integrations, policies } from "@/lib/config/catalog";
import { MIN_SECRET_LENGTH, type ConnectorRegistry } from "./config";
import { isBuiltinTool } from "./builtin";

/**
 * Read-only connector status for the Integrations and client pages: how each
 * tenant/tool is routed and how its most recent call went. Never exposes a
 * secret value or a full endpoint URL — only the host and whether the
 * referenced secret is present.
 */

export interface ConnectorLastCall {
  at: string;
  status: ToolCallOutcome["status"];
  mode: ToolCallOutcome["mode"];
  provider: string;
  latencyMs?: number;
  externalRef?: string;
  errorCode?: string;
}

export interface ConnectorStatus {
  tenantId: string;
  tool: string;
  /** "invalid" means the entry could not be parsed; calls fail closed. */
  mode: "simulated" | "builtin" | "http" | "invalid";
  /** Whether this tool can run as a built-in action. */
  builtinAvailable: boolean;
  source: "default" | "env" | "store";
  system?: string;
  endpointHost?: string;
  timeoutMs?: number;
  secretRef?: string;
  secretState?: "set" | "missing";
  /** Where the secret comes from: the environment, or entered on the Integrations page. */
  secretSource?: "env" | "stored";
  /** Full endpoint URL, for the editor (only built for users who may edit connectors). */
  endpoint?: string;
  includeScenarioSessions?: boolean;
  secretHeader?: boolean;
  error?: string;
  lastCall?: ConnectorLastCall;
}

/** Tools a tenant can run: catalog integrations, policy tools that are not denied, and configured connectors. */
export function tenantTools(tenantId: string, registry: ConnectorRegistry): string[] {
  const tools = new Set<string>();
  for (const i of integrations) if (i.tenantId === tenantId) i.tools.forEach((t) => tools.add(t));
  for (const p of policies) if (p.tenantId === tenantId) p.tools.filter((t) => t.mode !== "deny").forEach((t) => tools.add(t.tool));
  for (const { config } of registry.list()) if (config.tenantId === tenantId) tools.add(config.tool);
  for (const bad of registry.invalid()) if (bad.tenantId === tenantId && bad.tool !== "*") tools.add(bad.tool);
  return [...tools].sort();
}

function lastCall(states: readonly SessionState[], tenantId: string, tool: string): ConnectorLastCall | undefined {
  let best: ConnectorLastCall | undefined;
  for (const s of states) {
    if (s.session.tenantId !== tenantId) continue;
    for (const a of s.toolActions) {
      if (a.toolName !== tool || !a.completedAt || (a.status !== "completed" && a.status !== "failed")) continue;
      if (best && best.at >= a.completedAt) continue;
      const o = a.outcome;
      best = {
        at: a.completedAt,
        status: o?.status ?? (a.status === "completed" ? "succeeded" : "failed"),
        mode: o?.mode ?? "simulated",
        provider: o?.provider ?? "sandbox-tools",
        latencyMs: o?.latencyMs ?? Math.max(0, Date.parse(a.completedAt) - Date.parse(a.startedAt)),
        externalRef: o?.externalRef,
        errorCode: o?.errorCode,
      };
    }
  }
  return best;
}

export function connectorStatuses(
  tenantId: string,
  registry: ConnectorRegistry,
  states: readonly SessionState[],
  /** An env-like map, or a lookup that also reads the secret vault (lookupSecret). */
  secrets: Record<string, string | undefined> | ((ref: string) => { value?: string; source?: "env" | "stored" }) = process.env,
  opts: { includeEndpoint?: boolean } = {},
): ConnectorStatus[] {
  const secretFor =
    typeof secrets === "function"
      ? secrets
      : (ref: string): { value?: string; source?: "env" | "stored" } => (secrets[ref] ? { value: secrets[ref], source: "env" } : {});
  return tenantTools(tenantId, registry).map((tool) => {
    const r = registry.resolve(tenantId, tool);
    const base = { tenantId, tool, builtinAvailable: isBuiltinTool(tool), lastCall: lastCall(states, tenantId, tool) };
    if (r.kind === "default") return { ...base, mode: "simulated", source: "default" };
    if (r.kind === "invalid") return { ...base, mode: "invalid", source: r.source, error: r.error };
    const c = r.config;
    const secret = c.mode === "http" ? secretFor(c.secretRef) : {};
    return {
      ...base,
      mode: c.mode,
      source: r.source,
      system: c.system,
      endpointHost: c.endpoint ? new URL(c.endpoint).host : undefined,
      timeoutMs: c.timeoutMs,
      secretRef: c.mode === "http" ? c.secretRef : undefined,
      secretState: c.mode === "http" ? (secret.value && secret.value.length >= MIN_SECRET_LENGTH ? "set" : "missing") : undefined,
      secretSource: c.mode === "http" && secret.value ? secret.source : undefined,
      endpoint: opts.includeEndpoint ? c.endpoint : undefined,
      secretHeader: c.secretHeader === true,
      includeScenarioSessions: c.includeScenarioSessions,
    };
  });
}
