import { describe, expect, it } from "vitest";
import { SessionRuntime } from "@/lib/server/runtime";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { users } from "@/lib/config/catalog";
import { direct, reachedStages } from "@/lib/demo/walkthrough";
import type { Actor, Command } from "@/lib/session/orchestrator";

const flush = () => new Promise((r) => setTimeout(r, 2));
const agent = users.find((u) => u.tenantId === "tnt_northline" && u.role === "agent")!;

/** Plays a scenario with the walkthrough director, the way the demo stage does. */
async function play(scenario: string) {
  const rt = new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
  const { id } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Walkthrough", scenario });
  const customer: Actor = { type: "customer", id: "c", name: "Walkthrough" };
  const human: Actor = { type: "human_agent", id: agent.id, name: agent.name };

  // What the customer app does on its own: consent, camera on.
  rt.dispatch(id, { type: "media.update", media: { camera: true, microphone: true } }, customer);
  rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);

  const sent = new Set<string>();
  const captured = new Set<string>();
  for (let i = 0; i < 200; i++) {
    await flush();
    const s = rt.agentView(id)!.state;
    // The demo camera answers each evidence request once.
    if (s.evidenceRequest && !captured.has(s.evidenceRequest.id)) {
      captured.add(s.evidenceRequest.id);
      const frameId = rt.storeFrame(id, "image/jpeg", new Uint8Array([1]));
      rt.dispatch(
        id,
        { type: "frame.captured", trigger: "workflow_checkpoint", frameReference: `mem:${frameId}`, width: 640, height: 480, bytes: 1, evidenceRequestId: s.evidenceRequest.id },
        customer,
      );
      continue;
    }
    const d = direct(s, agent.id);
    if (d.done) return { state: s, steps: [...sent] };
    if (!d.next || sent.has(d.next.key)) continue;
    sent.add(d.next.key);
    const r = rt.dispatch(id, d.next.command as unknown as Command, d.next.actor === "agent" ? human : customer);
    expect(r.error, `${scenario}: ${d.next.key}`).toBeUndefined();
  }
  throw new Error(`${scenario}: walkthrough did not finish (step ${rt.agentView(id)!.state.workflow.currentStep})`);
}

describe("demo walkthrough director", () => {
  it.each(SCENARIOS.map((s) => s.key))("plays %s to a closed session", async (key) => {
    const { state } = await play(key);
    expect(state.session.status).toBe("completed");
    expect(["resolved_by_ai", "resolved_by_human"]).toContain(state.session.outcome);
  });

  it("resolves the power-cycle scenario by AI without a human", async () => {
    const { state, steps } = await play("power_cycle_fix");
    expect(state.session.outcome).toBe("resolved_by_ai");
    expect(steps).not.toContain("join");
    const reached = reachedStages(state);
    for (const st of ["consent", "problem", "show_router", "lights", "cables", "guidance", "confirm", "ended"] as const) expect(reached.has(st)).toBe(true);
  });

  it("hands the line-fault scenario to a human who books an engineer", async () => {
    const { state, steps } = await play("wan_down");
    expect(state.session.outcome).toBe("resolved_by_human");
    expect(steps).toEqual(expect.arrayContaining(["problem", "join", "take_over", "action:book_engineer", "end"]));
    expect(state.toolActions.find((t) => t.toolName === "book_engineer")?.requestedBy).toBe("human");
    expect(state.escalation?.reason).toBeDefined();
  });
});
