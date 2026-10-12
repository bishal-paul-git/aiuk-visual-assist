import { describe, expect, it } from "vitest";
import { SessionRuntime } from "@/lib/server/runtime";
import { seedSessions } from "@/lib/runtime/seed";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { hashUnit, isCompleted, normaliseRate, sampleReasons, sampleSessions } from "@/lib/qa/sampling";
import { buildQueue } from "@/lib/qa/queue";
import type { SessionState } from "@/lib/domain/session";

function seededStates(): SessionState[] {
  const rt = new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
  seedSessions(rt, Date.parse("2026-10-11T12:00:00Z"));
  return rt.states();
}

const ids = (xs: { state: SessionState }[]) => xs.map((x) => x.state.session.id);

describe("QA review sampling", () => {
  const states = seededStates();
  const completed = states.filter(isCompleted);

  it("hashes to a stable value in [0, 1)", () => {
    expect(hashUnit("ses_abc")).toBe(hashUnit("ses_abc"));
    expect(hashUnit("ses_abc")).not.toBe(hashUnit("ses_abd"));
    for (const s of states) {
      const h = hashUnit(s.session.id);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it("is deterministic: the same sessions are sampled on every run and in any order", () => {
    const a = sampleSessions(states, { aiResolvedRate: 0.25 });
    const b = sampleSessions([...seededStates()].reverse(), { aiResolvedRate: 0.25 });
    expect(ids(a)).toEqual(ids(b));
    expect(a.map((x) => x.reasons)).toEqual(b.map((x) => x.reasons));
  });

  it("always samples uncertainty escalations, model failures and human-rejected sessions", () => {
    const sampled = new Set(ids(sampleSessions(states, { aiResolvedRate: 0 })));
    const mandatory = completed.filter((s) => {
      const r = s.escalation?.reason ?? s.session.escalationReason;
      return r === "low_visual_confidence" || r === "repeated_capture_failure" || r === "ai_model_failure" || s.observations.some((o) => o.humanReview?.verdict === "rejected");
    });
    expect(mandatory.length).toBeGreaterThan(0);
    for (const s of mandatory) expect(sampled.has(s.session.id), s.session.reference).toBe(true);
    // At 0% nothing else is sampled.
    expect(sampled.size).toBe(mandatory.length);
  });

  it("samples roughly the configured share of AI-resolved sessions, and a higher rate is a superset", () => {
    const aiResolved = completed.filter((s) => s.session.outcome === "resolved_by_ai");
    expect(aiResolved.length).toBeGreaterThan(10);
    const at = (rate: number) => new Set(aiResolved.filter((s) => sampleReasons(s, { aiResolvedRate: rate }).includes("random_ai_resolved")).map((s) => s.session.id));
    const low = at(0.2);
    const high = at(0.5);
    expect(at(0).size).toBe(0);
    expect(at(1).size).toBe(aiResolved.length);
    for (const id of low) expect(high.has(id)).toBe(true);
    expect(low.size / aiResolved.length).toBeGreaterThan(0.05);
    expect(low.size / aiResolved.length).toBeLessThan(0.45);
  });

  it("never samples sessions that are still running", () => {
    const running = states.filter((s) => !isCompleted(s));
    expect(running.length).toBeGreaterThan(0);
    for (const s of running) expect(sampleReasons(s, { aiResolvedRate: 1 })).toEqual([]);
  });

  it("a different salt changes which AI-resolved sessions are picked", () => {
    const a = ids(sampleSessions(states, { aiResolvedRate: 0.3, salt: "one" }));
    const b = ids(sampleSessions(states, { aiResolvedRate: 0.3, salt: "two" }));
    expect(a).not.toEqual(b);
  });

  it("keeps sessions with a review record in the queue after the rate drops", () => {
    const pick = sampleSessions(states, { aiResolvedRate: 1 }).find((x) => x.reasons.includes("random_ai_resolved") && x.reasons.length === 1)!;
    const review = {
      id: "qar_1",
      sessionId: pick.state.session.id,
      tenantId: pick.state.session.tenantId,
      reference: pick.state.session.reference,
      status: "in_review" as const,
      sampleReasons: pick.reasons,
      reviewerId: "usr_nadia",
      reviewerName: "Nadia Rahman",
      claimedAt: "2026-10-11T12:00:00Z",
      updatedAt: "2026-10-11T12:00:00Z",
      verdicts: [],
    };
    const queue = buildQueue(states, [review], { aiResolvedRate: 0 });
    const item = queue.find((q) => q.state.session.id === pick.state.session.id);
    expect(item?.status).toBe("in_review");
    expect(item?.reasons).toEqual(["random_ai_resolved"]);
  });

  it("reads configured rates as fractions or percentages", () => {
    expect(normaliseRate("0.1")).toBe(0.1);
    expect(normaliseRate("35")).toBe(0.35);
    expect(normaliseRate(undefined)).toBe(0.2);
    expect(normaliseRate("nonsense")).toBe(0.2);
    expect(normaliseRate(500)).toBe(1);
  });
});
