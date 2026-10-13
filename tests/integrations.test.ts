import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { ToolAction } from "@/lib/domain/types";
import type { ToolExecutor } from "@/lib/providers/types";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import { ToolCallError, validateToolResponse } from "@/lib/integrations/contract";
import {
  ConnectorRegistry,
  defaultSecretRef,
  parseConnector,
  parseConnectorsEnv,
  validateEndpoint,
  type ConnectorConfig,
} from "@/lib/integrations/config";
import { HttpToolExecutor } from "@/lib/integrations/http-executor";
import { RoutingToolExecutor } from "@/lib/integrations/routing-executor";
import { computeSignature, verifySignature } from "@/lib/integrations/signing";
import { connectorStatuses } from "@/lib/integrations/status";
import { createReferenceServer } from "../scripts/reference-client-api.mjs";
import { AGENT } from "./helpers";

const SECRET = "s3cret-for-tests-0123456789abcdef-xyz";
const ENV = { INTEGRATION_SECRET_NORTHLINE: SECRET };
const DEV = { production: false };

function action(over: Partial<ToolAction> = {}): ToolAction {
  return {
    id: "act_123456",
    sessionId: "ses_abc",
    toolName: "line_test",
    idempotencyKey: "ses_abc:run_line_test:line_test:depth=standard",
    request: { depth: "standard" },
    status: "running",
    requestedBy: "ai",
    startedAt: "2026-10-11T10:00:00.000Z",
    ...over,
  };
}

function connector(over: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return parseConnector(
    { tenantId: "tnt_northline", tool: "line_test", mode: "http", endpoint: "https://api.northline.example/va/tools/line_test", timeoutMs: 2000, ...over },
    DEV,
  );
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const OK_LINE_TEST = { status: "succeeded", result: { status: "fault_detected", detail: "loss of sync", testId: "LT-1" }, externalRef: "LT-1" };

type FetchArgs = Parameters<typeof fetch>;
function executor(fetchImpl: (...args: FetchArgs) => Promise<Response>, cfg: ConnectorConfig | undefined = connector(), env: Record<string, string> = ENV) {
  const fetchMock = vi.fn(fetchImpl);
  const ex = new HttpToolExecutor(() => cfg, { fetch: fetchMock as unknown as typeof fetch, env, retryDelayMs: 0 });
  return { ex, fetchMock };
}

async function failure(p: Promise<unknown>): Promise<ToolCallError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ToolCallError);
    return e as ToolCallError;
  }
  throw new Error("expected the call to fail");
}

const header = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);
const CTX = { tenantId: "tnt_northline" };

describe("HttpToolExecutor", () => {
  it("posts the contract body and signs it with HMAC-SHA256 over timestamp.body", async () => {
    const { ex, fetchMock } = executor(async () => json(200, OK_LINE_TEST));
    const { result, outcome } = await ex.executeWithOutcome(action(), CTX);

    expect(result).toEqual({ status: "fault_detected", detail: "loss of sync", testId: "LT-1" });
    expect(outcome).toMatchObject({ provider: "http", mode: "http", status: "succeeded", attempts: 1, httpStatus: 200, externalRef: "LT-1", endpointHost: "api.northline.example" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.northline.example/va/tools/line_test");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    const body = String(init?.body);
    expect(JSON.parse(body)).toEqual({ tool: "line_test", params: { depth: "standard" }, sessionId: "ses_abc", actionId: "act_123456", tenantId: "tnt_northline", requestedBy: "ai" });

    const ts = header(init, "X-VA-Timestamp")!;
    const sig = header(init, "X-VA-Signature")!;
    const expected = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
    expect(sig).toBe(`v1=${expected}`);
    expect(computeSignature(SECRET, ts, body)).toBe(expected);
    expect(verifySignature(SECRET, sig, ts, body)).toBe(true);
    expect(verifySignature("another-secret-another-secret-0000", sig, ts, body)).toBe(false);
    expect(verifySignature(SECRET, sig, ts, body.replace("standard", "deep"))).toBe(false);
    expect(verifySignature(SECRET, sig, ts, body, Number(ts) + 3600)).toBe(false);
    // The secret never appears in the request or the outcome.
    expect(JSON.stringify([init?.headers, body, outcome])).not.toContain(SECRET);
  });

  it("adds the shared secret header only when the connector asks for it (n8n Header Auth)", async () => {
    const plain = executor(async () => json(200, OK_LINE_TEST));
    await plain.ex.executeWithOutcome(action(), CTX);
    expect(header(plain.fetchMock.mock.calls[0][1], "X-VA-Secret")).toBeNull();

    const withHeader = executor(async () => json(200, OK_LINE_TEST), { ...connector(), secretHeader: true });
    const { outcome } = await withHeader.ex.executeWithOutcome(action(), CTX);
    const init = withHeader.fetchMock.mock.calls[0][1];
    expect(header(init, "X-VA-Secret")).toBe(SECRET);
    expect(header(init, "X-VA-Signature")).toMatch(/^v1=/);
    // Still never written to the audit outcome.
    expect(JSON.stringify(outcome)).not.toContain(SECRET);
  });

  it("sends the action id as the Idempotency-Key, unchanged on retry", async () => {
    let n = 0;
    const { ex, fetchMock } = executor(async () => (++n === 1 ? json(503, { error: "busy" }) : json(200, OK_LINE_TEST)));
    const { outcome } = await ex.executeWithOutcome(action(), CTX);
    expect(outcome.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(([, init]) => header(init, "Idempotency-Key"));
    expect(keys).toEqual(["act_123456", "act_123456"]);
    const bodies = fetchMock.mock.calls.map(([, init]) => init?.body);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("times out a slow endpoint and does not retry the timeout", async () => {
    const { ex, fetchMock } = executor(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      { ...connector(), timeoutMs: 30 },
    );
    const e = await failure(ex.executeWithOutcome(action(), CTX));
    expect(e.message).toBe("line_test timed out after 30 ms");
    expect(e.outcome).toMatchObject({ status: "failed", errorCode: "timeout", attempts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a network error or 5xx, never more", async () => {
    let n = 0;
    const flaky = executor(async () => {
      if (++n === 1) throw new TypeError("fetch failed");
      return json(200, OK_LINE_TEST);
    });
    expect((await flaky.ex.executeWithOutcome(action(), CTX)).outcome.attempts).toBe(2);

    const down = executor(async () => json(502, {}));
    const e = await failure(down.ex.executeWithOutcome(action(), CTX));
    expect(down.fetchMock).toHaveBeenCalledTimes(2);
    expect(e.outcome).toMatchObject({ errorCode: "http_502", httpStatus: 502, attempts: 2 });

    const offline = executor(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await failure(offline.ex.executeWithOutcome(action(), CTX))).outcome).toMatchObject({ errorCode: "network_error", attempts: 2 });
    expect(offline.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors (4xx)", async () => {
    const { ex, fetchMock } = executor(async () => json(422, { error: "bad" }));
    const e = await failure(ex.executeWithOutcome(action(), CTX));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(e.outcome).toMatchObject({ errorCode: "http_422", attempts: 1 });
  });

  it("rejects responses that break the contract", async () => {
    const cases: [unknown, RegExp][] = [
      [{ status: "ok", result: {} }, /status must be/],
      [{ status: "succeeded", result: { detail: "x" } }, /result.status is required/],
      [{ status: "succeeded", result: { status: "maybe" } }, /must be one of fault_detected, no_fault/],
      [{ status: "succeeded", result: [] }, /result must be an object/],
      [{ status: "succeeded", result: { status: "no_fault" }, externalRef: { id: 1 } }, /externalRef/],
      [[1, 2], /not a JSON object/],
    ];
    for (const [body, reason] of cases) {
      const { ex } = executor(async () => json(200, body));
      const e = await failure(ex.executeWithOutcome(action(), CTX));
      expect(e.outcome.errorCode).toBe("invalid_response");
      expect(e.message).toMatch(reason);
    }
    const { ex } = executor(async () => new Response("<html>gateway</html>", { status: 200 }));
    expect((await failure(ex.executeWithOutcome(action(), CTX))).message).toMatch(/not JSON/);
  });

  it("maps a client-reported failure to a failed action with its code", async () => {
    const { ex } = executor(async () => json(200, { status: "failed", result: { code: "no_capacity", message: "Call Jane on 07700 900123" } }), connector({ tool: "book_engineer" }));
    const e = await failure(ex.executeWithOutcome(action({ toolName: "book_engineer" }), CTX));
    expect(e.message).toBe("book_engineer failed in the client system (no_capacity)");
    expect(e.outcome.errorCode).toBe("no_capacity");
    expect(JSON.stringify(e)).not.toContain("07700");
  });

  it("keeps only the tool's declared result fields and redacts free text", () => {
    const v = validateToolResponse("line_test", {
      status: "succeeded",
      result: { status: "no_fault", detail: "Engineer will email jane@example.com", testId: "LT-9", customerName: "Jane", raw: { big: true } },
    });
    expect(v).toEqual({ ok: true, status: "succeeded", result: { status: "no_fault", detail: "Engineer will email [email removed]", testId: "LT-9" }, externalRef: undefined });
  });

  it("fails closed without calling out when the signing secret is missing", async () => {
    const { ex, fetchMock } = executor(async () => json(200, OK_LINE_TEST), connector(), {});
    const e = await failure(ex.executeWithOutcome(action(), CTX));
    expect(e.outcome.errorCode).toBe("secret_missing");
    expect(e.message).toBe("Integration signing secret INTEGRATION_SECRET_NORTHLINE is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("connector config", () => {
  it("accepts https only, plus http://localhost outside production", () => {
    expect(validateEndpoint("https://crm.client.example/tools/x", DEV).host).toBe("crm.client.example");
    expect(() => validateEndpoint("http://crm.client.example/tools/x", DEV)).toThrow(/https/);
    expect(() => validateEndpoint("ftp://crm.client.example", DEV)).toThrow(/https/);
    expect(validateEndpoint("http://localhost:4010/tools/x", DEV).port).toBe("4010");
    expect(validateEndpoint("http://127.0.0.1:4010/tools/x", DEV).hostname).toBe("127.0.0.1");
    expect(() => validateEndpoint("http://localhost:4010/tools/x", { production: true })).toThrow(/https/);
    expect(() => validateEndpoint("https://user:pw@crm.client.example", DEV)).toThrow(/credentials/);
    expect(() => validateEndpoint("not a url", DEV)).toThrow(/valid URL/);
  });

  it("accepts secretHeader only as a boolean on https endpoints", () => {
    expect(parseConnector({ tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "https://x.example/t", secretHeader: true }, DEV).secretHeader).toBe(true);
    expect(parseConnector({ tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "https://x.example/t" }, DEV).secretHeader).toBeUndefined();
    expect(() => parseConnector({ tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "https://x.example/t", secretHeader: "yes" }, DEV)).toThrow(/true or false/);
    expect(() => parseConnector({ tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "http://localhost:4010/t", secretHeader: true }, DEV)).toThrow(/https/);
  });

  it("validates entries and keeps secrets out of config", () => {
    const c = parseConnector({ tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "https://x.example/t" }, DEV);
    expect(c).toMatchObject({ mode: "http", secretRef: "INTEGRATION_SECRET_NORTHLINE", timeoutMs: 8000 });
    expect(defaultSecretRef("tnt_brightwater")).toBe("INTEGRATION_SECRET_BRIGHTWATER");
    expect(() => parseConnector({ tenantId: "tnt_northline", tool: "x", mode: "http" }, DEV)).toThrow(/endpoint is required/);
    expect(() => parseConnector({ tenantId: "tnt_northline", tool: "x", mode: "http", endpoint: "https://x.example", secret: "abc" }, DEV)).toThrow(/secretRef/);
    expect(() => parseConnector({ tenantId: "tnt_northline", tool: "x", mode: "http", endpoint: "https://x.example", secretRef: "ANTHROPIC_API_KEY" }, DEV)).toThrow(/INTEGRATION_SECRET_/);
    expect(() => parseConnector({ tenantId: "tnt_northline", tool: "x", mode: "http", endpoint: "https://x.example", timeoutMs: 60_000 }, DEV)).toThrow(/timeoutMs/);
    expect(() => parseConnector({ tenantId: "tnt_northline", tool: "x", mode: "live" }, DEV)).toThrow(/mode/);
    expect(parseConnector({ tenantId: "tnt_northline", tool: "x" }, DEV).mode).toBe("simulated");
  });

  it("parses INTEGRATIONS_CONFIG and reports bad entries", () => {
    expect(parseConnectorsEnv("{nope", DEV).invalid[0].error).toMatch(/not valid JSON/);
    const parsed = parseConnectorsEnv(
      JSON.stringify({ connectors: [{ tenantId: "tnt_northline", tool: "line_test", mode: "http", endpoint: "https://a.example/lt" }, { tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "http://a.example/t" }] }),
      DEV,
    );
    expect(parsed.connectors.map((c) => c.tool)).toEqual(["line_test"]);
    expect(parsed.invalid).toEqual([{ tenantId: "tnt_northline", tool: "create_ticket", source: "env", error: "endpoint must use https (http is allowed for localhost only)" }]);
  });
});

describe("RoutingToolExecutor", () => {
  function setup(entries: unknown[], stored: unknown[] = []) {
    const registry = new ConnectorRegistry(DEV);
    registry.loadEnv(JSON.stringify(entries));
    registry.setStored(stored);
    const sim = new MockToolExecutor({ default: 0 });
    const simSpy = vi.spyOn(sim, "execute");
    const http = { id: "http", execute: vi.fn(), executeWithOutcome: vi.fn(async () => ({ result: { ticketId: "INC1" }, outcome: { provider: "http", mode: "http" as const, status: "succeeded" as const, latencyMs: 5, attempts: 1 } })) };
    return { router: new RoutingToolExecutor(registry, sim, http), simSpy, http, registry };
  }
  const ticket = action({ toolName: "create_ticket" });

  it("defaults to the simulated sandbox", async () => {
    const { router, simSpy, http } = setup([]);
    const { result, outcome } = await router.executeWithOutcome(ticket, CTX);
    expect(result.ticketId).toMatch(/^TK-/);
    expect(outcome).toMatchObject({ provider: "sandbox-tools", mode: "simulated", status: "succeeded" });
    expect(simSpy).toHaveBeenCalledTimes(1);
    expect(http.executeWithOutcome).not.toHaveBeenCalled();
  });

  it("routes per tenant and tool to the client API", async () => {
    const { router, http, simSpy } = setup([{ tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "https://a.example/t" }]);
    await router.executeWithOutcome(ticket, CTX);
    expect(http.executeWithOutcome).toHaveBeenCalledTimes(1);
    // Other tools and other tenants stay simulated.
    expect(router.route("tnt_northline", "line_test")).toBe("simulated");
    expect(router.route("tnt_brightwater", "create_ticket")).toBe("simulated");
    await router.executeWithOutcome(ticket, { tenantId: "tnt_brightwater" });
    expect(simSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps scenario sessions simulated unless the connector opts in", () => {
    const { router } = setup([
      { tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "https://a.example/t" },
      { tenantId: "tnt_northline", tool: "line_test", mode: "http", endpoint: "https://a.example/lt", includeScenarioSessions: true },
    ]);
    expect(router.route("tnt_northline", "create_ticket", "power_cycle_fix")).toBe("simulated");
    expect(router.route("tnt_northline", "line_test", "power_cycle_fix")).toBe("http");
  });

  it("env overrides the config store; explicit simulated mode wins over a stored http entry", () => {
    const { router, registry } = setup(
      [{ tenantId: "tnt_northline", tool: "create_ticket", mode: "simulated" }],
      [
        { tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "https://a.example/t" },
        { tenantId: "tnt_northline", tool: "update_case", mode: "http", endpoint: "https://a.example/c" },
      ],
    );
    expect(router.route("tnt_northline", "create_ticket")).toBe("simulated");
    expect(router.route("tnt_northline", "update_case")).toBe("http");
    expect(registry.storedEntries()).toHaveLength(2);
  });

  it("fails closed for a misconfigured connector", async () => {
    const { router, simSpy } = setup([{ tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: "http://crm.example/t" }]);
    const e = await failure(router.executeWithOutcome(ticket, CTX));
    expect(e.outcome.errorCode).toBe("connector_invalid");
    expect(simSpy).not.toHaveBeenCalled();
  });

  it("reports connector status without secret values", () => {
    const { registry } = setup([{ tenantId: "tnt_northline", tool: "line_test", mode: "http", endpoint: "https://ops.northline.example/va/line-test?key=1", system: "NetOps" }]);
    const rows = connectorStatuses("tnt_northline", registry, [], ENV);
    const lt = rows.find((r) => r.tool === "line_test")!;
    expect(lt).toMatchObject({ mode: "http", source: "env", endpointHost: "ops.northline.example", secretRef: "INTEGRATION_SECRET_NORTHLINE", secretState: "set" });
    expect(rows.find((r) => r.tool === "create_ticket")).toMatchObject({ mode: "simulated", source: "default" });
    expect(JSON.stringify(rows)).not.toContain(SECRET);
    expect(JSON.stringify(rows)).not.toContain("key=1");
    expect(connectorStatuses("tnt_northline", registry, [], {}).find((r) => r.tool === "line_test")!.secretState).toBe("missing");
  });
});

describe("end to end", () => {
  const servers: { close(): void }[] = [];
  afterEach(() => servers.splice(0).forEach((s) => s.close()));

  async function referenceServer() {
    const server = createReferenceServer({ secret: SECRET, tenantId: "tnt_northline", lineTestResult: "no_fault" });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("the reference client API verifies signatures and replays idempotent calls", async () => {
    const base = await referenceServer();
    const ex = new HttpToolExecutor(() => connector({ endpoint: `${base}/tools/line_test` }), { env: ENV });
    const first = await ex.executeWithOutcome(action(), CTX);
    expect(first.result).toMatchObject({ status: "no_fault" });
    const again = await ex.executeWithOutcome(action(), CTX);
    expect(again.result).toEqual(first.result);

    const wrongSecret = new HttpToolExecutor(() => connector({ endpoint: `${base}/tools/line_test` }), { env: { INTEGRATION_SECRET_NORTHLINE: "x".repeat(40) } });
    expect((await failure(wrongSecret.executeWithOutcome(action({ id: "act_other" }), CTX))).outcome.errorCode).toBe("http_401");

    const conflict = await failure(ex.executeWithOutcome(action({ request: { depth: "deep" } }), CTX));
    expect(conflict.outcome.errorCode).toBe("http_409");
  });

  it("a human-run action reaches the client API and is audited without secrets", async () => {
    const base = await referenceServer();
    const registry = new ConnectorRegistry(DEV);
    registry.loadEnv(JSON.stringify([{ tenantId: "tnt_northline", tool: "create_ticket", mode: "http", endpoint: `${base}/tools/create_ticket`, includeScenarioSessions: true }]));
    const http = new HttpToolExecutor((t, tool) => {
      const r = registry.resolve(t, tool);
      return r.kind === "configured" ? r.config : undefined;
    }, { env: ENV });
    const tools: ToolExecutor = new RoutingToolExecutor(registry, new MockToolExecutor({ default: 0 }), http);
    const rt = new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), tools);
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Test", scenario: "power_cycle_fix" });
    rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, { type: "customer", id: "c", name: "Test" });
    rt.dispatch(id, { type: "human.take_over" }, AGENT);
    expect(rt.dispatch(id, { type: "human.run_action", tool: "create_ticket", params: { summary: "No sync" } }, AGENT).error).toBeUndefined();

    await vi.waitFor(() => expect(rt.get(id)!.state.toolActions.find((a) => a.toolName === "create_ticket")?.status).toBe("completed"));
    const s = rt.get(id)!.state;
    const act = s.toolActions.find((a) => a.toolName === "create_ticket")!;
    expect(s.workflow.toolFacts["create_ticket.ticketId"]).toMatch(/^INC\d{6}$/);
    expect(act.outcome).toMatchObject({ provider: "http", mode: "http", status: "succeeded", attempts: 1, endpointHost: expect.stringMatching(/^127\.0\.0\.1:/) });
    const audit = s.audit.find((a) => a.eventType === "integration.called")!;
    expect(audit.payload).toMatchObject({ tool: "create_ticket", status: "succeeded", externalRef: act.outcome!.externalRef });
    expect(typeof audit.payload.latencyMs).toBe("number");
    expect(JSON.stringify(s.audit)).not.toContain(SECRET);
  });
});
