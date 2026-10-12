/**
 * Connector configuration: how each tenant's business actions reach its own
 * systems (docs/INTEGRATION-CONTRACT.md §2).
 *
 * One connector per (tenantId, tool). Sources, later wins per key:
 *   1. the persisted config store (<DATA_DIR>/config.json, `connectors`);
 *   2. the INTEGRATIONS_CONFIG environment variable (JSON).
 * Anything without a connector stays on the simulated sandbox executor.
 *
 * Secrets are never part of the config: `secretRef` names an environment
 * variable (INTEGRATION_SECRET_<TENANT>) that holds the HMAC signing secret.
 */

export type ConnectorMode = "simulated" | "http";

export interface ConnectorConfig {
  tenantId: string;
  tool: string;
  mode: ConnectorMode;
  /** HTTPS endpoint (http://localhost only outside production). Required for mode "http". */
  endpoint?: string;
  /** Name of the env var holding the signing secret. Defaults to INTEGRATION_SECRET_<TENANT>. */
  secretRef: string;
  timeoutMs: number;
  /** Also call the client system for simulation-scenario sessions (sandbox endpoints). Default false. */
  includeScenarioSessions?: boolean;
  /** Human label for the client system, e.g. "ServiceNow". */
  system?: string;
}

/** A connector entry that could not be used. Calls for its tenant/tool fail closed. */
export interface InvalidConnector {
  tenantId: string;
  tool: string;
  source: ConnectorSource;
  error: string;
}

export type ConnectorSource = "env" | "store";

export const DEFAULT_TIMEOUT_MS = 8000;
export const MIN_TIMEOUT_MS = 500;
export const MAX_TIMEOUT_MS = 30_000;
export const MIN_SECRET_LENGTH = 32;

const SECRET_REF = /^INTEGRATION_SECRET_[A-Z0-9_]{1,64}$/;
const ID = /^[a-z][a-z0-9_]{0,63}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export class ConnectorConfigError extends Error {}

/** INTEGRATION_SECRET_NORTHLINE for tnt_northline. */
export function defaultSecretRef(tenantId: string): string {
  return `INTEGRATION_SECRET_${tenantId.replace(/^tnt_/, "").toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/**
 * Endpoints must be HTTPS. Plain http is accepted only for localhost outside
 * production (local reference server, tests). Credentials in the URL are refused.
 */
export function validateEndpoint(raw: string, opts: { production: boolean }): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConnectorConfigError("endpoint is not a valid URL");
  }
  if (url.username || url.password) throw new ConnectorConfigError("endpoint must not contain credentials");
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) && !opts.production) return url;
  throw new ConnectorConfigError(opts.production || url.protocol !== "http:" ? "endpoint must use https" : "endpoint must use https (http is allowed for localhost only)");
}

/** Parse and validate one connector entry. Throws ConnectorConfigError. */
export function parseConnector(raw: unknown, opts: { production: boolean }): ConnectorConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ConnectorConfigError("connector must be an object");
  const r = raw as Record<string, unknown>;
  const tenantId = r.tenantId;
  const tool = r.tool;
  if (typeof tenantId !== "string" || !ID.test(tenantId)) throw new ConnectorConfigError("tenantId is required");
  if (typeof tool !== "string" || !ID.test(tool)) throw new ConnectorConfigError("tool is required");
  const mode = r.mode ?? "simulated";
  if (mode !== "simulated" && mode !== "http") throw new ConnectorConfigError('mode must be "simulated" or "http"');
  if ("secret" in r || "secretValue" in r) throw new ConnectorConfigError("secrets must not be placed in connector config; use secretRef");

  const secretRef = r.secretRef === undefined ? defaultSecretRef(tenantId) : r.secretRef;
  if (typeof secretRef !== "string" || !SECRET_REF.test(secretRef)) throw new ConnectorConfigError("secretRef must name an INTEGRATION_SECRET_* environment variable");

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (r.timeoutMs !== undefined) {
    if (typeof r.timeoutMs !== "number" || !Number.isFinite(r.timeoutMs)) throw new ConnectorConfigError("timeoutMs must be a number");
    if (r.timeoutMs < MIN_TIMEOUT_MS || r.timeoutMs > MAX_TIMEOUT_MS) throw new ConnectorConfigError(`timeoutMs must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`);
    timeoutMs = Math.round(r.timeoutMs);
  }

  let endpoint: string | undefined;
  if (r.endpoint !== undefined) {
    if (typeof r.endpoint !== "string") throw new ConnectorConfigError("endpoint must be a string");
    endpoint = validateEndpoint(r.endpoint, opts).toString();
  }
  if (mode === "http" && !endpoint) throw new ConnectorConfigError("endpoint is required for mode http");

  const system = typeof r.system === "string" ? r.system.slice(0, 80) : undefined;
  return { tenantId, tool, mode, endpoint, secretRef, timeoutMs, includeScenarioSessions: r.includeScenarioSessions === true, system };
}

export interface ParsedConnectors {
  connectors: ConnectorConfig[];
  invalid: InvalidConnector[];
}

/** Parse a list of entries (from env or the store). Bad entries are reported, never silently simulated. */
export function parseConnectors(list: unknown, source: ConnectorSource, opts: { production: boolean }): ParsedConnectors {
  const out: ParsedConnectors = { connectors: [], invalid: [] };
  const items = Array.isArray(list) ? list : list && typeof list === "object" && Array.isArray((list as { connectors?: unknown }).connectors) ? (list as { connectors: unknown[] }).connectors : null;
  if (!items) {
    out.invalid.push({ tenantId: "*", tool: "*", source, error: 'expected an array of connectors or { "connectors": [...] }' });
    return out;
  }
  for (const item of items) {
    try {
      out.connectors.push(parseConnector(item, opts));
    } catch (e) {
      const r = (item ?? {}) as Record<string, unknown>;
      out.invalid.push({
        tenantId: typeof r.tenantId === "string" ? r.tenantId : "*",
        tool: typeof r.tool === "string" ? r.tool : "*",
        source,
        error: e instanceof ConnectorConfigError ? e.message : "invalid connector",
      });
    }
  }
  return out;
}

/** Parse INTEGRATIONS_CONFIG. Malformed JSON is reported as one invalid entry. */
export function parseConnectorsEnv(value: string | undefined, opts: { production: boolean }): ParsedConnectors {
  if (!value || !value.trim()) return { connectors: [], invalid: [] };
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return { connectors: [], invalid: [{ tenantId: "*", tool: "*", source: "env", error: "INTEGRATIONS_CONFIG is not valid JSON" }] };
  }
  return parseConnectors(json, "env", opts);
}

export type ResolvedConnector =
  | { kind: "configured"; config: ConnectorConfig; source: ConnectorSource }
  | { kind: "invalid"; error: string; source: ConnectorSource }
  | { kind: "default" };

const key = (tenantId: string, tool: string) => `${tenantId}|${tool}`;

/**
 * Process-wide connector registry. Env entries override stored entries for the
 * same tenant/tool; an invalid entry blocks its tenant/tool (fail closed).
 */
export class ConnectorRegistry {
  private stored: ParsedConnectors = { connectors: [], invalid: [] };
  private env: ParsedConnectors = { connectors: [], invalid: [] };
  private storedRaw: unknown[] = [];
  /** Called after stored connectors change (persistence hook). */
  onChange?: () => void;

  constructor(private readonly opts: { production: boolean }) {}

  loadEnv(value: string | undefined) {
    this.env = parseConnectorsEnv(value, this.opts);
  }

  /** Replace stored connectors (from config.json, or an admin edit). */
  setStored(list: unknown, { persist = false } = {}) {
    this.storedRaw = Array.isArray(list) ? list : [];
    this.stored = parseConnectors(list ?? [], "store", this.opts);
    if (persist) this.onChange?.();
  }

  /**
   * Stored entries exactly as loaded, for writing back to config.json. Invalid
   * entries are kept so a save never turns a broken HTTP connector into a
   * silently simulated one.
   */
  storedEntries(): unknown[] {
    return this.storedRaw;
  }

  resolve(tenantId: string, tool: string): ResolvedConnector {
    for (const [source, set] of [["env", this.env], ["store", this.stored]] as const) {
      const bad = set.invalid.find((i) => i.tenantId === tenantId && i.tool === tool);
      if (bad) return { kind: "invalid", error: bad.error, source };
      const c = set.connectors.find((x) => x.tenantId === tenantId && x.tool === tool);
      if (c) return { kind: "configured", config: c, source };
    }
    return { kind: "default" };
  }

  /** Every configured connector (env wins), for status pages. */
  list(): { config: ConnectorConfig; source: ConnectorSource }[] {
    const seen = new Map<string, { config: ConnectorConfig; source: ConnectorSource }>();
    for (const c of this.stored.connectors) seen.set(key(c.tenantId, c.tool), { config: c, source: "store" });
    for (const c of this.env.connectors) seen.set(key(c.tenantId, c.tool), { config: c, source: "env" });
    return [...seen.values()];
  }

  invalid(): InvalidConnector[] {
    return [...this.env.invalid, ...this.stored.invalid];
  }
}

const GLOBAL_KEY = "__aiukVisualAssistConnectors";

/**
 * Shared registry. Reads INTEGRATIONS_CONFIG once; the static demo build never
 * reads it, so the GitHub Pages edition always shows the simulated sandbox.
 */
export function getConnectorRegistry(): ConnectorRegistry {
  const g = globalThis as unknown as Record<string, ConnectorRegistry | undefined>;
  let reg = g[GLOBAL_KEY];
  if (!reg) {
    reg = new ConnectorRegistry({ production: process.env.NODE_ENV === "production" });
    if (process.env.STATIC_EXPORT !== "1" && process.env.NEXT_PUBLIC_STATIC_DEMO !== "1") reg.loadEnv(process.env.INTEGRATIONS_CONFIG);
    g[GLOBAL_KEY] = reg;
  }
  return reg;
}
