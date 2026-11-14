import { describe, expect, it } from "vitest";
import { checkClientPassword, clientPasswordConfigured, isPrivateTenant, privateUserByEmail } from "@/lib/auth/private-clients";
import { demoUsers } from "@/lib/auth/identity";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { agents, policies } from "@/lib/config/catalog";

const env = { CLIENT_SIGNIN_PASSWORDS: JSON.stringify({ tnt_hometelecom: "correct-horse-battery" }) };

describe("private clients (Home Telecom pilot)", () => {
  it("marks Home Telecom private and X Telecom not", () => {
    expect(isPrivateTenant("tnt_hometelecom")).toBe(true);
    expect(isPrivateTenant("tnt_northline")).toBe(false);
  });

  it("never lists private-client staff on the demo pickers", () => {
    expect(demoUsers().some((u) => u.tenantId === "tnt_hometelecom")).toBe(false);
    expect(demoUsers().some((u) => u.tenantId === "tnt_northline")).toBe(true);
  });

  it("checks the client password and fails closed without one", () => {
    expect(checkClientPassword("tnt_hometelecom", "correct-horse-battery", env)).toBe(true);
    expect(checkClientPassword("tnt_hometelecom", "wrong", env)).toBe(false);
    expect(checkClientPassword("tnt_hometelecom", "", {})).toBe(false);
    expect(clientPasswordConfigured("tnt_hometelecom", {})).toBe(false);
    expect(clientPasswordConfigured("tnt_hometelecom", { CLIENT_SIGNIN_PASSWORDS: '{"tnt_hometelecom":"short"}' })).toBe(false);
    expect(checkClientPassword("tnt_hometelecom", "x", { CLIENT_SIGNIN_PASSWORDS: "not json" })).toBe(false);
  });

  it("finds staff by email, case-insensitively, only for private clients", () => {
    expect(privateUserByEmail("Agent1@HomeTelecom.pilot")?.id).toBe("usr_ht_agent1");
    expect(privateUserByEmail("sarah.jennings@xtelecom.example")).toBeUndefined();
    expect(privateUserByEmail("")).toBeUndefined();
  });

  it("has its own router workflow, policy and assistant", () => {
    expect(getWorkflowRegistry().latestPublished("tnt_hometelecom", "router-troubleshooting")?.id).toBe("wf_ht_router_v1");
    expect(policies.find((p) => p.id === "pol_hometelecom_standard")?.tenantId).toBe("tnt_hometelecom");
    expect(agents.find((a) => a.tenantId === "tnt_hometelecom")?.policyIds).toEqual(["pol_hometelecom_standard"]);
  });
});
