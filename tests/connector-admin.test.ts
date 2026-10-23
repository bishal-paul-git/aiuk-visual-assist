import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolAction } from "@/lib/domain/types";
import { BuiltinToolExecutor, builtinResult, isBuiltinTool } from "@/lib/integrations/builtin";
import { ConnectorRegistry, getConnectorRegistry, parseConnector } from "@/lib/integrations/config";
import { RoutingToolExecutor } from "@/lib/integrations/routing-executor";
import { HttpToolExecutor } from "@/lib/integrations/http-executor";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { decryptSecret, encryptSecret, getSecretVault, lookupSecret, SecretVault } from "@/lib/integrations/secret-vault";
import { connectorStatuses } from "@/lib/integrations/status";

const jar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "va_session" && jar.token ? { name, value: jar.token } : undefined) }),
}));

const SECRET = "connector-admin-test-secret-0123456789abcdef";
const CTX = { tenantId: "tnt_northline" };

function action(over: Partial<ToolAction> = {}): ToolAction {
  return {
    id: "act_5f4e3d2c1b0a",
    sessionId: "ses_live",
    toolName: "create_ticket",
    idempotencyKey: "k",
    request: {},
    status: "running",
    requestedBy: "ai",
    startedAt: "2026-10-23T10:00:00.000Z",
    ...over,
  };
}

beforeAll(() => {
  process.env.AUTH_SECRET = "connector-admin-auth-secret-0123456789abcdef";
});

afterEach(() => {
  getConnectorRegistry().setStored([]);
  getSecretVault().load({});
});

describe("built-in actions", () => {
  it("creates stable references for the tools it supports and refuses the others", async () => {
    expect(isBuiltinTool("create_ticket")).toBe(true);
    expect(isBuiltinTool("line_test")).toBe(false);
    const now = Date.parse("2026-10-23T10:00:00Z"); // a Friday
    expect(builtinResult(action(), now)).toEqual({ result: { ticketId: "TK-3D2C1B0A", queue: "network_l2" }, externalRef: "TK-3D2C1B0A" });
    expect(builtinResult(action({ toolName: "book_engineer" }), now).result).toEqual({ jobId: "JOB-3D2C1B0A", slot: "Mon 26 Oct, 08:00–13:00" });
    expect(builtinResult(action({ toolName: "update_case", request: { status: "resolved" } }), now).result).toEqual({ caseId: "CS-3D2C1B0A", status: "resolved" });

    const ex = new BuiltinToolExecutor(() => now);
    const { outcome } = await ex.executeWithOutcome(action());
    expect(outcome).toMatchObject({ mode: "builtin", provider: "visual-assist", status: "succeeded", externalRef: "TK-3D2C1B0A" });
    await expect(ex.executeWithOutcome(action({ toolName: "line_test" }))).rejects.toMatchObject({ outcome: { errorCode: "unsupported_tool" } });
  });

  it("is a connector mode the router honours, but not for scripted scenarios", async () => {
    const registry = new ConnectorRegistry({ production: true });
    registry.setStored([{ tenantId: "tnt_northline", tool: "create_ticket", mode: "builtin" }]);
    expect(() => parseConnector({ tenantId: "tnt_northline", tool: "line_test", mode: "builtin" }, { production: true })).toThrow(/cannot run built-in/);
    const sim = new MockToolExecutor({ default: 0 });
    const router = new RoutingToolExecutor(registry, sim, new HttpToolExecutor(() => undefined));
    expect(router.route("tnt_northline", "create_ticket")).toBe("builtin");
    expect(router.route("tnt_northline", "create_ticket", "power_cycle_fix")).toBe("simulated");
    const { outcome } = await router.executeWithOutcome(action(), CTX);
    expect(outcome.mode).toBe("builtin");
  });
});

describe("secret vault", () => {
  it("encrypts, decrypts and never stores the plain value", () => {
    const sealed = encryptSecret(SECRET);
    expect(sealed).not.toContain(SECRET);
    expect(decryptSecret(sealed)).toBe(SECRET);
    expect(decryptSecret(sealed.slice(0, -4) + "AAAA")).toBeUndefined();
    const v = new SecretVault();
    v.set("INTEGRATION_SECRET_NORTHLINE", SECRET);
    expect(JSON.stringify(v.entries())).not.toContain(SECRET);
    expect(lookupSecret("INTEGRATION_SECRET_NORTHLINE", {}, v)).toEqual({ value: SECRET, source: "stored" });
    expect(lookupSecret("INTEGRATION_SECRET_NORTHLINE", { INTEGRATION_SECRET_NORTHLINE: "from-env" }, v)).toEqual({ value: "from-env", source: "env" });
  });

  it("is saved with the configuration and restored after a restart", async () => {
    const { attachConfigStore } = await import("@/lib/server/store/config");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-vault-"));
    try {
      attachConfigStore(dir);
      getSecretVault().set("INTEGRATION_SECRET_NORTHLINE", SECRET);
      const raw = fs.readFileSync(path.join(dir, "config.json"), "utf8");
      expect(raw).not.toContain(SECRET);
      getSecretVault().load({});
      attachConfigStore(dir);
      expect(getSecretVault().get("INTEGRATION_SECRET_NORTHLINE")).toBe(SECRET);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("connector admin", () => {
  it("applies one setting to many tools, skips locked or unknown ones, and stores the secret once", async () => {
    const { applyConnectorEdits, secretState } = await import("@/lib/server/connector-admin");
    const reg = getConnectorRegistry();
    reg.loadEnv(JSON.stringify([{ tenantId: "tnt_northline", tool: "line_test", mode: "http", endpoint: "https://env.example/lt" }]));
    try {
      const out = applyConnectorEdits(
        "tnt_northline",
        ["update_case", "create_ticket", "line_test", "not_a_tool"],
        { mode: "http", endpoint: "https://n8n.example/webhook/visual-assist/actions", secretHeader: true },
        SECRET,
      );
      expect(out.secretSaved).toBe(true);
      expect(out.results.map((r) => [r.tool, r.ok])).toEqual([
        ["update_case", true],
        ["create_ticket", true],
        ["line_test", false],
        ["not_a_tool", false],
      ]);
      expect(secretState("tnt_northline")).toEqual({ set: true, source: "stored" });
      const rows = connectorStatuses("tnt_northline", reg, [], lookupSecret, { includeEndpoint: true });
      expect(rows.find((r) => r.tool === "update_case")).toMatchObject({ mode: "http", source: "store", secretState: "set", secretSource: "stored", secretHeader: true });
      expect(JSON.stringify(rows)).not.toContain(SECRET);

      expect(applyConnectorEdits("tnt_northline", ["update_case"], { mode: "simulated" }).results[0]).toMatchObject({ ok: true });
      expect(reg.resolve("tnt_northline", "update_case").kind).toBe("default");
      expect(applyConnectorEdits("tnt_northline", ["update_case"], { mode: "http", endpoint: "http://insecure.example" }).results[0]).toMatchObject({ ok: false, error: expect.stringMatching(/^endpoint must use https/) });
      expect(applyConnectorEdits("tnt_northline", ["update_case"], { mode: "builtin" }, "short").error).toMatch(/at least 32/);
    } finally {
      reg.loadEnv(undefined);
    }
  });

  it("tests a connector through the same routing as sessions", async () => {
    const { applyConnectorEdits, testConnector } = await import("@/lib/server/connector-admin");
    applyConnectorEdits("tnt_northline", ["create_ticket"], { mode: "builtin" });
    expect(await testConnector("tnt_northline", "create_ticket")).toMatchObject({ route: "builtin", ok: true, externalRef: expect.stringMatching(/^TK-/) });
    expect(await testConnector("tnt_northline", "line_test")).toMatchObject({ route: "simulated", ok: true });

    applyConnectorEdits("tnt_northline", ["update_case"], { mode: "http", endpoint: "https://n8n.example/webhook/x", secretHeader: true }, SECRET);
    const seen: Record<string, string>[] = [];
    const ok = (async (_u: unknown, init?: RequestInit) => {
      seen.push(init!.headers as Record<string, string>);
      return new Response(JSON.stringify({ status: "succeeded", result: { caseId: "CS-1", status: "updated" }, externalRef: "CS-1" }), { status: 200 });
    }) as typeof fetch;
    expect(await testConnector("tnt_northline", "update_case", { fetch: ok })).toMatchObject({ route: "http", ok: true, httpStatus: 200, externalRef: "CS-1" });
    expect(seen[0]["X-VA-Secret"]).toBe(SECRET);

    const refused = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect(await testConnector("tnt_northline", "update_case", { fetch: refused })).toMatchObject({ ok: false, errorCode: "http_401", message: expect.stringMatching(/refused the secret/) });
  });
});

describe("PUT /api/integrations/connectors", () => {
  let PUT: (req: Request) => Promise<Response>;
  let signIn: (userId?: string) => void;

  beforeAll(async () => {
    const token = await import("@/lib/auth/session-token");
    const auth = await import("@/lib/server/auth");
    ({ PUT } = await import("@/app/api/integrations/connectors/route"));
    signIn = (userId) => {
      jar.token = userId ? token.signSession(token.newSessionClaims(userId, "demo"), auth.authSecret()) : undefined;
    };
  });
  beforeEach(() => signIn(undefined));

  const put = (body: unknown) => PUT(new Request("http://localhost/api/integrations/connectors", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("lets a client admin switch their own tools, never another client's, and never echoes the secret", async () => {
    expect((await put({ tenantId: "tnt_northline", tools: ["create_ticket"], mode: "builtin" })).status).toBe(401);
    signIn("usr_owen");
    expect((await put({ tenantId: "tnt_northline", tools: ["create_ticket"], mode: "builtin" })).status).toBe(403);
    signIn("usr_sarah");
    expect((await put({ tenantId: "tnt_northline", tools: ["create_ticket"], mode: "builtin" })).status).toBe(403);
    signIn("usr_priya");
    const res = await put({ tenantId: "tnt_northline", tools: ["create_ticket", "update_case"], mode: "http", endpoint: "https://n8n.example/webhook/va", secret: SECRET, secretHeader: true });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text)).toMatchObject({ secretSaved: true });
    expect(getConnectorRegistry().resolve("tnt_northline", "create_ticket").kind).toBe("configured");
    expect((await put({ tenantId: "tnt_northline", tools: ["line_test"], mode: "builtin" })).status).toBe(400);
  });
});
