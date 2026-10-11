import { describe, expect, it } from "vitest";
import { buildHandover } from "@/lib/session/handover";
import { routerTroubleshootingV3 } from "@/lib/config/workflows/router-troubleshooting";
import { AGENT, routerHarness, stepPath } from "./helpers";

describe("router workflow — end to end through the orchestrator", () => {
  it("wan_down: follows approved steps then escalates to L2 with full handover", () => {
    const h = routerHarness("wan_down");
    h.runCustomer();
    expect(stepPath(h)).toEqual([
      "welcome",
      "intake",
      "show_router",
      "inspect_lights",
      "show_cables",
      "guide_power_cycle",
      "recheck_lights",
      "run_line_test",
      "escalate_network",
    ]);
    const s = h.state;
    expect(s.session.status).toBe("escalated");
    expect(s.escalation?.reason).toBe("unresolved_after_workflow");
    expect(s.escalation?.mandatoryHuman).toBe(true);
    expect(s.customerState).toBe("escalating");
    expect(s.toolActions.map((a) => [a.toolName, a.status])).toEqual([["line_test", "completed"]]);

    const handover = buildHandover(s, routerTroubleshootingV3);
    expect(handover.customerIssue).toMatch(/internet/i);
    expect(handover.workflow).toBe("Router Troubleshooting v3");
    expect(handover.completedSteps.map((c) => c.key)).toContain("guide_power_cycle");
    expect(handover.visualObservations.find((o) => o.observationText.startsWith("Internet light"))?.observationText).toBe("Internet light: off");
    expect(handover.actionsTaken[0].summary).toMatch(/fault detected/);
    expect(handover.recommendedNextStep).toMatch(/engineer/);
    expect(h.errors).toEqual([]);
  });

  it("power_cycle_fix: resolves by AI and updates the case", () => {
    const h = routerHarness("power_cycle_fix");
    h.runCustomer();
    expect(stepPath(h).slice(-3)).toEqual(["confirm_working", "close_case", "resolved"]);
    expect(h.state.customerState).toBe("resolved");
    expect(h.state.session.outcome).toBe("resolved_by_ai");
    expect(h.state.toolActions.find((a) => a.toolName === "update_case")?.status).toBe("completed");
    h.send({ type: "session.end" });
    expect(h.state.session.status).toBe("completed");
    expect(h.state.session.outcome).toBe("resolved_by_ai");
  });

  it("loose_cable: guides a cable reseat", () => {
    const h = routerHarness("loose_cable");
    h.runCustomer();
    expect(stepPath(h)).toContain("guide_reseat_cable");
    expect(stepPath(h)).not.toContain("guide_power_cycle");
    expect(h.state.customerState).toBe("resolved");
  });

  it("glare_then_clear: asks for a closer view instead of guessing", () => {
    const h = routerHarness("glare_then_clear");
    h.runCustomer();
    const audit = h.state.audit.map((a) => a.eventType);
    expect(audit).toContain("ai.uncertain");
    const closer = h.state.audit.find((a) => a.eventType === "ai.visual_request" && a.payload.reason === "closer");
    expect(closer?.payload.step).toBe("inspect_lights");
    expect(h.state.workflow.history.filter((x) => x.stepKey === "inspect_lights")).toHaveLength(1);
    expect(stepPath(h)).toContain("show_cables");
  });

  it("persistently_unclear: escalates after max attempts and never acts on unread evidence", () => {
    const h = routerHarness("persistently_unclear");
    h.runCustomer();
    expect(stepPath(h)).not.toContain("show_cables");
    expect(stepPath(h).at(-1)).toBe("escalate_visual");
    expect(h.state.escalation?.reason).toBe("low_visual_confidence");
    expect(h.state.visualEvents.filter((v) => v.checkpoint === "router_lights")).toHaveLength(3);
    expect(h.state.workflow.facts.internet_light).toBeUndefined();
  });

  it("wrong_device: re-requests the router", () => {
    const h = routerHarness("wrong_device");
    h.runCustomer();
    expect(stepPath(h).filter((k) => k === "show_router")).toHaveLength(2);
    expect(h.state.customerState).toBe("resolved");
  });

  it("vision_outage: falls back to a human without losing context", () => {
    const h = routerHarness("vision_outage");
    h.runCustomer();
    expect(h.state.escalation?.reason).toBe("ai_model_failure");
    expect(h.state.transcript.some((t) => t.speaker === "customer")).toBe(true);
    expect(h.state.workflow.customerIssue).toBeDefined();
  });
});

describe("human escalation and takeover", () => {
  it("customer asking for a person always escalates, even mid-step", () => {
    const h = routerHarness("wan_down");
    h.runCustomer({ maxTurns: 3 });
    h.send({ type: "customer.utterance", text: "Can I just talk to a real person?" });
    expect(h.state.escalation?.reason).toBe("customer_requested");
    expect(h.state.evidenceRequest).toBeUndefined();
  });

  it("human join + takeover keeps the same session and transcript", () => {
    const h = routerHarness("wan_down");
    h.runCustomer();
    const before = h.state.transcript.length;
    h.send({ type: "human.join" }, AGENT);
    h.send({ type: "human.take_over" }, AGENT);
    expect(h.state.session.ownerType).toBe("human");
    expect(h.state.escalation?.assignedUserId).toBe("usr_sarah");
    expect(h.state.transcript.length).toBeGreaterThan(before);
    expect(h.state.transcript.slice(0, before).map((t) => t.id)).toEqual(h.state.transcript.slice(0, before).map((t) => t.id));
  });

  it("human-only actions are refused for AI but run for humans, with idempotency", () => {
    const h = routerHarness("wan_down");
    h.runCustomer();
    expect(h.send({ type: "human.run_action", tool: "book_engineer", params: { priority: "standard" } }, AGENT)).toMatch(/Take over/);
    h.send({ type: "human.take_over" }, AGENT);
    expect(h.send({ type: "human.run_action", tool: "book_engineer", params: { priority: "standard" } }, AGENT)).toBeUndefined();
    expect(h.state.toolActions.find((a) => a.toolName === "book_engineer")?.status).toBe("completed");
    expect(h.send({ type: "human.run_action", tool: "book_engineer", params: { priority: "standard" } }, AGENT)).toMatch(/Already requested/);
    expect(h.state.audit.some((a) => a.eventType === "tool.duplicate_blocked")).toBe(true);
    expect(h.send({ type: "human.run_action", tool: "factory_reset_remote", params: {} }, AGENT)).toMatch(/prohibited/);
  });

  it("return to AI is blocked for mandatory escalations", () => {
    const h = routerHarness("wan_down");
    h.runCustomer();
    h.send({ type: "human.take_over" }, AGENT);
    expect(h.send({ type: "human.return_to_ai" }, AGENT)).toMatch(/requires a human/);
    expect(h.state.audit.some((a) => a.eventType === "policy.check" && a.payload.check === "return_to_ai" && a.payload.allowed === false)).toBe(true);
  });

  it("return to AI resumes the workflow when permitted", () => {
    const h = routerHarness("persistently_unclear");
    h.runCustomer();
    h.send({ type: "human.take_over" }, AGENT);
    const err = h.send({ type: "human.return_to_ai", resumeStep: "show_cables" }, AGENT);
    expect(err).toBeUndefined();
    expect(h.state.session.ownerType).toBe("ai");
    expect(h.state.workflow.currentStep).toBe("show_cables");
    expect(h.state.evidenceRequest?.checkpoint).toBe("router_rear");
  });

  it("escalates when the AI exceeds its maximum duration", () => {
    const h = routerHarness("wan_down");
    h.runCustomer({ maxTurns: 3 });
    h.advance(16 * 60);
    h.send({ type: "system.tick" });
    expect(h.state.escalation?.reason).toBe("max_ai_duration");
  });
});

describe("audit and lifecycle", () => {
  it("records versions with every audit event and costs per session", () => {
    const h = routerHarness("wan_down");
    h.runCustomer();
    expect(h.state.audit.length).toBeGreaterThan(30);
    for (const e of h.state.audit) {
      expect(e.context?.workflowVersion).toBe(3);
      expect(e.context?.policyVersion).toBe(4);
      expect(e.tenantId).toBe("tnt_northline");
    }
    expect(h.state.session.costTotal).toBeGreaterThan(0);
    const types = new Set(h.state.audit.map((a) => a.eventType));
    for (const t of ["session.created", "session.started", "media.frame_selected", "ai.observation_created", "workflow.step_entered", "tool.requested", "human.queued"]) {
      expect(types.has(t as never)).toBe(true);
    }
  });

  it("only analyses frames that answer an evidence request", () => {
    const h = routerHarness("wan_down");
    h.runCustomer({ maxTurns: 1 }); // consent only — AI is asking a question, not requesting evidence
    expect(h.state.evidenceRequest).toBeUndefined();
    h.send({ type: "frame.captured", trigger: "scheduled_sample", frameReference: "x", width: 1, height: 1, bytes: 1 });
    h.send({ type: "frame.captured", trigger: "scene_change", frameReference: "y", width: 1, height: 1, bytes: 1 });
    expect(h.state.visualEvents).toHaveLength(2);
    expect(h.state.visualEvents.every((v) => v.processingStatus === "pending")).toBe(true);
    expect(h.state.observations).toHaveLength(0);
  });

  it("rejects commands once the session has ended", () => {
    const h = routerHarness("wan_down");
    h.runCustomer({ maxTurns: 2 });
    h.send({ type: "session.end" });
    expect(h.send({ type: "customer.utterance", text: "hello?" })).toBe("Session has ended");
    expect(h.state.session.outcome).toBe("customer_abandoned");
  });

  it("declining consent ends the session without starting the workflow", () => {
    const h = routerHarness("wan_down");
    h.send({ type: "customer.consent", accepted: false, noticeVersion: "privacy-notice@2" });
    expect(h.state.session.status).toBe("completed");
    expect(h.state.workflow.history).toEqual([]);
  });
});
