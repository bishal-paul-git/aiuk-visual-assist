import type { ToolAction, ToolCallOutcome } from "@/lib/domain/types";
import type { ToolExecutionContext, ToolExecutor } from "@/lib/providers/types";
import { CONTRACT_VERSION, HEADERS, ToolCallError, validateToolResponse, type ToolCallRequest } from "./contract";
import { MIN_SECRET_LENGTH, type ConnectorConfig } from "./config";
import { signatureHeader } from "./signing";
import { lookupSecret } from "./secret-vault";

/**
 * Calls a tenant's own HTTPS endpoint for a business action
 * (docs/INTEGRATION-CONTRACT.md). Server only.
 *
 * - POST JSON { tool, params, sessionId, actionId, tenantId, requestedBy }.
 * - Idempotency-Key: the tool action id (unchanged on retry).
 * - X-VA-Timestamp / X-VA-Signature: HMAC-SHA256 over "<timestamp>.<body>"
 *   with the tenant's secret: the env var the connector names, else the
 *   value entered on Platform → Integrations (./secret-vault.ts).
 * - Per-attempt timeout; one retry after a network error or HTTP 5xx only.
 *   Timeouts and 4xx are not retried.
 * - The response is validated; only the tool's declared result fields are kept.
 *
 * Error messages and outcomes never include the secret, the request body or
 * the raw response.
 */

export interface HttpToolExecutorOptions {
  fetch?: typeof fetch;
  /** Where secrets are read from (by reference). Defaults to process.env, then the secret vault. */
  env?: Record<string, string | undefined>;
  now?: () => number;
  /** Pause before the single retry. */
  retryDelayMs?: number;
}

const MAX_RESPONSE_BYTES = 64 * 1024;

type Attempt =
  | { kind: "response"; status: number; text: string }
  | { kind: "timeout" }
  | { kind: "network" };

export class HttpToolExecutor implements ToolExecutor {
  readonly id = "http";
  private readonly fetchImpl: typeof fetch;
  private readonly secretFor: (ref: string) => string | undefined;
  private readonly now: () => number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly connectorFor: (tenantId: string, tool: string) => ConnectorConfig | undefined,
    opts: HttpToolExecutorOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? ((...args) => globalThis.fetch(...args));
    const env = opts.env;
    this.secretFor = env ? (ref) => env[ref] : (ref) => lookupSecret(ref).value;
    this.now = opts.now ?? Date.now;
    this.retryDelayMs = opts.retryDelayMs ?? 250;
  }

  async execute(action: ToolAction, ctx: ToolExecutionContext): Promise<Record<string, unknown>> {
    return (await this.executeWithOutcome(action, ctx)).result;
  }

  async executeWithOutcome(action: ToolAction, ctx: ToolExecutionContext): Promise<{ result: Record<string, unknown>; outcome: ToolCallOutcome }> {
    const started = this.now();
    const cfg = this.connectorFor(ctx.tenantId, action.toolName);
    const base = { provider: this.id, mode: "http" as const };
    const fail = (message: string, errorCode: string, extra: Partial<ToolCallOutcome> = {}): never => {
      throw new ToolCallError(message, { ...base, status: "failed", latencyMs: this.now() - started, attempts: 0, errorCode, ...extra });
    };

    if (!cfg || cfg.mode !== "http" || !cfg.endpoint) return fail(`No HTTP connector is configured for ${action.toolName}`, "not_configured");
    const url = new URL(cfg.endpoint);
    const endpointHost = url.host;
    const secret = this.secretFor(cfg.secretRef);
    if (!secret || secret.length < MIN_SECRET_LENGTH) return fail(`Integration signing secret ${cfg.secretRef} is not set`, "secret_missing", { endpointHost });

    const request: ToolCallRequest = {
      tool: action.toolName,
      params: action.request,
      sessionId: action.sessionId,
      actionId: action.id,
      tenantId: ctx.tenantId,
      requestedBy: action.requestedBy,
    };
    const body = JSON.stringify(request);

    let attempts = 0;
    let last: Attempt = { kind: "network" };
    while (attempts < 2) {
      attempts += 1;
      last = await this.attempt(url, body, secret, action.id, cfg.timeoutMs, cfg.secretHeader === true);
      const retryable = last.kind === "network" || (last.kind === "response" && last.status >= 500);
      if (!retryable || attempts >= 2) break;
      if (this.retryDelayMs > 0) await new Promise((r) => setTimeout(r, this.retryDelayMs));
    }

    const done = (extra: Partial<ToolCallOutcome>) => ({ ...base, latencyMs: this.now() - started, attempts, endpointHost, ...extra });

    if (last.kind === "timeout") return fail(`${action.toolName} timed out after ${cfg.timeoutMs} ms`, "timeout", done({}));
    if (last.kind === "network") return fail(`${action.toolName} could not reach ${endpointHost}`, "network_error", done({}));
    const httpStatus = last.status;
    if (httpStatus < 200 || httpStatus > 299) return fail(`${action.toolName} returned HTTP ${httpStatus}`, `http_${httpStatus}`, done({ httpStatus }));

    let parsed: unknown;
    try {
      parsed = JSON.parse(last.text);
    } catch {
      return fail(`${action.toolName} returned an invalid response: not JSON`, "invalid_response", done({ httpStatus }));
    }
    const v = validateToolResponse(action.toolName, parsed);
    if (!v.ok) return fail(`${action.toolName} returned an invalid response: ${v.reason}`, "invalid_response", done({ httpStatus }));
    if (v.status === "failed") {
      const code = v.code ?? "client_failed";
      return fail(`${action.toolName} failed in the client system (${code})`, code, done({ httpStatus, externalRef: v.externalRef }));
    }
    return { result: v.result, outcome: { ...done({ httpStatus, externalRef: v.externalRef }), status: "succeeded" } as ToolCallOutcome };
  }

  private async attempt(url: URL, body: string, secret: string, actionId: string, timeoutMs: number, sendSecret: boolean): Promise<Attempt> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const timestamp = Math.floor(this.now() / 1000);
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          [HEADERS.idempotencyKey]: actionId,
          [HEADERS.timestamp]: String(timestamp),
          [HEADERS.signature]: signatureHeader(secret, timestamp, body),
          [HEADERS.contractVersion]: CONTRACT_VERSION,
          ...(sendSecret ? { [HEADERS.secret]: secret } : {}),
        },
        body,
        signal: controller.signal,
        // Never follow redirects: they could leave HTTPS or the configured host.
        redirect: "error",
      });
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_RESPONSE_BYTES) return { kind: "response", status: res.status, text: "" };
      const text = await res.text();
      return { kind: "response", status: res.status, text: text.length > MAX_RESPONSE_BYTES ? "" : text };
    } catch {
      return timedOut ? { kind: "timeout" } : { kind: "network" };
    } finally {
      clearTimeout(timer);
    }
  }
}
