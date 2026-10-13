import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getWorkflow } from "@/lib/config/catalog";
import { measuredModelCost } from "@/lib/domain/pricing";
import type { ModelUsage } from "@/lib/domain/types";
import type { EvidenceInput, EvidenceInterpretation, ReasoningProvider } from "@/lib/providers/types";
import type { ObservationInput } from "@/lib/session/orchestrator";
import { csvCell, detectDelimiter, parseCsv, toCsv } from "@/lib/qa/csv";
import { computePhotoMetrics, decideAction, latencyMetrics, runPhotoEvaluation, type PhotoCaseResult } from "@/lib/qa/photo-eval";
import { labelColumns, parseLabels, photoCheckpoints, type PhotoLabel } from "@/lib/qa/photo-labels";
import { CSV_COLUMNS, renderCsv, renderMarkdown, summaryLines, wilsonInterval } from "@/lib/qa/photo-report";

const workflow = getWorkflow("wf_router_v3")!;
const HEADER = labelColumns(workflow).join(",");

describe("CSV parsing", () => {
  it("handles quotes, doubled quotes, delimiters and line breaks inside quotes, CRLF and a BOM", () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","line 1\nline 2"\r\n1,,3\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line 1\nline 2"],
      ["1", "", "3"],
    ]);
  });

  it("detects semicolon- and tab-separated files saved by spreadsheets", () => {
    expect(detectDelimiter("file;checkpoint;power_light\na;b;c")).toBe(";");
    expect(detectDelimiter("file\tcheckpoint\na\tb")).toBe("\t");
    expect(detectDelimiter("file,checkpoint\n")).toBe(",");
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a last line without a newline and rejects an unclosed quote", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(() => parseCsv('a,b\n"open,2')).toThrow(/never closed/);
  });

  it("writes cells that round-trip and cannot run as spreadsheet formulas", () => {
    const rows = [["plain", 'with "quotes"', "a,b", "two\nlines", 3, -0.5, true, undefined, "=HYPERLINK(1)", "+1 cmd", "@x"]];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed[0].slice(0, 8)).toEqual(["plain", 'with "quotes"', "a,b", "two\nlines", "3", "-0.5", "true", ""]);
    expect(parsed[0].slice(8)).toEqual(["'=HYPERLINK(1)", "'+1 cmd", "'@x"]);
    expect(csvCell(Number.NaN)).toBe("");
  });
});

describe("label validation", () => {
  const files = ["IMG_1.jpg", "IMG_2.JPG", "rear.png", "front.jpeg", "extra.jpg"];

  it("uses the workflow vocabulary for columns, and the template header matches", () => {
    expect(labelColumns(workflow)).toEqual([
      "file",
      "checkpoint",
      "device_identified",
      "power_light",
      "internet_light",
      "wifi_light",
      "broadband_cable",
      "power_cable",
      "expected_action",
      "scenario",
      "sensitive_content",
      "notes",
    ]);
    const template = readFileSync(path.resolve("eval/router-photos/labels.csv"), "utf8");
    expect(template.split(/\r?\n/)[0]).toBe(HEADER);
    const { labels, issues } = parseLabels(template, workflow);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(labels.map((l) => l.expectedAction)).toEqual(["proceed", "request_another_angle"]);
    expect(photoCheckpoints(workflow).map((c) => c.checkpoint)).toEqual(["router_front", "router_lights", "router_rear", "router_lights_recheck"]);
  });

  it("parses valid rows, normalising case and spacing, with cannot_tell as null", () => {
    const csv = [
      HEADER,
      "IMG_1.jpg,router_lights,,On,Cannot Tell,off,,,Request Closer View,glare; too far,none,reflection",
      "img_2.jpg,Router_Lights,,on,amber,on,,,proceed,,,",
      "rear.png,router_rear,,,,,disconnected,connected,proceed,loose_cable,,",
      "front.jpeg,router_front,other_device,,,,,,request_another_angle,wrong_device,payment_card,",
      ",,,,,,,,,,,",
    ].join("\n");
    const { labels, issues } = parseLabels(csv, workflow, files);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(labels).toHaveLength(4);
    expect(labels[0]).toMatchObject({
      line: 2,
      file: "IMG_1.jpg",
      checkpoint: "router_lights",
      stepKey: "inspect_lights",
      expected: { power_light: "on", internet_light: null, wifi_light: "off" },
      expectedAction: "request_closer_view",
      scenarios: ["glare", "too_far"],
      sensitiveContent: "none",
      notes: "reflection",
      found: true,
    });
    // Different capitals: the real file name is used, with a warning.
    expect(labels[1].file).toBe("IMG_2.JPG");
    expect(issues.some((i) => i.line === 3 && /capital/.test(i.message))).toBe(true);
    expect(labels[2].expected).toEqual({ broadband_cable: "disconnected", power_cable: "connected" });
    expect(labels[3]).toMatchObject({ expected: { device_identified: "other_device" }, sensitiveContent: "payment_card" });
    // A photo in the folder with no row is reported, not silently dropped.
    expect(issues.some((i) => i.severity === "warning" && i.file === "extra.jpg")).toBe(true);
  });

  it("reports each kind of mistake with its line number and leaves bad rows out", () => {
    const csv = [
      HEADER,
      "IMG_1.jpg,router_lights,,on,purple,on,,,proceed,,,", // value outside the vocabulary
      "IMG_2.JPG,router_lightz,,on,on,on,,,proceed,,,", // unknown checkpoint
      "rear.png,router_rear,,,,,connected,,proceed,,,", // power_cable empty
      "front.jpeg,router_front,router,,,,,,maybe,,,", // bad action
      "photo.heic,router_front,router,,,,,,proceed,,,", // not JPEG/PNG
      "../secret.jpg,router_front,router,,,,,,proceed,,,", // path outside the folder
      "extra.jpg,router_front,router,,,,,,proceed,,card,", // bad sensitive value
    ].join("\n");
    const { labels, issues } = parseLabels(csv, workflow, files);
    expect(labels).toEqual([]);
    const errorFor = (line: number) => issues.filter((i) => i.severity === "error" && i.line === line).map((i) => i.message).join(" | ");
    expect(errorFor(2)).toMatch(/internet_light "purple" is not allowed.*on, off, red, amber, flashing, cannot_tell/);
    expect(errorFor(3)).toMatch(/Unknown checkpoint "router_lightz".*router_lights/);
    expect(errorFor(4)).toMatch(/power_cable is empty/);
    expect(errorFor(5)).toMatch(/expected_action "maybe"/);
    expect(errorFor(6)).toMatch(/not a JPEG or PNG/);
    expect(errorFor(7)).toMatch(/plain file name/);
    expect(errorFor(8)).toMatch(/sensitive_content "card"/);
  });

  it("flags duplicates, missing photos, ignored cells and inconsistent actions", () => {
    const csv = [
      HEADER,
      "IMG_1.jpg,router_lights,router,on,on,on,,,proceed,,,", // device_identified not asked here → ignored
      "IMG_1.jpg,router_lights,,on,on,on,,,proceed,,,", // duplicate
      "missing.jpg,router_lights,,on,on,on,,,proceed,,,", // not in folder yet
      "rear.png,router_rear,,,,,cannot_tell,connected,proceed,,,", // proceed but unreadable
    ].join("\n");
    const { labels, issues } = parseLabels(csv, workflow, files);
    expect(issues.find((i) => i.line === 2)?.message).toMatch(/device_identified is not asked at router_lights/);
    expect(issues.find((i) => i.line === 3 && i.severity === "error")?.message).toMatch(/already labelled .* line 2/);
    const missing = labels.find((l) => l.file === "missing.jpg");
    expect(missing?.found).toBe(false);
    expect(issues.find((i) => i.line === 4)).toMatchObject({ severity: "warning" });
    expect(issues.find((i) => i.line === 5)?.message).toMatch(/"proceed" but an item is cannot_tell/);
  });

  it("explains a missing or empty header", () => {
    expect(parseLabels("", workflow).issues[0].message).toMatch(/empty/);
    const r = parseLabels("file,power_light\nIMG_1.jpg,on", workflow);
    expect(r.issues.map((i) => i.message).join(" ")).toMatch(/Missing column "checkpoint".*Missing column "expected_action"/);
    expect(parseLabels(`${HEADER}\n`, workflow).issues[0].message).toMatch(/no labelled photos/);
  });
});

// ---------------------------------------------------------------------------
// Scoring with a scripted provider (no network)
// ---------------------------------------------------------------------------

type Reading = [type: string, value: string | null, confidence: number, status?: ObservationInput["status"], next?: string];

function obs([type, value, confidence, status, next]: Reading): ObservationInput {
  return {
    observationType: type,
    value: value ?? undefined,
    observationText: `${type} reading`,
    confidence,
    status: status ?? (value ? "confirmed_visible" : "unreadable"),
    requiresConfirmation: !value,
    recommendedNextAction: next,
  };
}

const usage = (input: number, output: number, model = "claude-opus-5-5"): ModelUsage => ({ model, inputTokens: input, outputTokens: output, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });

class ScriptedProvider implements ReasoningProvider {
  readonly id = "scripted";
  readonly simulated = true;
  readonly modelVersion = "claude-opus-5-5";
  readonly seen: EvidenceInput[] = [];
  constructor(private readonly script: Record<string, { readings: Reading[]; latencyMs: number; usage?: ModelUsage; sensitive?: string } | Error>) {}
  interpretUtterance() {
    return Promise.resolve({ intent: "unknown" });
  }
  interpretEvidence(input: EvidenceInput): Promise<EvidenceInterpretation> {
    this.seen.push(input);
    const s = this.script[input.visualEvent.frameReference.replace(/^photo:/, "")];
    if (!s) return Promise.reject(new Error("unscripted photo"));
    if (s instanceof Error) return Promise.reject(s);
    const observations = s.readings.map(obs);
    if (s.sensitive) observations.push({ observationType: "sensitive_content", value: s.sensitive, observationText: "card", confidence: 0.7, status: "likely_visible", requiresConfirmation: true });
    return Promise.resolve({ observations, modelVersion: this.modelVersion, latencyMs: s.latencyMs, usage: s.usage });
  }
}

function label(file: string, checkpoint: string, expected: Record<string, string | null>, expectedAction: PhotoLabel["expectedAction"], extra: Partial<PhotoLabel> = {}): PhotoLabel {
  const cp = photoCheckpoints(workflow).find((c) => c.checkpoint === checkpoint)!;
  return { line: 2, file, checkpoint, stepKey: cp.stepKey, expected, expectedAction, scenarios: [], ...extra };
}

const LIGHTS_OK = { power_light: "on", internet_light: "on", wifi_light: "on" };

describe("next-action decision", () => {
  it("uses the workflow engine: carry on only when every item is read above the step threshold", () => {
    const sure = decideAction(workflow, "inspect_lights", [obs(["power_light", "on", 0.9]), obs(["internet_light", "red", 0.9]), obs(["wifi_light", "on", 0.8])]);
    expect(sure.action).toBe("proceed");
    expect(Object.fromEntries(sure.accepted)).toEqual({ power_light: "on", internet_light: "red", wifi_light: "on" });
    // inspect_lights has a 0.75 threshold: a 0.7 reading is not enough, and the engine asks for a closer view.
    expect(decideAction(workflow, "inspect_lights", [obs(["power_light", "on", 0.9]), obs(["internet_light", "on", 0.7]), obs(["wifi_light", "on", 0.9])]).action).toBe("request_closer_view");
    // The model suggesting another angle, or items not reported at all, mean another angle.
    expect(decideAction(workflow, "inspect_lights", [obs(["power_light", "on", 0.9]), obs(["internet_light", null, 0.2, "unreadable", "request_another_angle"]), obs(["wifi_light", "on", 0.9])]).action).toBe("request_another_angle");
    expect(decideAction(workflow, "inspect_lights", []).action).toBe("request_another_angle");
  });
});

describe("photo evaluation run and metrics", () => {
  const labels: PhotoLabel[] = [
    // 1. Clear photo, read correctly → right, carries on.
    label("ok.jpg", "router_lights", LIGHTS_OK, "proceed", { scenarios: ["normal"], sensitiveContent: "none" }),
    // 2. Glare: should ask; the model guesses the hidden lights → guessed, and carried on with a wrong reading.
    label("glare.jpg", "router_lights", { power_light: "on", internet_light: null, wifi_light: null }, "request_another_angle", { scenarios: ["glare"] }),
    // 3. Too far: should ask for a closer view, and does.
    label("far.jpg", "router_lights", { power_light: "on", internet_light: null, wifi_light: null }, "request_closer_view", { scenarios: ["too_far"] }),
    // 4. Good photo, model unsure → unnecessary retake; card in frame flagged correctly.
    label("card.jpg", "router_lights", { power_light: "on", internet_light: "red", wifi_light: "on" }, "proceed", { scenarios: ["card"], sensitiveContent: "payment_card" }),
    // 5. Rear cables: reads amber-for-red style mistake on a cable → wrong reading acted on.
    label("rear.jpg", "router_rear", { broadband_cable: "disconnected", power_cable: "connected" }, "proceed", { scenarios: ["loose_cable"] }),
    // 6. API failure.
    label("fail.jpg", "router_front", { device_identified: "router" }, "proceed"),
  ];
  const provider = new ScriptedProvider({
    "ok.jpg": { readings: [["power_light", "on", 0.95], ["internet_light", "on", 0.9], ["wifi_light", "on", 0.9]], latencyMs: 1000, usage: usage(1500, 300) },
    "glare.jpg": { readings: [["power_light", "on", 0.9], ["internet_light", "on", 0.8], ["wifi_light", "on", 0.8]], latencyMs: 2000, usage: usage(1500, 300) },
    "far.jpg": { readings: [["power_light", "on", 0.8], ["internet_light", null, 0.3, "unreadable", "request_closer_view"], ["wifi_light", null, 0.3, "unreadable", "request_closer_view"]], latencyMs: 3000, usage: usage(1500, 300) },
    "card.jpg": { readings: [["power_light", "on", 0.9], ["internet_light", "red", 0.6], ["wifi_light", "on", 0.9]], latencyMs: 4000, usage: usage(1500, 300), sensitive: "payment_card" },
    "rear.jpg": { readings: [["broadband_cable", "connected", 0.9], ["power_cable", "connected", 0.95]], latencyMs: 10000, usage: usage(1500, 300, "claude-unpriced-1") },
    "fail.jpg": new Error("Model declined the request (refusal)"),
  });

  async function run() {
    return runPhotoEvaluation(labels, {
      provider,
      workflow,
      concurrency: 2,
      now: () => new Date("2026-10-13T09:00:00Z"),
      loadPhoto: async (l) => ({ mime: "image/jpeg", data: new TextEncoder().encode(l.file), width: 960, height: 720 }),
    });
  }

  it("sends each photo at its checkpoint step, like a live frame", async () => {
    const r = await run();
    expect(r.results.map((x) => x.file)).toEqual(labels.map((l) => l.file));
    const lights = provider.seen.find((s) => s.visualEvent.frameReference === "photo:ok.jpg")!;
    expect(lights.step?.key).toBe("inspect_lights");
    expect(lights.visualEvent.checkpoint).toBe("router_lights");
    expect(lights.frame?.mime).toBe("image/jpeg");
    expect(lights.visualEvent).toMatchObject({ width: 960, height: 720, triggerType: "workflow_checkpoint" });
  });

  it("scores items, next actions, guessing and unsafe carry-ons", async () => {
    const r = await run();
    const m = r.metrics;
    expect(m.photos).toBe(6);
    expect(m.failed).toBe(1);
    expect(r.results[5].error).toMatch(/refusal/);

    const by = (f: string) => r.results.find((x) => x.file === f)!;
    expect(by("ok.jpg")).toMatchObject({ predictedAction: "proceed", acceptedWrong: [] });
    expect(by("glare.jpg")).toMatchObject({ predictedAction: "proceed", acceptedWrong: ["internet_light", "wifi_light"] });
    expect(by("far.jpg").predictedAction).toBe("request_closer_view");
    expect(by("card.jpg").predictedAction).toBe("request_closer_view");
    expect(by("rear.jpg")).toMatchObject({ predictedAction: "proceed", acceptedWrong: ["broadband_cable"] });

    const a = m.actions;
    expect(a).toMatchObject({ scored: 5, correct: 3, retakeNeeded: 2, retakeAsked: 1, guessed: 1, retakeKindMatched: 1, proceedExpected: 3, unnecessaryRetakes: 1, unsafeProceeds: 2 });
    expect(a.accuracy).toBeCloseTo(3 / 5, 10);
    expect(a.confusion).toEqual({
      proceed: { proceed: 2, request_closer_view: 1 },
      request_another_angle: { proceed: 1 },
      request_closer_view: { request_closer_view: 1 },
    });

    // Items: 3+3+3+3+2 = 14 scored. Right: ok 3, glare 1 (power), far 3 (power + 2 rightly declined), card 3, rear 1 (power_cable).
    expect(m.items.items).toBe(14);
    expect(m.items.accuracy).toBeCloseTo(11 / 14, 10);
    expect(m.items.hallucinations).toBe(2);
    expect(m.items.byType.find((t) => t.observationType === "broadband_cable")).toMatchObject({ incorrect: 1, accuracy: 0 });
    expect(m.items.confusion.internet_light["(cannot tell)"]).toEqual({ on: 1, "(declined)": 1 });
    expect(m.items.confusion.broadband_cable.disconnected).toEqual({ connected: 1 });
  });

  it("buckets confidence into the QA bands", async () => {
    const m = (await run()).metrics;
    const band = (label: string) => m.calibrationBands.find((b) => b.label === label)!;
    // Committed readings: 12 (far.jpg declines two). 50–74%: card internet 0.6 (right).
    expect(band("< 50%").count).toBe(0);
    expect(band("50–74%")).toMatchObject({ count: 1, accuracy: 1 });
    // 75–84%: glare internet 0.8 + wifi 0.8 (both made up), far power 0.8 (right).
    expect(band("75–84%").count).toBe(3);
    expect(band("75–84%").accuracy).toBeCloseTo(1 / 3, 10);
    // ≥ 85%: 8 readings, one wrong (rear broadband 0.9).
    expect(band("≥ 85%")).toMatchObject({ count: 8, accuracy: 7 / 8 });
    expect(band("≥ 85%").meanConfidence).toBeCloseTo((0.95 + 0.9 + 0.9 + 0.9 + 0.9 + 0.9 + 0.9 + 0.95) / 8, 10);
  });

  it("reports latency, privacy flags and cost from provider usage", async () => {
    const m = (await run()).metrics;
    expect(m.latency).toEqual({ count: 5, meanMs: 4000, medianMs: 3000, p95Ms: 10000, maxMs: 10000 });
    expect(m.sensitive).toEqual({ scored: 2, correct: 2, missed: 0, falseAlarms: 0 });
    // Opus 5.5 list price: $4 in / $20 out per MTok → 1500·4 + 300·20 = $0.012 per photo. The unpriced model is not costed.
    const one = measuredModelCost(usage(1500, 300))!.usd;
    expect(one).toBeCloseTo(0.012, 10);
    expect(m.cost).toMatchObject({ withUsage: 5, priced: 4, inputTokens: 7500, outputTokens: 1500 });
    expect(m.cost.totalUsd).toBeCloseTo(4 * one, 10);
    expect(m.cost.perPhotoUsd).toBeCloseTo(one, 10);
    expect(m.cost.models.sort()).toEqual(["claude-opus-5-5", "claude-unpriced-1"]);
  });

  it("renders a Markdown report with a plain-English summary and a CSV row per item", async () => {
    const r = await run();
    const md = renderMarkdown(r, { folder: "/photos", effort: "low" });
    expect(md.indexOf("## Summary")).toBeLessThan(md.indexOf("## What the assistant would do next"));
    expect(md).toMatch(/1 could not be analysed.*is left out/);
    expect(md).toMatch(/asked for another photo 1 of 2 \(50%\) and went ahead anyway 1 time/);
    expect(md).toMatch(/on 2 photos the assistant would have carried on using a wrong reading/);
    expect(md).toMatch(/\| glare\.jpg \| router_lights \| \*\*carried on with a wrong reading\*\* \(internet_light, wifi_light\)/);
    expect(md).toMatch(/fail\.jpg \| router_front \| Could not be analysed: Model declined/);
    expect(summaryLines(r).some((l) => /small sample \(5 photos\)/.test(l))).toBe(true);

    const rows = parseCsv(renderCsv(r));
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    // 14 item rows + 1 row for the failed photo.
    expect(rows).toHaveLength(1 + 14 + 1);
    const col = (name: string) => CSV_COLUMNS.indexOf(name as (typeof CSV_COLUMNS)[number]);
    const glareWifi = rows.find((x) => x[0] === "glare.jpg" && x[col("item")] === "wifi_light")!;
    expect(glareWifi[col("label")]).toBe("cannot_tell");
    expect(glareWifi[col("outcome")]).toBe("hallucinated");
    expect(glareWifi[col("carried_on_with_wrong_reading")]).toBe("true");
    expect(rows.at(-1)![col("error")]).toMatch(/refusal/);
  });

  it("handles a run where every photo failed", () => {
    const failed: PhotoCaseResult = { caseId: "x", title: "x", tags: [], items: [], latencyMs: 0, error: "boom", file: "x.jpg", checkpoint: "router_front", expectedAction: "proceed", acceptedWrong: [], observationText: {}, modelSuggestion: {} };
    const m = computePhotoMetrics([failed]);
    expect(m).toMatchObject({ photos: 1, failed: 1, actions: { scored: 0 }, latency: { count: 0 }, cost: { priced: 0 } });
    expect(m.actions.accuracy).toBeUndefined();
  });
});

describe("report maths", () => {
  it("computes a Wilson interval that stays inside 0–100%", () => {
    const ci = wilsonInterval(45, 50)!;
    expect(ci.low).toBeCloseTo(0.7864, 3);
    expect(ci.high).toBeCloseTo(0.9565, 3);
    expect(wilsonInterval(0, 10)!.low).toBe(0);
    expect(wilsonInterval(10, 10)!.high).toBeCloseTo(1, 10);
    expect(wilsonInterval(0, 0)).toBeUndefined();
  });

  it("computes mean, median and nearest-rank percentiles", () => {
    expect(latencyMetrics([400, 100, 300, 200])).toEqual({ count: 4, meanMs: 250, medianMs: 250, p95Ms: 400, maxMs: 400 });
    expect(latencyMetrics([])).toEqual({ count: 0 });
  });
});
