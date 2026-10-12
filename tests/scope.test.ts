import { describe, expect, it } from "vitest";
import { agents, integrations, policies, teams, tenants, users, workflows } from "@/lib/config/catalog";
import { ALL_CLIENTS, effectiveClientFilter, filterByScope, inScope, isAllClients, scopeDataset, scopeFor, scopeLabel } from "@/lib/auth/scope";
import type { AuditEvent, User } from "@/lib/domain/types";

const user = (id: string): User => users.find((u) => u.id === id)!;
const priya = user("usr_priya"); // client admin, Northline
const owen = user("usr_owen"); // client admin, Brightwater
const tom = user("usr_tom"); // supervisor, Northline
const james = user("usr_james"); // platform admin
const nadia = user("usr_nadia"); // QA reviewer

const event = (id: string, tenantId: string): AuditEvent => ({
  id,
  tenantId,
  actorType: "admin",
  actorId: "usr_x",
  eventType: "security.signed_in",
  payload: {},
  timestamp: "2026-10-11T10:00:00.000Z",
});

const dataset = () => ({
  tenants,
  workflows,
  policies,
  agents,
  teams,
  users,
  integrations,
  sessions: [{ tenantId: "tnt_northline", id: "s1" }, { tenantId: "tnt_brightwater", id: "s2" }],
  auditEvents: [event("a1", "tnt_northline"), event("a2", "tnt_brightwater"), event("a3", "aiuk")],
});

describe("data scope", () => {
  it("platform roles see every client; client roles are confined to their own", () => {
    expect(scopeFor(james)).toEqual(ALL_CLIENTS);
    expect(scopeFor(nadia)).toEqual(ALL_CLIENTS);
    expect(scopeFor(priya)).toEqual({ tenantId: "tnt_northline" });
    expect(scopeFor(owen)).toEqual({ tenantId: "tnt_brightwater" });
    // Ready for client supervisors: any non-platform role is confined.
    expect(scopeFor(tom)).toEqual({ tenantId: "tnt_northline" });
  });

  it("the static demo (no server identity) renders the all-clients view", () => {
    expect(scopeFor(null)).toEqual(ALL_CLIENTS);
    expect(isAllClients(scopeFor(null))).toBe(true);
  });

  it("labels the scope for the header", () => {
    expect(scopeLabel(scopeFor(james))).toBe("All clients");
    expect(scopeLabel(scopeFor(priya))).toBe("Northline Broadband");
  });

  it("filters any tenant-owned rows", () => {
    const rows = [{ tenantId: "tnt_northline" }, { tenantId: "tnt_brightwater" }, { tenantId: "aiuk" }];
    expect(filterByScope(scopeFor(james), rows)).toHaveLength(3);
    expect(filterByScope(scopeFor(owen), rows)).toEqual([{ tenantId: "tnt_brightwater" }]);
    expect(inScope(scopeFor(priya), "tnt_northline")).toBe(true);
    expect(inScope(scopeFor(priya), "tnt_harbour")).toBe(false);
    expect(inScope(scopeFor(priya), undefined)).toBe(false);
    expect(inScope(scopeFor(james), "tnt_harbour")).toBe(true);
  });

  it("never lets a URL widen a client-scoped view", () => {
    expect(effectiveClientFilter(scopeFor(priya), "tnt_brightwater")).toBe("tnt_northline");
    expect(effectiveClientFilter(scopeFor(priya), undefined)).toBe("tnt_northline");
    expect(effectiveClientFilter(scopeFor(james), "tnt_brightwater")).toBe("tnt_brightwater");
    expect(effectiveClientFilter(scopeFor(james), "")).toBeUndefined();
  });

  it("scopes a whole platform dataset to one client", () => {
    const d = scopeDataset(scopeFor(priya), dataset());
    expect(d.tenants.map((t) => t.id)).toEqual(["tnt_northline"]);
    for (const key of ["workflows", "policies", "agents", "teams", "users", "integrations", "sessions", "auditEvents"] as const) {
      expect(d[key].length, key).toBeGreaterThan(0);
      expect(d[key].every((r) => r.tenantId === "tnt_northline"), key).toBe(true);
    }
    // Platform staff, platform SSO and platform security events stay hidden.
    expect(d.users.some((u) => u.tenantId === "aiuk")).toBe(false);
    expect(d.integrations.some((i) => i.id === "int_aiuk_sso")).toBe(false);
    expect(d.auditEvents.map((e) => e.id)).toEqual(["a1"]);
  });

  it("leaves the dataset whole for platform roles", () => {
    const all = dataset();
    const d = scopeDataset(scopeFor(nadia), all);
    expect(d.tenants).toHaveLength(tenants.length);
    expect(d.users).toHaveLength(users.length);
    expect(d.auditEvents).toHaveLength(3);
    expect(d.sessions).toHaveLength(2);
  });
});
