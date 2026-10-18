import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ToolAction } from "@/lib/domain/types";
import { ToolCallError } from "@/lib/integrations/contract";
import { parseConnector } from "@/lib/integrations/config";
import { HttpToolExecutor } from "@/lib/integrations/http-executor";

// Runs the Code node of the n8n workflow (integrations/n8n) against the real
// HTTP connector, so the n8n side and the server side stay in step.

const SECRET = "n8n-test-secret-0123456789abcdef-0123456789";
const ENV = { INTEGRATION_SECRET_NORTHLINE: SECRET };
const CTX = { tenantId: "tnt_northline" };
const SOURCE = readFileSync("integrations/n8n/business-actions.code.js", "utf8").replace(
  "__SECRET_SHA256__",
  createHash("sha256").update(SECRET).digest("hex"),
);

/** A fake n8n: webhook → Code node → Respond to Webhook, with workflow static data. */
function fakeN8n() {
  const staticData: Record<string, unknown> = {};
  const codeNode = new Function("$input", "$getWorkflowStaticData", SOURCE) as (
    input: { first: () => { json: unknown } },
    getStatic: () => Record<string, unknown>,
  ) => { json: { httpCode: number; response: unknown } }[];
  const calls: number[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const [out] = codeNode({ first: () => ({ json: { headers, params: {}, query: {}, body: JSON.parse(String(init?.body)) } }) }, () => staticData);
    calls.push(out.json.httpCode);
    return new Response(JSON.stringify(out.json.response), { status: out.json.httpCode, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function action(over: Partial<ToolAction> = {}): ToolAction {
  return {
    id: "act_9f8e7d6c5b4a",
    sessionId: "ses_n8n",
    toolName: "line_test",
    idempotencyKey: "ses_n8n:run_line_test:line_test:depth=standard",
    request: { depth: "standard" },
    status: "running",
    requestedBy: "ai",
    startedAt: "2026-10-18T10:00:00.000Z",
    ...over,
  };
}

const connector = (tool: string) =>
  parseConnector(
    { tenantId: "tnt_northline", tool, mode: "http", endpoint: "https://n8n.example/webhook/visual-assist/actions", secretHeader: true, system: "n8n" },
    { production: true },
  );

describe("n8n business-actions workflow", () => {
  it("answers every Northline tool in the contract shape", async () => {
    const n8n = fakeN8n();
    const ex = new HttpToolExecutor((_t, tool) => connector(tool), { fetch: n8n.fetchImpl, env: ENV, retryDelayMs: 0 });

    const line = await ex.executeWithOutcome(action(), CTX);
    expect(line.result).toEqual({ status: "no_fault", detail: expect.stringContaining("no fault"), testId: "LT-7D6C5B4A" });
    expect(line.outcome).toMatchObject({ status: "succeeded", externalRef: "LT-7D6C5B4A", httpStatus: 200 });

    const fault = await ex.executeWithOutcome(action({ id: "act_fault0001", request: { simulate: "fault" } }), CTX);
    expect(fault.result.status).toBe("fault_detected");

    const kase = await ex.executeWithOutcome(action({ id: "act_case0001", toolName: "update_case", request: { status: "resolved" } }), CTX);
    expect(kase.result).toEqual({ caseId: "CS-CASE0001", status: "resolved" });

    const ticket = await ex.executeWithOutcome(action({ id: "act_tick0001", toolName: "create_ticket", request: {} }), CTX);
    expect(ticket.result).toEqual({ ticketId: "TK-TICK0001", queue: "network_l2" });

    const job = await ex.executeWithOutcome(action({ id: "act_job00001", toolName: "book_engineer", request: {} }), CTX);
    expect(job.result).toEqual({ jobId: "JOB-JOB00001", slot: expect.stringMatching(/^\w{3} \d{1,2} \w{3}, 08:00-13:00$/) });
  });

  it("returns the stored result for a repeated Idempotency-Key and 409 for a changed body", async () => {
    const n8n = fakeN8n();
    const ex = new HttpToolExecutor((_t, tool) => connector(tool), { fetch: n8n.fetchImpl, env: ENV, retryDelayMs: 0 });
    const first = await ex.executeWithOutcome(action(), CTX);
    const again = await ex.executeWithOutcome(action(), CTX);
    expect(again.result).toEqual(first.result);
    const changed = await ex.executeWithOutcome(action({ request: { depth: "full" } }), CTX).catch((e: unknown) => e);
    expect(changed).toBeInstanceOf(ToolCallError);
    expect((changed as ToolCallError).outcome.errorCode).toBe("http_409");
  });

  it("refuses a wrong secret and another tenant", async () => {
    const n8n = fakeN8n();
    const wrong = new HttpToolExecutor((_t, tool) => connector(tool), { fetch: n8n.fetchImpl, env: { INTEGRATION_SECRET_NORTHLINE: "x".repeat(40) }, retryDelayMs: 0 });
    const e1 = await wrong.executeWithOutcome(action(), CTX).catch((e: unknown) => e);
    expect((e1 as ToolCallError).outcome.errorCode).toBe("http_401");

    const ex = new HttpToolExecutor(() => ({ ...connector("line_test"), tenantId: "tnt_harbour" }), { fetch: n8n.fetchImpl, env: ENV, retryDelayMs: 0 });
    const e2 = await ex.executeWithOutcome(action(), { tenantId: "tnt_harbour" }).catch((e: unknown) => e);
    expect((e2 as ToolCallError).outcome.errorCode).toBe("http_403");
  });
});
