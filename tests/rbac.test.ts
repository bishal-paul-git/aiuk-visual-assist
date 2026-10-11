import { describe, expect, it } from "vitest";
import { users } from "@/lib/config/catalog";
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  can,
  commandPermission,
  denialMessage,
  homePathFor,
  permissionsFor,
  scopeTenantFilter,
  tenantScope,
  type Permission,
} from "@/lib/auth/rbac";
import type { User, UserRole } from "@/lib/domain/types";

const user = (id: string): User => users.find((u) => u.id === id)!;
const sarah = user("usr_sarah"); // agent, Northline
const tom = user("usr_tom"); // supervisor, Northline
const priya = user("usr_priya"); // client admin, Northline
const owen = user("usr_owen"); // client admin, Brightwater
const james = user("usr_james"); // platform admin
const nadia = user("usr_nadia"); // QA reviewer
const lena = user("usr_lena"); // invited (inactive) agent, Brightwater

const NORTHLINE = { tenantId: "tnt_northline" };
const BRIGHTWATER = { tenantId: "tnt_brightwater" };

describe("permission matrix", () => {
  // Expected matrix, written out so any change to the policy is a deliberate test change.
  const expected: Record<UserRole, Permission[]> = {
    aiuk_admin: [
      "session.view",
      "session.create",
      "workflow.view",
      "workflow.edit",
      "workflow.publish",
      "policy.view",
      "policy.edit",
      "policy.publish",
      "audit.view",
      "settings.view",
      "settings.edit",
      "platform.access",
    ],
    qa_reviewer: ["session.view", "workflow.view", "policy.view", "audit.view", "settings.view", "platform.access"],
    client_admin: ["session.view", "workflow.view", "workflow.edit", "workflow.publish", "policy.view", "policy.edit", "policy.publish", "audit.view", "settings.view", "settings.edit"],
    supervisor: ["session.view", "session.create", "session.join", "session.take_over", "session.end", "action.run", "workflow.view", "policy.view", "audit.view"],
    agent: ["session.view", "session.create", "session.join", "session.take_over", "session.end", "action.run"],
  };

  it.each(ROLES)("%s has exactly the expected permissions", (role) => {
    expect([...ROLE_PERMISSIONS[role]].sort()).toEqual([...expected[role]].sort());
  });

  it("every permission is granted to at least one role and every role maps to known permissions", () => {
    for (const p of PERMISSIONS) expect(ROLES.some((r) => ROLE_PERMISSIONS[r].includes(p)), p).toBe(true);
    for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r]) expect(PERMISSIONS).toContain(p);
  });

  it("agents operate sessions but cannot change configuration", () => {
    expect(can(sarah, "session.take_over", NORTHLINE)).toBe(true);
    expect(can(sarah, "action.run", NORTHLINE)).toBe(true);
    expect(can(sarah, "workflow.edit", NORTHLINE)).toBe(false);
    expect(can(sarah, "workflow.publish", NORTHLINE)).toBe(false);
    expect(can(sarah, "audit.view")).toBe(false);
    expect(can(sarah, "platform.access")).toBe(false);
  });

  it("supervisors add audit and read-only configuration", () => {
    expect(can(tom, "audit.view", NORTHLINE)).toBe(true);
    expect(can(tom, "workflow.view", NORTHLINE)).toBe(true);
    expect(can(tom, "workflow.edit", NORTHLINE)).toBe(false);
  });

  it("client admins configure their tenant but never operate sessions", () => {
    expect(can(priya, "workflow.publish", NORTHLINE)).toBe(true);
    expect(can(priya, "policy.edit", NORTHLINE)).toBe(true);
    expect(can(priya, "session.view", NORTHLINE)).toBe(true);
    expect(can(priya, "session.take_over", NORTHLINE)).toBe(false);
    expect(can(priya, "action.run", NORTHLINE)).toBe(false);
  });

  it("platform admins configure every tenant but do not operate live sessions (least privilege)", () => {
    expect(can(james, "workflow.publish", BRIGHTWATER)).toBe(true);
    expect(can(james, "settings.edit")).toBe(true);
    expect(can(james, "session.view", BRIGHTWATER)).toBe(true);
    expect(can(james, "session.take_over", NORTHLINE)).toBe(false);
    expect(can(james, "action.run", NORTHLINE)).toBe(false);
  });

  it("QA reviewers are read-only across tenants", () => {
    expect(can(nadia, "session.view", BRIGHTWATER)).toBe(true);
    expect(can(nadia, "audit.view", NORTHLINE)).toBe(true);
    for (const p of ["session.join", "session.take_over", "session.end", "action.run", "workflow.edit", "workflow.publish", "policy.edit", "settings.edit"] as Permission[]) {
      expect(can(nadia, p, NORTHLINE), p).toBe(false);
    }
  });

  it("inactive or missing users can do nothing", () => {
    expect(lena.status).toBe("invited");
    expect(can(lena, "session.view", BRIGHTWATER)).toBe(false);
    expect(permissionsFor(lena)).toEqual([]);
    expect(can(null, "session.view")).toBe(false);
    expect(can({ ...sarah, status: "disabled" }, "session.view", NORTHLINE)).toBe(false);
  });

  it("maps every agent console command to a permission and refuses unknown commands", () => {
    expect(commandPermission("human.take_over")).toBe("session.take_over");
    expect(commandPermission("human.run_action")).toBe("action.run");
    expect(commandPermission("session.end")).toBe("session.end");
    for (const t of ["human.join", "human.leave", "human.message", "human.note", "human.request_capture", "human.review_observation", "human.return_to_ai"]) {
      expect(commandPermission(t)).toBe("session.join");
    }
    expect(commandPermission("customer.utterance")).toBeNull();
    expect(commandPermission("evidence.interpreted")).toBeNull();
  });

  it("sends each role to a home it can open", () => {
    expect(homePathFor(sarah)).toBe("/console");
    expect(homePathFor(priya)).toBe("/console");
    expect(homePathFor(james)).toBe("/platform");
    expect(homePathFor(nadia)).toBe("/platform");
  });
});

describe("tenant isolation", () => {
  it("non-platform roles are refused on other tenants' resources", () => {
    expect(can(sarah, "session.view", BRIGHTWATER)).toBe(false);
    expect(can(sarah, "session.take_over", BRIGHTWATER)).toBe(false);
    expect(can(tom, "audit.view", BRIGHTWATER)).toBe(false);
    expect(can(owen, "workflow.publish", NORTHLINE)).toBe(false);
    expect(can(owen, "workflow.publish", BRIGHTWATER)).toBe(true);
    expect(can(priya, "workflow.edit", { tenantId: "tnt_harbour" })).toBe(false);
  });

  it("platform roles cross tenants", () => {
    for (const t of ["tnt_northline", "tnt_brightwater", "tnt_harbour"]) {
      expect(can(james, "workflow.edit", { tenantId: t })).toBe(true);
      expect(can(nadia, "session.view", { tenantId: t })).toBe(true);
    }
  });

  it("scopes list queries to the user's tenant", () => {
    expect(tenantScope(sarah)).toBe("tnt_northline");
    expect(tenantScope(james)).toBeUndefined();
    expect(scopeTenantFilter(sarah, undefined)).toBe("tnt_northline");
    expect(scopeTenantFilter(sarah, "tnt_northline")).toBe("tnt_northline");
    expect(scopeTenantFilter(sarah, "tnt_brightwater")).toBeNull();
    expect(scopeTenantFilter(nadia, "tnt_brightwater")).toBe("tnt_brightwater");
    expect(scopeTenantFilter(nadia, undefined)).toBeUndefined();
  });

  it("explains refusals in plain English", () => {
    expect(denialMessage(null, "session.view")).toBe("Sign in to continue.");
    expect(denialMessage(sarah, "session.view", BRIGHTWATER)).toBe("This belongs to another client organisation.");
    expect(denialMessage(nadia, "session.take_over", NORTHLINE)).toBe("Your role (QA reviewer (read-only)) does not allow this: take over from the AI.");
  });
});
