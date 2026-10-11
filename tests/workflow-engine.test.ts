import { describe, expect, it } from "vitest";
import { workflows } from "@/lib/config/catalog";
import { routerTroubleshootingV3 } from "@/lib/config/workflows/router-troubleshooting";
import { assessEvidence, getStep, selectNext, validateWorkflow } from "@/lib/workflow/engine";
import type { VisualObservation, WorkflowDefinition } from "@/lib/domain/types";

function obs(type: string, value: string | undefined, confidence: number, status: VisualObservation["status"] = "confirmed_visible"): VisualObservation {
  return {
    id: `o_${type}`,
    visualEventId: "f1",
    sessionId: "s1",
    observationType: type,
    value,
    observationText: type,
    confidence,
    status,
    requiresConfirmation: false,
    modelVersion: "test",
    timestamp: "2026-10-11T10:00:00Z",
  };
}

describe("workflow validation", () => {
  it.each(workflows.map((w) => [`${w.key} v${w.version}`, w] as const))("%s has no errors", (_, wf) => {
    expect(validateWorkflow(wf).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("rejects broken definitions", () => {
    const broken: WorkflowDefinition = {
      ...routerTroubleshootingV3,
      startStep: "missing",
      steps: routerTroubleshootingV3.steps
        .filter((s) => s.type !== "human_escalation")
        .map((s) => (s.key === "show_router" ? { ...s, evidence: undefined, onFailure: undefined } : s)),
    };
    const messages = validateWorkflow(broken).map((i) => i.message);
    expect(messages).toContain('Start step "missing" does not exist');
    expect(messages).toContain("Visual request must define required evidence");
    expect(messages).toContain("Every workflow must include a human escalation step");
    expect(messages.some((m) => m.includes("targets unknown step"))).toBe(true);
  });
});

describe("branching", () => {
  const lights = getStep(routerTroubleshootingV3, "inspect_lights");

  it("first matching rule wins — no power takes priority", () => {
    const rule = selectNext(lights, { observations: { power_light: "off", internet_light: "off" }, toolResults: {} });
    expect(rule?.to).toBe("guide_power_supply");
  });

  it("internet off routes to cable check", () => {
    const rule = selectNext(lights, { observations: { power_light: "on", internet_light: "off" }, toolResults: {} });
    expect(rule?.to).toBe("show_cables");
  });

  it("returns undefined when nothing matches", () => {
    expect(selectNext(lights, { observations: {}, toolResults: {} })).toBeUndefined();
  });
});

describe("evidence assessment", () => {
  const step = getStep(routerTroubleshootingV3, "inspect_lights");

  it("accepts clear evidence above threshold", () => {
    const a = assessEvidence(step, [obs("power_light", "on", 0.95), obs("internet_light", "off", 0.9), obs("wifi_light", "on", 0.9)], 0.75);
    expect(a.kind).toBe("sufficient");
  });

  it("never accepts unreadable evidence, and recommends a closer view", () => {
    const a = assessEvidence(
      step,
      [obs("power_light", "on", 0.95), obs("internet_light", undefined, 0.3, "unreadable"), obs("wifi_light", "on", 0.9)],
      0.75,
    );
    expect(a.kind).toBe("insufficient");
    if (a.kind === "insufficient") expect(a.recommendation).toBe("closer");
  });

  it("rejects confident-looking values below the step threshold", () => {
    const a = assessEvidence(step, [obs("power_light", "on", 0.95), obs("internet_light", "off", 0.6, "likely_visible"), obs("wifi_light", "on", 0.9)], 0.75);
    expect(a.kind).toBe("insufficient");
  });

  it("asks for another angle when evidence conflicts or is missing", () => {
    const a = assessEvidence(step, [obs("power_light", "on", 0.95), obs("internet_light", "off", 0.5, "conflicting_evidence"), obs("wifi_light", "on", 0.9)], 0.75);
    expect(a.kind === "insufficient" && a.recommendation).toBe("another_angle");
    const b = assessEvidence(step, [], 0.75);
    expect(b.kind === "insufficient" && b.recommendation).toBe("another_angle");
  });
});
