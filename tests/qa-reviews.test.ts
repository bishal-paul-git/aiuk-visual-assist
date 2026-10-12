import { describe, expect, it } from "vitest";
import { getWorkflow } from "@/lib/config/catalog";
import {
  claimBlocker,
  claimReview,
  QaReviewError,
  releaseReview,
  sessionHandlers,
  submitReview,
  UNDETERMINED,
  validateSubmission,
  type QaReview,
} from "@/lib/qa/reviews";
import { sampleReasons } from "@/lib/qa/sampling";
import { casesFromReview } from "@/lib/qa/evaluation";
import { reviewCalibration } from "@/lib/qa/calibration";
import { AGENT, routerHarness } from "./helpers";

const NADIA = { id: "usr_nadia", name: "Nadia Rahman" };
const TOM = { id: "usr_tom", name: "Tom Hughes" };
const SARAH = { id: AGENT.id, name: AGENT.name };
const NOW = "2026-10-12T09:00:00.000Z";
const vocab = getWorkflow("wf_router_v3")!.observationVocabulary;

/** A glare session the AI escalated, which Sarah then handled as the agent. */
function handledSession() {
  const h = routerHarness("persistently_unclear");
  h.runCustomer();
  expect(h.state.escalation?.reason).toMatch(/low_visual_confidence|repeated_capture_failure/);
  h.send({ type: "human.join" }, AGENT);
  h.send({ type: "human.take_over" }, AGENT);
  h.send({ type: "session.end", outcome: "resolved_by_human" }, AGENT);
  return h.state;
}

function allCorrect(st: ReturnType<typeof handledSession>) {
  return {
    verdicts: st.observations.map((o) => ({ observationId: o.id, verdict: "correct" })),
    outcome: { correct: true },
    scores: { accuracy: 4, policyAdherence: 5, customerExperience: 3 },
    notes: "Escalation was right; glare made the lights unreadable.",
  };
}

function claimed(st: ReturnType<typeof handledSession>) {
  const reviews: QaReview[] = [];
  claimReview(reviews, { state: st, reviewer: NADIA, reasons: sampleReasons(st, { aiResolvedRate: 0 }), now: NOW, id: "qar_1" });
  return reviews;
}

describe("QA review claim rules", () => {
  it("knows who handled the session", () => {
    const st = handledSession();
    expect(sessionHandlers(st).has(SARAH.id)).toBe(true);
    expect(sessionHandlers(st).has(NADIA.id)).toBe(false);
  });

  it("stops an agent reviewing a session they handled", () => {
    const st = handledSession();
    const reviews: QaReview[] = [];
    const reasons = sampleReasons(st, { aiResolvedRate: 0 });
    expect(reasons).toContain("uncertainty_escalation");
    expect(() => claimReview(reviews, { state: st, reviewer: SARAH, reasons, now: NOW, id: "qar_x" })).toThrow(/handled this session/);
    try {
      claimReview(reviews, { state: st, reviewer: SARAH, reasons, now: NOW, id: "qar_x" });
    } catch (e) {
      expect((e as QaReviewError).status).toBe(403);
    }
    expect(reviews).toHaveLength(0);
  });

  it("lets one reviewer claim; a second reviewer is refused; reclaiming is idempotent", () => {
    const st = handledSession();
    const reviews = claimed(st);
    expect(reviews[0]).toMatchObject({ status: "in_review", reviewerId: NADIA.id, sampleReasons: ["uncertainty_escalation"] });
    expect(claimBlocker(st, TOM, reviews, [])?.message).toMatch(/Already claimed by Nadia/);
    const again = claimReview(reviews, { state: st, reviewer: NADIA, reasons: [], now: NOW, id: "qar_2" });
    expect(again.created).toBe(false);
    expect(reviews).toHaveLength(1);
  });

  it("refuses running sessions and sessions outside the sample", () => {
    const running = routerHarness("wan_down");
    running.runCustomer({ maxTurns: 3 });
    expect(() => claimReview([], { state: running.state, reviewer: NADIA, reasons: ["random_ai_resolved"], now: NOW, id: "q" })).toThrow(/Only completed sessions/);

    const resolved = routerHarness("power_cycle_fix");
    resolved.runCustomer();
    resolved.send({ type: "session.end" });
    expect(resolved.state.session.outcome).toBe("resolved_by_ai");
    expect(() => claimReview([], { state: resolved.state, reviewer: NADIA, reasons: [], now: NOW, id: "q" })).toThrow(/not in the review sample/);
  });

  it("only the claimant can release, and release returns the session to the queue", () => {
    const st = handledSession();
    const reviews = claimed(st);
    expect(() => releaseReview(reviews, st.session.id, TOM)).toThrow(/claimed by Nadia/);
    releaseReview(reviews, st.session.id, NADIA);
    expect(reviews).toHaveLength(0);
  });
});

describe("QA review submission", () => {
  it("rejects an incomplete or invalid submission with plain-English reasons", () => {
    const st = handledSession();
    const [first, ...rest] = st.observations;
    const valued = st.observations.find((o) => o.value && o.observationType === "power_light")!;
    const result = validateSubmission(
      {
        verdicts: [
          { observationId: valued.id, verdict: "incorrect", correctedValue: "purple" },
          { observationId: "obs_nope", verdict: "correct" },
        ],
        outcome: { correct: false },
        scores: { accuracy: 0, policyAdherence: 3.5, customerExperience: 6 },
        notes: 42,
      },
      st,
      vocab,
    );
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.join("\n")).toMatch(/"purple" is not an allowed value for power_light/);
    expect(errors.join("\n")).toMatch(/Unknown observation/);
    expect(errors.join("\n")).toMatch(/still need a verdict/);
    expect(errors.join("\n")).toMatch(/what should have happened instead/);
    expect(errors.filter((e) => /whole number from 1 to 5/.test(e))).toHaveLength(3);
    expect(errors.join("\n")).toMatch(/Notes must be text/);
    expect(first && rest).toBeTruthy();
  });

  it("requires a corrected value from the vocabulary when a reading is marked incorrect", () => {
    const st = handledSession();
    const valued = st.observations.find((o) => o.value && o.observationType === "power_light")!;
    const body = allCorrect(st);
    body.verdicts = body.verdicts.map((v) => (v.observationId === valued.id ? { ...v, verdict: "incorrect" } : v));
    const missing = validateSubmission(body, st, vocab);
    expect(missing.ok).toBe(false);
    expect(missing.ok ? "" : missing.errors.join()).toMatch(/Give the correct value/);

    const same = validateSubmission({ ...body, verdicts: body.verdicts.map((v) => (v.observationId === valued.id ? { ...v, correctedValue: valued.value } : v)) }, st, vocab);
    expect(same.ok ? "" : same.errors.join()).toMatch(/same as the AI's value/);

    const ok = validateSubmission({ ...body, verdicts: body.verdicts.map((v) => (v.observationId === valued.id ? { ...v, correctedValue: UNDETERMINED } : v)) }, st, vocab);
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.value.verdicts.find((v) => v.observationId === valued.id)?.correctedValue).toBeNull();
  });

  it("an 'other' expected outcome needs a note", () => {
    const st = handledSession();
    const r = validateSubmission({ ...allCorrect(st), outcome: { correct: false, expected: "other" }, notes: "  " }, st, vocab);
    expect(r.ok ? "" : r.errors.join()).toMatch(/Add a note/);
  });

  it("completes the review, snapshots the AI readings, and blocks a second review", () => {
    const st = handledSession();
    const reviews = claimed(st);
    expect(() => submitReview(reviews, { state: st, reviewer: TOM, body: allCorrect(st), vocabulary: vocab, now: NOW })).toThrow(/claimed by Nadia/);
    expect(() => submitReview(reviews, { state: st, reviewer: NADIA, body: { verdicts: [] }, vocabulary: vocab, now: NOW })).toThrow(QaReviewError);

    const valued = st.observations.find((o) => o.value && o.observationType === "power_light")!;
    const body = allCorrect(st);
    body.verdicts = body.verdicts.map((v) => (v.observationId === valued.id ? { observationId: v.observationId, verdict: "incorrect", correctedValue: "off" } : v));
    const review = submitReview(reviews, { state: st, reviewer: NADIA, body, vocabulary: vocab, now: NOW });
    expect(review.status).toBe("completed");
    expect(review.submittedAt).toBe(NOW);
    expect(review.scores).toEqual({ accuracy: 4, policyAdherence: 5, customerExperience: 3 });
    expect(review.verdicts).toHaveLength(st.observations.length);
    expect(review.verdicts.find((v) => v.observationId === valued.id)).toMatchObject({ aiValue: valued.value, aiConfidence: valued.confidence, verdict: "incorrect", correctedValue: "off" });
    expect(claimBlocker(st, TOM, reviews, ["uncertainty_escalation"])?.message).toMatch(/Already reviewed/);
    expect(() => submitReview(reviews, { state: st, reviewer: NADIA, body, vocabulary: vocab, now: NOW })).toThrow(/already been submitted/);

    // Verdicts feed calibration (committed readings only) and labelled evaluation cases.
    const cal = reviewCalibration([st], reviews);
    expect(cal.fromQaReviews).toBe(st.observations.filter((o) => o.value).length);
    expect(cal.accuracy).toBeLessThan(1);
    const cases = casesFromReview(review, st, NADIA.name, NOW);
    expect(cases.length).toBeGreaterThan(0);
    const corrected = cases.find((c) => c.expected.power_light === "off")!;
    expect(corrected.image).toMatchObject({ kind: "synthetic" });
    expect(corrected.checkpoint).toBe("router_lights");
    // Readings the AI declined, marked correct, become "cannot tell" in the case.
    expect(cases.some((c) => Object.values(c.expected).includes(null))).toBe(true);
  });
});
