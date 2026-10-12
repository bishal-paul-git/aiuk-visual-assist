import { describe, expect, it } from "vitest";
import { getWorkflow } from "@/lib/config/catalog";
import { calibrationBins, expectedCalibrationError, QA_BAND_EDGES } from "@/lib/qa/calibration";
import { computeMetrics, runEvaluation, scoreItem, type CaseResult, type EvaluationSet } from "@/lib/qa/evaluation";
import { ROUTER_EVAL_SET } from "@/lib/qa/router-eval-set";
import { SceneVisionProvider } from "@/lib/qa/scene-vision";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import type { EvidenceInput, EvidenceInterpretation, ReasoningProvider } from "@/lib/providers/types";

const workflow = getWorkflow("wf_router_v3")!;
const who = { id: "usr_nadia", name: "Nadia Rahman" };
const fixedClock = () => new Date("2026-10-12T09:00:00Z");

describe("expected calibration error", () => {
  it("is the weighted gap between accuracy and confidence, and 0 when they match", () => {
    const points = [
      ...Array.from({ length: 10 }, () => ({ confidence: 0.95, correct: true })),
      ...Array.from({ length: 4 }, (_, i) => ({ confidence: 0.55, correct: i < 2 })),
    ];
    // 0.95 bin: 10/10 correct vs 0.95 → gap 0.05; 0.55 bin: 2/4 = 0.5 vs 0.55 → gap 0.05.
    expect(expectedCalibrationError(points)).toBeCloseTo(0.05, 10);
    expect(expectedCalibrationError([{ confidence: 0.8, correct: true }, { confidence: 0.8, correct: true }, { confidence: 0.8, correct: false }, { confidence: 0.8, correct: true }, { confidence: 0.8, correct: true }])).toBeCloseTo(0, 10);
  });

  it("weights each bin by its share of points", () => {
    // 3 points at 0.9, all wrong (gap 0.9); 1 point at 0.1, right (gap 0.9) → ECE 0.9.
    const points = [
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
      { confidence: 0.1, correct: true },
    ];
    expect(expectedCalibrationError(points)).toBeCloseTo(0.9, 10);
    expect(expectedCalibrationError([])).toBeUndefined();
  });

  it("puts confidence 1.0 in the top bin and labels the QA bands", () => {
    const bins = calibrationBins([{ confidence: 1, correct: true }, { confidence: 0.5, correct: false }], QA_BAND_EDGES);
    expect(bins.map((b) => b.label)).toEqual(["< 50%", "50–74%", "75–84%", "≥ 85%"]);
    expect(bins[3].count).toBe(1);
    expect(bins[1].count).toBe(1);
  });
});

describe("item scoring", () => {
  it("distinguishes correct, incorrect, abstained, missing, hallucinated and correct abstentions", () => {
    const seen = (value: string, confidence = 0.9) => ({ observationType: "x", value, observationText: "", confidence, status: "confirmed_visible" as const, requiresConfirmation: false });
    const declined = { observationType: "x", observationText: "", confidence: 0.3, status: "unreadable" as const, requiresConfirmation: true };
    expect(scoreItem("x", "on", seen("on")).outcome).toBe("correct");
    expect(scoreItem("x", "on", seen("off")).outcome).toBe("incorrect");
    expect(scoreItem("x", "on", declined).outcome).toBe("abstained");
    expect(scoreItem("x", "on", undefined).outcome).toBe("missing");
    expect(scoreItem("x", null, seen("on")).outcome).toBe("hallucinated");
    expect(scoreItem("x", null, declined).outcome).toBe("correct_abstention");
    // A value with a doubtful status is not a committed reading.
    expect(scoreItem("x", "on", { ...seen("on"), status: "uncertain" }).outcome).toBe("abstained");
  });
});

describe("evaluation runner on the simulated provider", () => {
  it("covers the required scene conditions", () => {
    const tags = new Set(ROUTER_EVAL_SET.cases.flatMap((c) => c.tags));
    for (const t of ["lights_on", "lights_off", "light_red", "light_amber", "glare", "wrong_device", "cable_disconnected"]) expect(tags.has(t), t).toBe(true);
    for (const c of ROUTER_EVAL_SET.cases) expect(workflow.steps.some((s) => s.evidence?.checkpoint === c.checkpoint), c.id).toBe(true);
    // Every expected value is in the workflow vocabulary.
    for (const c of ROUTER_EVAL_SET.cases)
      for (const [type, value] of Object.entries(c.expected)) if (value !== null) expect(workflow.observationVocabulary?.[type]?.values, `${c.id}/${type}`).toContain(value);
  });

  it("is deterministic and reports accuracy, confusion, hallucinations and ECE", async () => {
    const opts = { provider: new SceneVisionProvider(), providerLabel: "Simulated", workflow, startedBy: who, now: fixedClock };
    const run = await runEvaluation(ROUTER_EVAL_SET, { ...opts, id: "evr_a" });
    const again = await runEvaluation(ROUTER_EVAL_SET, { ...opts, id: "evr_a" });
    expect(again).toEqual(run);

    const m = run.metrics;
    expect(m.cases).toBe(ROUTER_EVAL_SET.cases.length);
    expect(m.casesFailed).toBe(0);
    expect(m.items).toBe(ROUTER_EVAL_SET.cases.reduce((n, c) => n + Object.keys(c.expected).length, 0));

    // The simulated reader confuses amber with red on the internet light.
    const internet = m.byType.find((t) => t.observationType === "internet_light")!;
    expect(m.confusion.internet_light.amber.red).toBe(2);
    expect(internet.incorrect).toBe(2);
    expect(internet.accuracy).toBeLessThan(1);
    // Device identification is perfect, including the TV box.
    expect(m.byType.find((t) => t.observationType === "device_identified")!.accuracy).toBe(1);
    expect(m.confusion.device_identified.other_device.other_device).toBe(1);
    // It declines on glare and on the wrong device/view, so it never hallucinates.
    expect(m.hallucinations).toBe(0);
    expect(m.hallucinationRate).toBe(0);
    expect(m.confusion.wifi_light["(cannot tell)"]["(declined)"]).toBeGreaterThan(0);

    // Calibration: ECE recomputed from the per-item results matches the run.
    const points = run.results.flatMap((r) => r.items.filter((i) => i.predicted !== undefined).map((i) => ({ confidence: i.confidence!, correct: i.outcome === "correct" })));
    expect(m.calibration.points).toBe(points.length);
    expect(m.calibration.ece).toBeCloseTo(expectedCalibrationError(points)!, 10);
    expect(m.calibration.ece!).toBeGreaterThan(0);
    expect(m.calibration.ece!).toBeLessThan(0.3);
    expect(m.answeredAccuracy!).toBeCloseTo((points.filter((p) => p.correct).length / points.length), 10);
    expect(m.accuracy).toBeGreaterThan(0.8);
  });

  it("reports provider failures per case and leaves them out of the scores", async () => {
    const failing: ReasoningProvider = {
      id: "always-fails",
      simulated: true,
      interpretUtterance: () => Promise.resolve({ intent: "unknown" }),
      interpretEvidence: () => Promise.reject(new Error("Vision provider timeout")),
    };
    const run = await runEvaluation(ROUTER_EVAL_SET, { provider: failing, providerLabel: "Failing", workflow, startedBy: who, now: fixedClock });
    expect(run.metrics.casesFailed).toBe(ROUTER_EVAL_SET.cases.length);
    expect(run.metrics.items).toBe(0);
    expect(run.results[0].error).toMatch(/timeout/);
    expect(run.metrics.calibration.ece).toBeUndefined();
  });

  it("evaluates any ReasoningProvider, including the scripted session simulator", async () => {
    const run = await runEvaluation(ROUTER_EVAL_SET, { provider: new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), providerLabel: "Scripted", workflow, startedBy: who, now: fixedClock });
    expect(run.metrics.casesFailed).toBe(0);
    // It ignores the image, so it gets the amber, off and wrong-device cases wrong.
    expect(run.metrics.accuracy).toBeLessThan(0.9);
    expect(run.metrics.hallucinations).toBeGreaterThan(0);
  });

  it("sends the frame the case names, and loads captured frames through the loader", async () => {
    const seen: EvidenceInput[] = [];
    const spy: ReasoningProvider = {
      id: "spy",
      simulated: true,
      interpretUtterance: () => Promise.resolve({ intent: "unknown" }),
      interpretEvidence: (input): Promise<EvidenceInterpretation> => {
        seen.push(input);
        return Promise.resolve({ observations: [], modelVersion: "spy", latencyMs: 0 });
      },
    };
    const set: EvaluationSet = {
      ...ROUTER_EVAL_SET,
      cases: [
        ROUTER_EVAL_SET.cases[0],
        { id: "captured", title: "Captured", tags: [], image: { kind: "frame", sessionId: "ses_1", frameReference: "mem:abc" }, checkpoint: "router_rear", expected: { broadband_cable: "connected" } },
        { id: "purged", title: "Purged", tags: [], image: { kind: "frame", sessionId: "ses_1", frameReference: "mem:gone" }, checkpoint: "router_rear", expected: { broadband_cable: "connected" } },
      ],
    };
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
    const run = await runEvaluation(set, {
      provider: spy,
      providerLabel: "Spy",
      workflow,
      startedBy: who,
      now: fixedClock,
      loadFrame: (sid, ref) => (sid === "ses_1" && ref === "mem:abc" ? { mime: "image/jpeg", data: jpeg } : undefined),
      prepareFrame: async (f) => (f.mime === "image/svg+xml" ? { mime: "image/png", data: new Uint8Array([1]) } : f),
    });
    expect(seen).toHaveLength(2);
    expect(seen[0].frame?.mime).toBe("image/png");
    expect(seen[0].step?.evidence?.checkpoint).toBe("router_front");
    expect(seen[1].frame?.data).toEqual(jpeg);
    expect(seen[1].visualEvent.frameReference).toBe("mem:abc");
    expect(run.results[2].error).toMatch(/no longer available/);
    expect(run.results[1].items[0].outcome).toBe("missing");
  });

  it("runs frames an agent asked for (no workflow step) against the whole vocabulary", async () => {
    const set: EvaluationSet = {
      ...ROUTER_EVAL_SET,
      cases: [{ id: "agent-capture", title: "Agent capture", tags: [], image: { kind: "synthetic", ref: "synthetic:close_up:on-off-on:connected" }, checkpoint: "human_request", expected: { internet_light: "off" } }],
    };
    const run = await runEvaluation(set, { provider: new SceneVisionProvider(), providerLabel: "Simulated", workflow, startedBy: who, now: fixedClock });
    expect(run.results[0].error).toBeUndefined();
    expect(run.results[0].items[0].outcome).toBe("correct");
  });

  it("computes metrics per tag", () => {
    const results: CaseResult[] = [
      { caseId: "a", title: "a", tags: ["glare"], latencyMs: 0, items: [scoreItem("wifi_light", null, undefined), scoreItem("power_light", "on", undefined)] },
    ];
    const m = computeMetrics(results);
    expect(m.byTag).toEqual([{ tag: "glare", items: 2, accuracy: 0.5 }]);
    expect(m.confusion.wifi_light["(cannot tell)"]["(not reported)"]).toBe(1);
    expect(m.coverage).toBe(0);
  });
});
