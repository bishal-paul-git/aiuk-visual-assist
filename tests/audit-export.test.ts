import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/lib/domain/types";
import type { SessionState } from "@/lib/domain/session";
import { scopeFor } from "@/lib/auth/scope";
import { users } from "@/lib/config/catalog";
import {
  AUDIT_CSV_COLUMNS,
  auditCsvChunks,
  collectAuditRecords,
  csvCell,
  csvLine,
  filterAuditRecords,
  parseExportQuery,
} from "@/lib/audit/export";

// Route-level tests sign in by setting the session cookie the route reads.
const jar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "va_session" && jar.token ? { name, value: jar.token } : undefined) }),
}));

const ev = (id: string, tenantId: string, eventType: AuditEvent["eventType"], timestamp: string, payload: Record<string, unknown> = {}): AuditEvent => ({
  id,
  tenantId,
  actorType: "admin",
  actorId: "usr_priya",
  eventType,
  payload,
  timestamp,
});

describe("CSV cells (RFC 4180)", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(null)).toBe("");
  });

  it("quotes commas, quotes and line breaks, doubling embedded quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
    expect(csvCell('{"a":1,"b":"x"}')).toBe('"{""a"":1,""b"":""x""}"');
  });

  it("terminates records with CRLF", () => {
    expect(csvLine(["a", "b,c", 3])).toBe('a,"b,c",3\r\n');
  });
});

describe("CSV formula-injection guard", () => {
  it.each(["=", "+", "-", "@"])("prefixes cells starting with %s with an apostrophe", (c) => {
    expect(csvCell(`${c}SUM(A1:A9)`)).toBe(`'${c}SUM(A1:A9)`);
  });

  it("also neutralises leading tab and carriage return", () => {
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell("\r=1")).toBe(`"'\r=1"`);
  });

  it("guards first, then quotes, so a payload cannot break out of its cell", () => {
    expect(csvCell('=HYPERLINK("http://evil","x"),1')).toBe(`"'=HYPERLINK(""http://evil"",""x""),1"`);
    expect(csvCell("-1")).toBe("'-1");
  });

  it("does not touch the characters when they are not leading", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("user@example.com")).toBe("user@example.com");
  });
});

describe("export query", () => {
  const q = (s: string) => parseExportQuery(new URLSearchParams(s));

  it("defaults to CSV with no filters", () => {
    expect(q("")).toEqual({ ok: true, format: "csv", query: {} });
  });

  it("parses dates; a date-only `to` includes that whole day", () => {
    const r = q("format=json&from=2026-10-01&to=2026-10-10&tenantId=tnt_northline&category=config");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe("json");
    expect(r.query.from?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.query.to?.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(r.query.tenantId).toBe("tnt_northline");
    expect(r.query.category).toBe("config");
  });

  it("rejects bad values instead of silently widening the export", () => {
    expect(q("format=xlsx").ok).toBe(false);
    expect(q("from=yesterday").ok).toBe(false);
    expect(q("to=2026-13-45").ok).toBe(false);
    expect(q("category=everything").ok).toBe(false);
    expect(q("from=2026-10-10&to=2026-10-01").ok).toBe(false);
  });
});

describe("audit records", () => {
  const state = {
    session: { id: "ses_1", reference: "VA-1", tenantId: "tnt_northline" },
    audit: [ev("s1", "tnt_northline", "session.created", "2026-10-05T09:00:00.000Z")],
  } as unknown as SessionState;
  const config = [
    ev("c1", "tnt_northline", "config.workflow_published", "2026-10-06T09:00:00.000Z", { key: "router", version: 3, workflowId: "wf_router_v3" }),
    ev("c2", "tnt_brightwater", "config.policy_updated", "2026-10-07T09:00:00.000Z", { key: "pol_bw", version: 2, policyId: "pol_bw" }),
  ];
  const security = [
    ev("x1", "tnt_northline", "security.signed_in", "2026-10-08T09:00:00.000Z"),
    ev("x2", "aiuk", "security.signed_in", "2026-10-09T09:00:00.000Z"),
    ev("x3", "tnt_brightwater", "audit.exported", "2026-10-10T09:00:00.000Z"),
  ];
  const all = collectAuditRecords({ states: [state], configEvents: config, securityEvents: security });

  it("merges session, configuration and security trails, newest first", () => {
    expect(all.map((r) => r.event.id)).toEqual(["x3", "x2", "x1", "c2", "c1", "s1"]);
    expect(all.find((r) => r.event.id === "c1")).toMatchObject({ source: "config", reference: "router v3" });
    expect(all.find((r) => r.event.id === "x3")).toMatchObject({ source: "security", reference: "Export" });
    expect(all.find((r) => r.event.id === "s1")).toMatchObject({ source: "session", sessionId: "ses_1", reference: "VA-1" });
  });

  it("confines a client admin to their own client, including config and security events", () => {
    const priya = users.find((u) => u.id === "usr_priya")!;
    expect(filterAuditRecords(all, scopeFor(priya)).map((r) => r.event.id)).toEqual(["x1", "c1", "s1"]);
    // Asking for another client inside the scope yields nothing.
    expect(filterAuditRecords(all, scopeFor(priya), { tenantId: "tnt_brightwater" })).toEqual([]);
  });

  it("lets platform roles filter by client, category and time", () => {
    const james = users.find((u) => u.id === "usr_james")!;
    const scope = scopeFor(james);
    expect(filterAuditRecords(all, scope)).toHaveLength(6);
    expect(filterAuditRecords(all, scope, { tenantId: "tnt_brightwater" }).map((r) => r.event.id)).toEqual(["x3", "c2"]);
    expect(filterAuditRecords(all, scope, { category: "config" }).map((r) => r.event.id)).toEqual(["c2", "c1"]);
    expect(filterAuditRecords(all, scope, { category: "audit" }).map((r) => r.event.id)).toEqual(["x3"]);
    const window = { from: new Date("2026-10-06T00:00:00.000Z"), to: new Date("2026-10-08T09:00:00.000Z") };
    expect(filterAuditRecords(all, scope, window).map((r) => r.event.id)).toEqual(["c2", "c1"]);
  });

  it("streams a header row then one row per record", () => {
    const csv = [...auditCsvChunks(all, 2)].join("");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(AUDIT_CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(all.length + 2); // header + rows + trailing empty after the final CRLF
    expect(lines.at(-1)).toBe("");
  });
});

describe("GET /api/audit/export", () => {
  let GET: (req: Request) => Promise<Response>;
  let signIn: (userId?: string) => void;
  let securityEvents: () => AuditEvent[];

  beforeAll(async () => {
    process.env.AUTH_SECRET = "audit-export-test-secret-0123456789abcdef";
    const token = await import("@/lib/auth/session-token");
    const auth = await import("@/lib/server/auth");
    ({ GET } = await import("@/app/api/audit/export/route"));
    ({ securityEvents } = await import("@/lib/auth/security-log"));
    signIn = (userId) => {
      jar.token = userId ? token.signSession(token.newSessionClaims(userId, "demo"), auth.authSecret()) : undefined;
    };
    // Some activity in two clients so the scope has something to separate.
    const log = await import("@/lib/auth/security-log");
    for (const id of ["usr_priya", "usr_owen", "usr_james"]) log.recordSecurityEvent({ eventType: "security.signed_in", user: users.find((u) => u.id === id)!, payload: {} });
  });

  beforeEach(() => signIn(undefined));

  const req = (qs = "") => new Request(`http://localhost/api/audit/export${qs}`);
  const rows = (csv: string) =>
    csv
      .trim()
      .split("\r\n")
      .slice(1)
      .map((l) => l.split(","));

  it("requires sign-in and the audit.view permission", async () => {
    expect((await GET(req())).status).toBe(401);
    signIn("usr_sarah"); // agent: no audit.view
    expect((await GET(req())).status).toBe(403);
  });

  it("streams a CSV of the client admin's own client only", async () => {
    signIn("usr_priya");
    const res = await GET(req("?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="audit-export-tnt_northline-.*\.csv"/);
    const body = await res.text();
    const data = rows(body);
    expect(data.length).toBeGreaterThan(0);
    const tenantCol = AUDIT_CSV_COLUMNS.indexOf("tenant_id");
    expect(new Set(data.map((r) => r[tenantCol]))).toEqual(new Set(["tnt_northline"]));
    expect(Number(res.headers.get("x-audit-record-count"))).toBe(data.length);
  });

  it("refuses another client's export for a client admin", async () => {
    signIn("usr_priya");
    const res = await GET(req("?tenantId=tnt_brightwater"));
    expect(res.status).toBe(403);
  });

  it("lets a platform admin export one client or all, as JSON", async () => {
    signIn("usr_james");
    const one = (await (await GET(req("?format=json&tenantId=tnt_brightwater"))).json()) as { count: number; events: { tenantId: string }[] };
    expect(one.count).toBe(one.events.length);
    expect(one.events.every((e) => e.tenantId === "tnt_brightwater")).toBe(true);
    const everything = (await (await GET(req("?format=json"))).json()) as { events: { tenantId: string }[] };
    expect(new Set(everything.events.map((e) => e.tenantId)).size).toBeGreaterThan(1);
  });

  it("rejects malformed filters", async () => {
    signIn("usr_james");
    const res = await GET(req("?category=nope"));
    expect(res.status).toBe(400);
  });

  it("records every export as an audit.exported event in the exporter's scope", async () => {
    signIn("usr_priya");
    await (await GET(req("?category=security"))).text();
    const last = securityEvents().at(-1)!;
    expect(last.eventType).toBe("audit.exported");
    expect(last.actorId).toBe("usr_priya");
    expect(last.tenantId).toBe("tnt_northline");
    expect(last.payload).toMatchObject({ format: "csv", category: "security", tenantId: "tnt_northline" });
  });
});
