import { describe, expect, it } from "vitest";
import type { Policy } from "@/lib/domain/types";
import { getPolicy, policies } from "@/lib/config/catalog";
import { checkTool, validatePolicy } from "@/lib/policy/engine";
import { getPolicyRegistry, PolicyRegistry } from "@/lib/policy/registry";
import { SessionRuntime } from "@/lib/server/runtime";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";

const admin = { id: "usr_priya", name: "Priya Shah" };
const approver = { id: "usr_james", name: "James Carter" };

function registry() {
  return new PolicyRegistry(structuredClone(policies), () => "2026-10-11T12:00:00.000Z");
}

describe("policy versioning", () => {
  it("draft → review → publish retires the previous version and is audited", () => {
    const r = registry();
    const d = r.createDraft("pol_northline_standard", admin);
    expect(d).toMatchObject({ id: "pol_northline_standard_v5", key: "pol_northline_standard", version: 5, status: "draft", basedOnVersion: 4 });
    r.updateDraft(d.id, { changeNote: "Line tests need a person", tools: [{ tool: "line_test", mode: "human_only" }] }, admin);
    expect(r.get("pol_northline_standard")?.tools.find((t) => t.tool === "line_test")?.mode).toBe("allow");
    r.submitForReview(d.id, admin);
    r.publish(d.id, approver);
    expect(r.get("pol_northline_standard")?.status).toBe("retired");
    expect(r.active("pol_northline_standard")?.version).toBe(5);
    expect(r.current().find((p) => p.key === "pol_northline_standard")?.id).toBe("pol_northline_standard_v5");
    expect(r.audit.map((a) => a.eventType)).toEqual([
      "config.policy_draft_created",
      "config.policy_updated",
      "config.policy_submitted",
      "config.policy_retired",
      "config.policy_published",
    ]);
    expect(r.audit.at(-1)).toMatchObject({ context: { policyVersion: 5 }, payload: { approvedBy: "James Carter", submittedBy: "Priya Shah" } });
  });

  it("enforces four-eyes approval", () => {
    const r = registry();
    const d = r.createDraft("pol_northline_standard", admin);
    r.updateDraft(d.id, { changeNote: "x" }, admin);
    r.submitForReview(d.id, admin);
    expect(() => r.publish(d.id, admin)).toThrow(/Four-eyes rule/);
    expect(r.publish(d.id, approver)).toMatchObject({ status: "active", approvedBy: "James Carter", approvedById: "usr_james" });
  });

  it("enforces one open draft, draft-only edits, a change note and the publish order", () => {
    const r = registry();
    const d = r.createDraft("pol_northline_standard", admin);
    expect(() => r.createDraft("pol_northline_standard", admin)).toThrow(/already exists/);
    expect(() => r.publish(d.id, approver)).toThrow(/Submit the draft/);
    expect(() => r.submitForReview(d.id, admin)).toThrow(/change note/);
    r.updateDraft(d.id, { changeNote: "x" }, admin);
    r.submitForReview(d.id, admin);
    expect(() => r.updateDraft(d.id, { maxCaptureAttempts: 2 }, admin)).toThrow(/Only drafts/);
    r.reopen(d.id, admin);
    expect(() => r.updateDraft(d.id, { maxCaptureAttempts: 9 }, admin)).toThrow(/1–5/);
    expect(() => r.updateDraft(d.id, { tools: [{ tool: "teleport", mode: "deny" }] }, admin)).toThrow(/Unknown tool/);
    r.discardDraft(d.id, admin);
    expect(r.get(d.id)).toBeUndefined();
    expect(() => r.discardDraft("pol_northline_standard", admin)).toThrow(/unpublished/);
    expect(() => r.discardDraft("pol_brightwater_safety", admin)).toThrow(/only version/);
  });
});

describe("regulated tools are never allowed", () => {
  it("rejects setting a regulated tool to allow, or marking an allowed tool regulated", () => {
    const r = registry();
    const d = r.createDraft("pol_northline_standard", admin);
    expect(() => r.updateDraft(d.id, { tools: [{ tool: "issue_account_credit", mode: "allow" }] }, admin)).toThrow(/regulated tool and can never be allowed/);
    expect(() => r.updateDraft(d.id, { tools: [{ tool: "line_test", risk: "regulated" }] }, admin)).toThrow(/regulated tool/);
    expect(r.get(d.id)?.tools.find((t) => t.tool === "issue_account_credit")?.mode).toBe("human_only");
    expect(r.get(d.id)?.tools.find((t) => t.tool === "line_test")?.risk).toBe("low");
    // Lowering the risk first is a deliberate, separately audited step.
    r.updateDraft(d.id, { tools: [{ tool: "issue_account_credit", risk: "high", mode: "allow" }] }, admin);
    expect(validatePolicy(r.get(d.id)!).some((i) => i.tool === "issue_account_credit" && i.severity === "warning")).toBe(true);
  });

  it("is a blocking publish check and a runtime guard", () => {
    const r = registry();
    const d = r.createDraft("pol_northline_standard", admin);
    r.updateDraft(d.id, { changeNote: "x" }, admin);
    // Simulate a bad import that bypassed the editor.
    r.get(d.id)!.tools.find((t) => t.tool === "issue_account_credit")!.mode = "allow";
    expect(validatePolicy(r.get(d.id)!)).toContainEqual(expect.objectContaining({ tool: "issue_account_credit", severity: "error" }));
    expect(() => r.submitForReview(d.id, admin)).toThrow(/Regulated tools can never be allowed/);
    expect(checkTool(r.get(d.id)!, "issue_account_credit", "ai").decision).toBe("requires_human");
  });

  it("seeded policies pass publish checks", () => {
    for (const p of policies) expect(validatePolicy(p).filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("sessions and policy versions", () => {
  it("new sessions use the published version; running sessions keep theirs", () => {
    const rt = new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
    const before = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Before", scenario: "power_cycle_fix" });
    expect(rt.agentView(before.id)!.state.session).toMatchObject({ policyId: "pol_northline_standard", policyVersion: 4 });

    // The shared registry (same store getPolicy reads).
    const reg = getPolicyRegistry();
    const d = reg.createDraft("pol_northline_standard", admin);
    reg.updateDraft(d.id, { changeNote: "Credits denied outright", tools: [{ tool: "issue_account_credit", mode: "deny" }] }, admin);
    reg.submitForReview(d.id, admin);
    reg.publish(d.id, approver);
    expect(getPolicy("pol_northline_standard")?.version).toBe(5);

    const after = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "After", scenario: "power_cycle_fix" });
    const s = rt.agentView(after.id)!.state;
    expect(s.session).toMatchObject({ policyId: "pol_northline_standard_v5", policyVersion: 5 });
    expect(s.audit.every((e) => e.context?.policyVersion === undefined || e.context.policyVersion === 5)).toBe(true);
    expect(rt.agentView(before.id)!.state.session.policyVersion).toBe(4);
    const old: Policy | undefined = reg.get("pol_northline_standard");
    expect(old?.status).toBe("retired");
  });
});
