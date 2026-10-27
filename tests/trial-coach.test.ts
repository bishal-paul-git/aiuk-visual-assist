import { describe, expect, it } from "vitest";
import type { SessionState } from "@/lib/domain/session";
import { coachFor } from "@/lib/session/trial-coach";
import { getRuntime } from "@/lib/server/runtime";

function fresh(): SessionState {
  const { id } = getRuntime().create({ workflowKey: "router-troubleshooting", tenantId: "tnt_northline", channel: "secure_link", customerLabel: "Coach test", scenario: "power_cycle_fix" });
  return structuredClone(getRuntime().get(id)!.state);
}

const agent = { id: "p1", sessionId: "s", type: "human_agent" as const, userId: "usr_tom", displayName: "Tom", joinedAt: "2026-10-26T10:00:00.000Z" };

describe("trial coach", () => {
  it("says there is nothing to do yet while the session loads", () => {
    expect(coachFor(undefined)).toMatchObject({ key: "loading", actor: "nobody" });
  });

  it("sends the tester to the customer screen first, then follows the conversation", () => {
    const s = fresh();
    s.customerState = "consent";
    expect(coachFor(s)).toMatchObject({ key: "waiting_customer", actor: "customer", tone: "wait" });

    s.session.status = "active";
    s.customerState = "conversation";
    expect(coachFor(s).detail).toMatch(/My internet isn't working/);
    s.transcript.push({ id: "t1", sessionId: "s", speaker: "customer", speakerName: "Customer", text: "Hello", timestamp: "2026-10-26T10:00:00.000Z", confidence: 1 } as SessionState["transcript"][number]);
    expect(coachFor(s)).toMatchObject({ key: "talk" });
    expect(coachFor(s).detail).not.toMatch(/My internet isn't working/);

    s.customerState = "show_object";
    expect(coachFor(s)).toMatchObject({ key: "show", actor: "customer" });
    s.customerState = "need_closer_view";
    expect(coachFor(s)).toMatchObject({ key: "better_view", actor: "customer" });
    s.customerState = "analysing";
    expect(coachFor(s)).toMatchObject({ key: "analysing", actor: "nobody", tone: "wait" });
  });

  it("shows the AI's actual instruction and trims a long one", () => {
    const s = fresh();
    s.customerState = "guidance";
    s.instruction = { text: "Please unplug the power cable from the back of the router and wait ten seconds.", from: "ai", at: "2026-10-26T10:00:00.000Z" };
    expect(coachFor(s)).toMatchObject({ key: "instruction", actor: "customer" });
    expect(coachFor(s).detail).toContain("unplug the power cable");
    s.instruction.text = "x".repeat(400);
    expect(coachFor(s).detail.length).toBeLessThan(330);
  });

  it("moves to the agent screen when the customer asks for a person, and tracks join then take over", () => {
    const s = fresh();
    s.session.status = "escalated";
    s.customerState = "escalating";
    expect(coachFor(s)).toMatchObject({ key: "needs_agent", actor: "agent" });
    expect(coachFor(s).detail).toMatch(/Join session.*take over at once/);

    s.participants.push(agent);
    expect(coachFor(s)).toMatchObject({ key: "agent_joined", actor: "agent" });
    expect(coachFor(s).detail).toMatch(/Take over/);

    s.session.ownerType = "human";
    s.session.status = "human_active";
    expect(coachFor(s)).toMatchObject({ key: "agent_in_control", actor: "agent" });
    expect(coachFor(s).detail).toMatch(/Resolved/);

    // Handing back to the AI returns the turn to the customer.
    s.session.ownerType = "ai";
    s.session.status = "active";
    s.customerState = "conversation";
    expect(coachFor(s)).toMatchObject({ actor: "customer" });
  });

  it("finishes with the outcome", () => {
    const s = fresh();
    s.session.status = "completed";
    s.session.outcome = "resolved_by_human";
    expect(coachFor(s)).toMatchObject({ key: "finished", tone: "done" });
    expect(coachFor(s).detail).toMatch(/Resolved by human/);
  });
});
