import { describe, expect, it } from "vitest";
import { SessionRuntime } from "@/lib/server/runtime";
import { seedSessions } from "@/lib/server/seed";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";

function runtime() {
  return new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
}

const flush = () => new Promise((r) => setTimeout(r, 5));

describe("session runtime", () => {
  it("seeds history and in-flight sessions through the orchestrator", () => {
    const rt = runtime();
    seedSessions(rt, Date.parse("2026-10-11T12:00:00Z"));
    const all = rt.summaries();
    expect(all.length).toBeGreaterThan(50);
    expect(all.filter((s) => s.live)).toHaveLength(4);
    expect(all.some((s) => s.outcome === "resolved_by_ai")).toBe(true);
    expect(all.some((s) => s.outcome === "resolved_by_human")).toBe(true);
    const waiting = rt.agentView("ses_a12467")!;
    expect(waiting.state.session.status).toBe("escalated");
    expect(waiting.handover.actionsTaken[0].tool).toBe("line_test");
  });

  it("runs a live session end to end with async providers", async () => {
    const rt = runtime();
    const { id, token } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Test", scenario: "power_cycle_fix" });
    expect(rt.idForToken(token)).toBe(id);
    const customer = { type: "customer" as const, id: "c", name: "Test" };
    rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
    rt.dispatch(id, { type: "customer.utterance", text: "my broadband is down" }, customer);
    await flush();
    expect(rt.customerView(id)!.customerState).toBe("show_object");

    const frameId = rt.storeFrame(id, "image/jpeg", new Uint8Array([1, 2, 3]));
    rt.dispatch(id, { type: "frame.captured", trigger: "workflow_checkpoint", frameReference: `mem:${frameId}`, width: 640, height: 480, bytes: 3 }, customer);
    expect(rt.customerView(id)!.customerState).toBe("analysing");
    await flush();
    expect(rt.agentView(id)!.state.workflow.currentStep).toBe("inspect_lights");
    expect(rt.getFrame(id, `mem:${frameId}`)?.data.length).toBe(3);
    expect(rt.getFrame("other_session", `mem:${frameId}`)).toBeUndefined();
  });

  it("refuses to start sessions on unpublished workflows", () => {
    expect(() => runtime().create({ workflowId: "wf_boiler_v1", channel: "sms", customerLabel: "x" })).toThrow(/not published/);
  });

  it("customer projection hides internal data", () => {
    const rt = runtime();
    seedSessions(rt, Date.parse("2026-10-11T12:00:00Z"));
    const view = rt.customerView("ses_a12467")! as unknown as Record<string, unknown>;
    for (const key of ["audit", "observations", "notes", "costs", "toolActions", "escalation"]) expect(view[key]).toBeUndefined();
  });
});
