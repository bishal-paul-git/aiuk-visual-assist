import { describe, expect, it } from "vitest";
import { agents, policies, teams, tenants, users, workflows } from "@/lib/config/catalog";
import { buildClient, createClient, loadClients, storedClients, validateNewClient } from "@/lib/config/clients";
import { demoUsers } from "@/lib/auth/identity";
import { getWorkflowRegistry } from "@/lib/workflow/registry";

const base = { name: "Acme Broadband", template: "broadband", primaryColor: "#112233", staff: [{ name: "Ann Manager", email: "ann@acme.example" }, { name: "Bob Agent", email: "bob@acme.example" }] };

describe("add a client", () => {
  it("validates the form", () => {
    expect(validateNewClient({ ...base, name: "A" })).toMatch(/2 to 40/);
    expect(validateNewClient({ ...base, template: "nope" })).toMatch(/Pick/);
    expect(validateNewClient({ ...base, primaryColor: "red" })).toMatch(/colour/);
    expect(validateNewClient({ ...base, staff: [] })).toMatch(/at least one/);
    expect(validateNewClient({ ...base, staff: [{ name: "Ann", email: "nope" }] })).toMatch(/valid email/);
    expect(validateNewClient({ ...base, staff: [{ name: "Sarah", email: "sarah.jennings@xtelecom.example" }] })).toMatch(/already used/);
    expect(validateNewClient({ ...base, name: "X Telecom" })).toMatch(/already exists/);
    expect(validateNewClient({ ...base, evidenceDays: 0 })).toMatch(/1 to 730/);
    const ok = validateNewClient(base);
    expect(typeof ok).toBe("object");
  });

  it("builds a full client from the template without touching the catalog", () => {
    const before = tenants.length;
    const input = validateNewClient({ ...base, name: "Build Only Co" });
    if (typeof input === "string") throw new Error(input);
    const { client, workflow, policy } = buildClient(input, "2026-11-14T10:00:00.000Z");
    expect(tenants.length).toBe(before);
    expect(client.tenant.id).toBe("tnt_buildonlyco");
    expect(workflow).toMatchObject({ tenantId: "tnt_buildonlyco", status: "published", version: 1, key: "router-troubleshooting" });
    expect(policy).toMatchObject({ tenantId: "tnt_buildonlyco", status: "active" });
    expect(client.agent.workflowIds).toEqual([workflow.id]);
    expect(client.agent.policyIds).toEqual([policy.id]);
    expect(client.users.map((u) => u.role)).toEqual(["client_admin", "agent"]);
  });

  it("creates the client so new sessions can start, and saves it", () => {
    let saved = 0;
    const input = validateNewClient(base);
    if (typeof input === "string") throw new Error(input);
    (globalThis as { __aiukClientChange?: () => void }).__aiukClientChange = () => saved++;
    const c = createClient(input);
    expect(saved).toBe(1);
    expect(tenants.find((t) => t.id === c.tenant.id)?.brand.primaryColor).toBe("#112233");
    expect(agents.some((a) => a.id === c.agent.id)).toBe(true);
    expect(teams.some((t) => t.id === c.team.id)).toBe(true);
    expect(users.filter((u) => u.tenantId === c.tenant.id)).toHaveLength(2);
    expect(policies.some((p) => p.tenantId === c.tenant.id)).toBe(true);
    const wf = getWorkflowRegistry().latestPublished(c.tenant.id, workflows.find((w) => w.tenantId === c.tenant.id)!.key);
    expect(wf?.tenantId).toBe(c.tenant.id);
    // A demo client's staff appear on the demo sign-in.
    expect(demoUsers().some((u) => u.tenantId === c.tenant.id)).toBe(true);
    // Loading the same saved client again does not duplicate it.
    loadClients(structuredClone(storedClients()));
    expect(tenants.filter((t) => t.id === c.tenant.id)).toHaveLength(1);
  });

  it("hides a real client's staff from the demo sign-in", () => {
    const input = validateNewClient({ ...base, name: "Real Energy", template: "boiler", private: true, staff: [{ name: "Rita", email: "rita@realenergy.example" }] });
    if (typeof input === "string") throw new Error(input);
    const c = createClient(input);
    expect(c.tenant.sector).toBe("utilities");
    expect(c.tenant.featureFlags.private_client).toBe(true);
    expect(demoUsers().some((u) => u.tenantId === c.tenant.id)).toBe(false);
  });
});
