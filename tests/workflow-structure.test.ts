import { describe, expect, it } from "vitest";
import { WorkflowRegistry } from "@/lib/workflow/registry";
import { validateWorkflow } from "@/lib/workflow/engine";
import { parseStructuralOp } from "@/lib/workflow/structure";
import { routerTroubleshootingV3 } from "@/lib/config/workflows/router-troubleshooting";

const admin = { id: "usr_priya", name: "Priya Shah" };
const approver = { id: "usr_james", name: "James Carter" };

function draft() {
  const r = new WorkflowRegistry([structuredClone(routerTroubleshootingV3)], () => "2026-10-11T12:00:00.000Z");
  const d = r.createDraft("wf_router_v3", admin);
  r.updateDraft(d.id, { changeNote: "Structural change" }, admin);
  return { r, id: d.id };
}

const errors = (r: WorkflowRegistry, id: string) => validateWorkflow(r.get(id)!).filter((i) => i.severity === "error");
const keys = (r: WorkflowRegistry, id: string) => r.get(id)!.steps.map((s) => s.key);

describe("structural workflow editing", () => {
  it("adds a step after another, with empty wording blocking publish until written", () => {
    const { r, id } = draft();
    const { workflow, issues } = r.applyStructure(id, { kind: "add_step", step: { key: "check_wifi", type: "question", title: "Check Wi-Fi" }, after: "inspect_lights" }, admin);
    expect(keys(r, id).indexOf("check_wifi")).toBe(keys(r, id).indexOf("inspect_lights") + 1);
    expect(workflow.steps.find((s) => s.key === "check_wifi")).toMatchObject({ type: "question", instruction: "", next: [] });
    expect(issues.filter((i) => i.stepKey === "check_wifi" && i.severity === "error").map((i) => i.message)).toEqual([
      "AI instruction is empty",
      "Non-terminal step has no next rules",
    ]);
    expect(issues.some((i) => i.stepKey === "check_wifi" && i.message === "Step is unreachable")).toBe(true);
    // Publish stays blocked while errors remain.
    expect(() => r.submitForReview(id, admin)).toThrow(/Publish checks failed/);

    r.updateDraft(id, { steps: [{ key: "check_wifi", instruction: "Can you see your Wi-Fi network?", customerPrompt: "Can you see your Wi-Fi?" }] }, admin);
    r.applyStructure(
      id,
      {
        kind: "set_rules",
        key: "check_wifi",
        rules: [
          { when: { kind: "intent", intents: ["affirm"] }, to: "confirm_working", label: "Wi-Fi visible" },
          { when: { kind: "always" }, to: "escalate_unresolved", label: "Anything else" },
        ],
      },
      admin,
    );
    // Make it reachable from the lights step.
    const lights = r.get(id)!.steps.find((s) => s.key === "inspect_lights")!;
    r.applyStructure(id, { kind: "set_rules", key: "inspect_lights", rules: [...lights.next, { when: { kind: "observation", observationType: "wifi_light", values: ["off"] }, to: "check_wifi", label: "Wi-Fi light off" }] }, admin);
    expect(errors(r, id)).toEqual([]);
    r.submitForReview(id, admin);
    r.publish(id, approver);
    expect(r.get(id)?.status).toBe("published");
    expect(r.get("wf_router_v3")?.steps.some((s) => s.key === "check_wifi")).toBe(false);
  });

  it("rejects duplicate or malformed keys and unknown types", () => {
    const { r, id } = draft();
    expect(() => r.applyStructure(id, { kind: "add_step", step: { key: "intake", type: "question", title: "x" } }, admin)).toThrow(/already exists/);
    expect(() => r.applyStructure(id, { kind: "add_step", step: { key: "Bad Key", type: "question", title: "x" } }, admin)).toThrow(/Step key/);
    expect(() => r.applyStructure(id, { kind: "add_step", step: { key: "ok_key", type: "teleport" as never, title: "x" } }, admin)).toThrow(/Step type/);
  });

  it("refuses to remove a referenced step unless references are removed too", () => {
    const { r, id } = draft();
    expect(() => r.applyStructure(id, { kind: "remove_step", key: "guide_power_cycle" }, admin)).toThrow(/still referenced by Check rear cables: rule “Cables connected”/);
    expect(keys(r, id)).toContain("guide_power_cycle");

    const { issues } = r.applyStructure(id, { kind: "remove_step", key: "guide_power_cycle", removeReferences: true }, admin);
    expect(keys(r, id)).not.toContain("guide_power_cycle");
    const rear = r.get(id)!.steps.find((s) => s.key === "show_cables")!;
    expect(rear.next.map((n) => n.to)).toEqual(["guide_reseat_cable"]);
    expect(issues.some((i) => i.stepKey && i.message.includes("guide_power_cycle"))).toBe(false);
    expect(r.audit.at(-1)).toMatchObject({ eventType: "config.workflow_step_removed", payload: { step: "guide_power_cycle", removedReferences: ["Check rear cables: rule “Cables connected”", "Check cables (no camera): rule “Cables checked by touch”"] } });
  });

  it("removes failure paths that point at a removed step, and never removes the start step", () => {
    const { r, id } = draft();
    r.applyStructure(id, { kind: "remove_step", key: "escalate_visual", removeReferences: true }, admin);
    const visual = r.get(id)!.steps.filter((s) => s.type === "visual_request");
    expect(visual.every((s) => s.onFailure === undefined)).toBe(true);
    // Visual requests without a failure path are a blocking publish error.
    expect(errors(r, id).some((e) => e.message === "Visual request must define a failure/escalation path")).toBe(true);
    expect(() => r.applyStructure(id, { kind: "remove_step", key: "welcome", removeReferences: true }, admin)).toThrow(/start step/);
  });

  it("reorders steps without changing branching", () => {
    const { r, id } = draft();
    const before = JSON.stringify(r.get(id)!.steps.find((s) => s.key === "resolved"));
    r.applyStructure(id, { kind: "move_step", key: "resolved", toIndex: 0 }, admin);
    expect(keys(r, id)[0]).toBe("resolved");
    expect(JSON.stringify(r.get(id)!.steps[0])).toBe(before);
    r.applyStructure(id, { kind: "move_step", key: "resolved", toIndex: 999 }, admin);
    expect(keys(r, id).at(-1)).toBe("resolved");
    expect(r.audit.at(-1)?.payload).toMatchObject({ step: "resolved", from: 0, to: keys(r, id).length - 1 });
  });

  it("validates transition rules and flags vocabulary problems at publish time", () => {
    const { r, id } = draft();
    expect(() => r.applyStructure(id, { kind: "set_rules", key: "intake", rules: [{ when: { kind: "always" }, to: "nowhere", label: "x" }] }, admin)).toThrow(/unknown step "nowhere"/);
    expect(() => r.applyStructure(id, { kind: "set_rules", key: "intake", rules: [{ when: { kind: "intent", intents: [] }, to: "show_router", label: "x" }] }, admin)).toThrow(/at least one intent/);
    expect(() => r.applyStructure(id, { kind: "set_rules", key: "intake", rules: [{ when: { kind: "always" }, to: "show_router", label: " " }] }, admin)).toThrow(/label cannot be empty/);
    expect(() => r.applyStructure(id, { kind: "set_rules", key: "intake", rules: [{ when: { kind: "magic" } as never, to: "show_router", label: "x" }] }, admin)).toThrow(/unknown condition/);

    // A rule on a value the workflow vocabulary does not allow is saved but blocks publishing.
    const { issues } = r.applyStructure(
      id,
      { kind: "set_rules", key: "inspect_lights", rules: [{ when: { kind: "observation", observationType: "power_light", values: ["purple"] }, to: "guide_power_supply", label: "Odd colour" }] },
      admin,
    );
    expect(issues.some((i) => i.severity === "error" && i.message === 'Value "purple" is not allowed for power_light')).toBe(true);
    expect(() => r.submitForReview(id, admin)).toThrow(/not allowed for power_light/);
    expect(r.audit.at(-1)).toMatchObject({ eventType: "config.workflow_rules_updated", payload: { step: "inspect_lights", rules: 1 } });
    expect((r.audit.at(-1)?.payload.publishErrors as number) > 0).toBe(true);
  });

  it("edits type-specific settings and clears settings that no longer apply", () => {
    const { r, id } = draft();
    r.applyStructure(id, { kind: "update_step", key: "show_router", patch: { evidence: { checkpoint: "router_front", description: "Whole router", observationTypes: ["device_identified", "power_light"], view: "wide" } } }, admin);
    expect(r.get(id)!.steps.find((s) => s.key === "show_router")!.evidence).toMatchObject({ view: "wide", observationTypes: ["device_identified", "power_light"] });

    r.applyStructure(id, { kind: "update_step", key: "escalate_unresolved", patch: { escalation: { reason: "out_of_scope", severity: "high", humanOnly: true } } }, admin);
    expect(r.get(id)!.steps.find((s) => s.key === "escalate_unresolved")!.escalation).toEqual({ reason: "out_of_scope", severity: "high", humanOnly: true });

    expect(() => r.applyStructure(id, { kind: "update_step", key: "intake", patch: { completion: { outcome: "resolved_by_ai" } } }, admin)).toThrow(/only applies to completion/);
    expect(() => r.applyStructure(id, { kind: "update_step", key: "intake", patch: { onFailure: { to: "intake", reason: "workflow_failure" } } }, admin)).toThrow(/another step/);

    r.applyStructure(id, { kind: "update_step", key: "show_router", patch: { type: "question", title: "Describe the router" } }, admin);
    const s = r.get(id)!.steps.find((x) => x.key === "show_router")!;
    expect(s).toMatchObject({ type: "question", title: "Describe the router" });
    expect(s.evidence).toBeUndefined();
    expect(s.maxAttempts).toBeUndefined();
    expect(r.audit.at(-1)).toMatchObject({ eventType: "config.workflow_step_updated", payload: { step: "show_router", fields: ["title", "type"] } });

    r.applyStructure(id, { kind: "update_step", key: "close_case", patch: { action: { tool: "create_ticket", params: { priority: 2, note: "visual", urgent: false } } } }, admin);
    expect(r.get(id)!.steps.find((x) => x.key === "close_case")!.action).toEqual({ tool: "create_ticket", params: { priority: 2, note: "visual", urgent: false } });
  });

  it("only edits drafts, leaves rejected changes unapplied and audits every change", () => {
    const { r, id } = draft();
    const before = JSON.stringify(r.get(id)!.steps);
    expect(() => r.applyStructure(id, { kind: "set_rules", key: "intake", rules: [{ when: { kind: "always" }, to: "show_router", label: "ok" }, { when: { kind: "always" }, to: "nope", label: "bad" }] }, admin)).toThrow();
    expect(JSON.stringify(r.get(id)!.steps)).toBe(before);
    expect(() => r.applyStructure("wf_router_v3", { kind: "move_step", key: "intake", toIndex: 3 }, admin)).toThrow(/Only drafts/);

    r.applyStructure(id, { kind: "add_step", step: { key: "extra", type: "completion", title: "Extra" } }, admin);
    r.applyStructure(id, { kind: "move_step", key: "extra", toIndex: 1 }, admin);
    r.applyStructure(id, { kind: "remove_step", key: "extra" }, admin);
    expect(r.audit.slice(-3).map((a) => a.eventType)).toEqual(["config.workflow_step_added", "config.workflow_step_moved", "config.workflow_step_removed"]);
    expect(r.audit.at(-1)).toMatchObject({ actorId: "usr_priya", context: { workflowVersion: 4 } });
  });

  it("parses untrusted operations", () => {
    expect(parseStructuralOp(null)).toBe("Invalid operation");
    expect(parseStructuralOp({ kind: "explode" })).toBe("Unknown operation");
    expect(parseStructuralOp({ kind: "set_rules", key: "a", rules: "x" })).toBe("rules must be a list");
    expect(parseStructuralOp({ kind: "remove_step", key: "a", removeReferences: "yes" })).toEqual({ kind: "remove_step", key: "a", removeReferences: false });
  });
});
