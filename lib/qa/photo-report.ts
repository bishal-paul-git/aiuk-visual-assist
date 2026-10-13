import type { ItemOutcome } from "./evaluation";
import { toCsv } from "./csv";
import type { PhotoEvalRun } from "./photo-eval";
import { CANNOT_TELL } from "./photo-labels";

/**
 * Markdown and CSV reports for a real-photo evaluation run. The Markdown
 * opens with a plain-English summary for people deciding on a pilot; the CSV
 * has one row per photo and item for anyone who wants to filter mistakes in a
 * spreadsheet.
 */

export interface ReportContext {
  folder?: string;
  effort?: string;
  checkpoint?: string;
  /** Labelled rows skipped because the photo was not in the folder. */
  skippedMissing?: number;
  resize?: string;
}

const OUTCOME_LABEL: Record<ItemOutcome, string> = {
  correct: "right",
  incorrect: "wrong",
  abstained: "declined, but it could be read",
  missing: "not reported",
  hallucinated: "gave a value that cannot be read from the photo",
  correct_abstention: "rightly declined",
};

const ACTION_LABEL: Record<string, string> = {
  proceed: "carry on",
  request_closer_view: "ask for a closer photo",
  request_another_angle: "ask for another angle",
};

export function pct(n: number | undefined, digits = 0): string {
  return n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`;
}

function frac(n: number, d: number): string {
  return d ? `${n} of ${d} (${pct(n / d)})` : "none";
}

/** 95% Wilson score interval for a proportion; a fair "give or take" for small samples. */
export function wilsonInterval(successes: number, total: number, z = 1.96): { low: number; high: number } | undefined {
  if (total <= 0) return undefined;
  const p = successes / total;
  const z2 = z * z;
  const centre = (p + z2 / (2 * total)) / (1 + z2 / total);
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / (1 + z2 / total);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function seconds(ms: number | undefined): string {
  return ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} s`;
}

function money(gbp: number | undefined, usd: number | undefined): string {
  if (gbp === undefined || usd === undefined) return "—";
  const digits = usd < 0.1 ? 4 : 2;
  return `£${gbp.toFixed(digits)} ($${usd.toFixed(digits)})`;
}

function cell(v: string | number): string {
  return String(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function table(head: string[], rows: (string | number)[][]): string {
  return [`| ${head.map(cell).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

/** Plain-English bullet points for the top of the report. */
export function summaryLines(run: PhotoEvalRun, ctx: ReportContext = {}): string[] {
  const m = run.metrics;
  const it = m.items;
  const a = m.actions;
  const answered = m.photos - m.failed;
  const lines: string[] = [];
  const model = run.provider.model ?? run.provider.id;

  lines.push(
    `Claude (${model}) looked at **${m.photos} photo${m.photos === 1 ? "" : "s"}**` +
      (m.failed ? `; **${m.failed} could not be analysed** (see "Photos to review") and ${m.failed === 1 ? "is" : "are"} left out of the scores.` : m.photos === 1 ? " and answered it." : " and answered every one."),
  );
  if (answered === 0) return lines;

  const good = it.byType.reduce((s, t) => s + t.correct + t.correctAbstentions, 0);
  const ci = wilsonInterval(good, it.items);
  lines.push(
    `**Reading the lights and cables:** right on ${good} of ${it.items} items (${pct(good / it.items)}). Saying "I can't tell" on a photo that really can't be read counts as right.` +
      (ci ? ` With a sample this size the true figure is probably between ${pct(ci.low)} and ${pct(ci.high)}.` : ""),
  );
  if (it.answered) lines.push(`When it gave a definite reading, that reading was right ${frac(it.byType.reduce((s, t) => s + t.correct, 0), it.answered)}.`);
  const undeterminable = it.byType.reduce((s, t) => s + t.hallucinated + t.correctAbstentions, 0);
  if (undeterminable) lines.push(`**Guessing at things it could not see:** it gave a value for ${frac(it.hallucinations, undeterminable)} items that could not be read from the photo.`);
  if (a.retakeNeeded) {
    lines.push(
      `**Asking for another photo:** ${a.retakeNeeded} photo${a.retakeNeeded === 1 ? "" : "s"} needed retaking (glare, blur, too far, wrong device…). ` +
        `It asked for another photo ${frac(a.retakeAsked, a.retakeNeeded)} and went ahead anyway ${a.guessed} time${a.guessed === 1 ? "" : "s"}.`,
    );
  }
  if (a.proceedExpected) lines.push(`On ${a.proceedExpected} good photo${a.proceedExpected === 1 ? "" : "s"} it asked for an unnecessary retake ${a.unnecessaryRetakes} time${a.unnecessaryRetakes === 1 ? "" : "s"} (annoying, but safe).`);
  lines.push(
    a.unsafeProceeds
      ? `**Most important:** on ${a.unsafeProceeds} photo${a.unsafeProceeds === 1 ? "" : "s"} the assistant would have carried on using a wrong reading, which could send a customer down the wrong troubleshooting path. Review these first.`
      : `**Most important:** it never carried on using a wrong reading.`,
  );
  const top = m.calibrationBands[m.calibrationBands.length - 1];
  if (top?.count) lines.push(`When it said it was at least ${Math.round(top.lower * 100)}% sure, it was right ${pct(top.accuracy)} of the time (${top.count} reading${top.count === 1 ? "" : "s"}).`);
  if (m.sensitive.scored) {
    lines.push(
      `**Privacy flag:** correct on ${frac(m.sensitive.correct, m.sensitive.scored)} labelled photos` +
        (m.sensitive.missed ? `; it missed ${m.sensitive.missed} card/ID/person in frame` : "") +
        (m.sensitive.falseAlarms ? `; ${m.sensitive.falseAlarms} false alarm${m.sensitive.falseAlarms === 1 ? "" : "s"}` : "") +
        ".",
    );
  }
  lines.push(
    `**Speed and cost:** ${seconds(m.latency.meanMs)} per photo on average (slowest ${seconds(m.latency.maxMs)})` +
      (m.cost.priced ? `; about ${money(m.cost.perPhotoGbp, m.cost.perPhotoUsd)} per photo, ${money(m.cost.totalGbp, m.cost.totalUsd)} for this run.` : m.cost.withUsage ? "; cost unknown (model not in the price table)." : "; cost not reported."),
  );
  if (answered < 30) lines.push(`_This is a small sample (${answered} photo${answered === 1 ? "" : "s"}). Treat the percentages as a first indication; 30–50 photos give a steadier picture._`);
  if (ctx.skippedMissing) lines.push(`_${ctx.skippedMissing} labelled row${ctx.skippedMissing === 1 ? " was" : "s were"} skipped because the photo is not in the folder._`);
  return lines;
}

export function renderMarkdown(run: PhotoEvalRun, ctx: ReportContext = {}): string {
  const m = run.metrics;
  const out: string[] = [];
  out.push("# Router photo evaluation", "");
  out.push(
    table(
      ["", ""],
      [
        ["Run", `${run.startedAt} → ${run.finishedAt}`],
        ["Model", `${run.provider.model ?? run.provider.id}${ctx.effort ? ` (effort ${ctx.effort})` : ""}${run.provider.simulated ? " — simulated" : ""}`],
        ["Workflow", `${run.workflow.name} v${run.workflow.version} (${run.workflow.id})`],
        ["Photos", `${m.photos}${ctx.checkpoint ? ` at checkpoint ${ctx.checkpoint}` : ""}`],
        ...(ctx.folder ? [["Folder", ctx.folder]] : []),
        ...(ctx.resize ? [["Image preparation", ctx.resize]] : []),
      ],
    ),
    "",
  );
  out.push("## Summary", "", ...summaryLines(run, ctx).map((l) => `- ${l}`), "");

  const a = m.actions;
  out.push("## What the assistant would do next", "");
  out.push(
    "The workflow engine (`assessEvidence`) decides from the model's readings whether to carry on or ask for a better photo. Rows are what the photo needed; columns are what the assistant would do.",
    "",
  );
  const actions = ["proceed", "request_closer_view", "request_another_angle"];
  out.push(table(["Photo needed ↓ / assistant did →", ...actions.map((x) => ACTION_LABEL[x]), "Total"], actions.filter((e) => a.confusion[e]).map((e) => [ACTION_LABEL[e], ...actions.map((p) => a.confusion[e]?.[p] ?? 0), Object.values(a.confusion[e]).reduce((s, n) => s + n, 0)])));
  out.push("");
  out.push(
    table(
      ["Measure", "Result"],
      [
        ["Right next step (exact)", a.scored ? frac(a.correct, a.scored) : "—"],
        ["Needed a retake → asked for one", a.retakeNeeded ? frac(a.retakeAsked, a.retakeNeeded) : "—"],
        ["Needed a retake → went ahead (guessed)", a.retakeNeeded ? frac(a.guessed, a.retakeNeeded) : "—"],
        ["Asked for the right kind of retake (closer vs angle)", a.retakeNeeded ? frac(a.retakeKindMatched, a.retakeNeeded) : "—"],
        ["Good photo → unnecessary retake", a.proceedExpected ? frac(a.unnecessaryRetakes, a.proceedExpected) : "—"],
        ["Carried on with a wrong reading", a.scored ? frac(a.unsafeProceeds, a.scored) : "—"],
      ],
    ),
    "",
  );

  const it = m.items;
  out.push("## Accuracy by item", "");
  out.push(
    table(
      ["Item", "Labelled", "Right", "Wrong", "Declined but readable", "Not reported", "Value it could not see", "Rightly declined", "Accuracy"],
      it.byType.map((t) => [t.observationType, t.items, t.correct, t.incorrect, t.abstained, t.missing, t.hallucinated, t.correctAbstentions, pct(t.accuracy)]),
    ),
    "",
  );
  out.push(`Overall: ${pct(it.accuracy)} of ${it.items} items. Definite readings: ${it.answered}, of which ${pct(it.answeredAccuracy)} were right. Coverage (items that could be read and were): ${pct(it.coverage)}.`, "");

  const tags = it.byTag.filter((t) => t.items > 0);
  if (tags.length) {
    out.push("## By scenario", "");
    out.push(table(["Scenario", "Items", "Accuracy"], tags.sort((x, y) => x.tag.localeCompare(y.tag)).map((t) => [t.tag, t.items, pct(t.accuracy)])), "");
  }

  out.push("## Confidence calibration", "");
  out.push(
    "Only definite readings count here. A well-calibrated model is right about as often as it says it is sure: readings at 90% confidence should be right about 9 times in 10. A negative gap means over-confident.",
    "",
  );
  out.push(table(["Confidence", "Readings", "Average confidence", "Actually right", "Gap"], m.calibrationBands.map((b) => [b.label, b.count, pct(b.meanConfidence), pct(b.accuracy), b.gap === undefined ? "—" : `${b.gap >= 0 ? "+" : ""}${(b.gap * 100).toFixed(0)} pts`])));
  out.push("", `Expected calibration error (10 bins): ${it.calibration.ece === undefined ? "—" : it.calibration.ece.toFixed(3)} (0 is perfect).`, "");

  out.push("## Which values get confused", "");
  out.push(`Rows are the label; columns are what the model reported. "(cannot tell)" is a label of ${CANNOT_TELL}; "(declined)" means the model said it could not read the item; "(not reported)" means it said nothing about it.`, "");
  for (const [type, rows] of Object.entries(it.confusion)) {
    const cols = [...new Set(Object.values(rows).flatMap((r) => Object.keys(r)))].sort();
    out.push(`**${type}**`, "", table(["Label ↓ / model →", ...cols], Object.entries(rows).map(([exp, r]) => [exp, ...cols.map((c) => r[c] ?? 0)])), "");
  }

  if (m.sensitive.scored) {
    out.push("## Privacy flag", "");
    out.push(table(["Measure", "Result"], [["Correct", frac(m.sensitive.correct, m.sensitive.scored)], ["Missed (card, ID, person… not flagged)", m.sensitive.missed], ["False alarms", m.sensitive.falseAlarms]]), "");
  }

  const c = m.cost;
  out.push("## Speed and cost", "");
  out.push(
    table(
      ["Measure", "Result"],
      [
        ["Average response time", seconds(m.latency.meanMs)],
        ["Median / 95th percentile / slowest", `${seconds(m.latency.medianMs)} / ${seconds(m.latency.p95Ms)} / ${seconds(m.latency.maxMs)}`],
        ["Tokens in / out", `${c.inputTokens.toLocaleString("en-GB")} / ${c.outputTokens.toLocaleString("en-GB")}`],
        ["Cost per photo", money(c.perPhotoGbp, c.perPhotoUsd)],
        ["Cost of this run", money(c.priced ? c.totalGbp : undefined, c.priced ? c.totalUsd : undefined)],
        ["Models that answered", c.models.join(", ") || "—"],
      ],
    ),
    "",
    `Costs use provider-reported token usage and the list prices in \`lib/domain/pricing.ts\`${c.priced < c.withUsage ? ` (${c.withUsage - c.priced} photo(s) used a model with no price and are not costed)` : ""}. GBP uses the USD_TO_GBP rate.`,
    "",
  );

  const review = run.results.filter((r) => r.error || r.acceptedWrong.length > 0 || r.predictedAction !== r.expectedAction || r.items.some((i) => i.outcome !== "correct" && i.outcome !== "correct_abstention"));
  out.push("## Photos to review", "");
  if (review.length === 0) out.push("Nothing to review: every photo was read and handled as labelled.", "");
  else {
    out.push(
      table(
        ["Photo", "Checkpoint", "What went wrong"],
        review.map((r) => {
          if (r.error) return [r.file, r.checkpoint, `Could not be analysed: ${r.error}`];
          const problems: string[] = [];
          if (r.acceptedWrong.length) problems.push(`**carried on with a wrong reading** (${r.acceptedWrong.join(", ")})`);
          if (r.predictedAction !== r.expectedAction) problems.push(`would ${ACTION_LABEL[r.predictedAction ?? ""] ?? "?"}; label says ${ACTION_LABEL[r.expectedAction]}`);
          for (const i of r.items.filter((x) => x.outcome !== "correct" && x.outcome !== "correct_abstention")) {
            problems.push(`${i.observationType}: ${OUTCOME_LABEL[i.outcome]} (label ${i.expected ?? CANNOT_TELL}, model ${i.predicted ?? i.status ?? "nothing"}${i.confidence !== undefined ? ` at ${pct(i.confidence)}` : ""})`);
          }
          return [r.file, r.checkpoint, problems.join("; ")];
        }),
      ),
      "",
    );
  }
  out.push(
    "## How to read this report",
    "",
    "- **Right**: the model's definite reading matches the label. **Rightly declined**: the label is cannot_tell and the model did not give a value.",
    "- **Declined but readable**: the model said it could not read something a person could read. Safe, but it costs the customer a retake.",
    "- **Value it could not see**: the model gave a definite value for something the label says cannot be read from the photo. This is guessing.",
    "- **Carried on with a wrong reading**: the riskiest outcome. The workflow would branch on a wrong value without asking for another photo.",
    "- Per-photo, per-item detail is in the CSV next to this file.",
    "",
  );
  return out.join("\n");
}

export const CSV_COLUMNS = [
  "file",
  "checkpoint",
  "scenario",
  "item",
  "label",
  "ai_value",
  "ai_status",
  "ai_confidence",
  "outcome",
  "ai_description",
  "ai_suggestion",
  "expected_action",
  "ai_action",
  "action_correct",
  "carried_on_with_wrong_reading",
  "expected_sensitive",
  "ai_sensitive",
  "latency_ms",
  "input_tokens",
  "output_tokens",
  "cost_usd",
  "error",
] as const;

export function renderCsv(run: PhotoEvalRun): string {
  const rows: (string | number | boolean | undefined)[][] = [[...CSV_COLUMNS]];
  for (const r of run.results) {
    const photo = {
      expected_action: r.expectedAction,
      ai_action: r.predictedAction,
      action_correct: r.predictedAction === undefined ? undefined : r.predictedAction === r.expectedAction,
      carried_on_with_wrong_reading: r.predictedAction === undefined ? undefined : r.acceptedWrong.length > 0,
      expected_sensitive: r.expectedSensitive,
      ai_sensitive: r.error ? undefined : r.predictedSensitive,
      latency_ms: r.error ? undefined : r.latencyMs,
      input_tokens: r.usage ? r.usage.inputTokens + r.usage.cacheCreationInputTokens + r.usage.cacheReadInputTokens : undefined,
      output_tokens: r.usage?.outputTokens,
      cost_usd: r.costUsd === undefined ? undefined : Number(r.costUsd.toFixed(6)),
      error: r.error,
    };
    const items = r.items.length ? r.items : [undefined];
    for (const i of items) {
      const row: Record<(typeof CSV_COLUMNS)[number], string | number | boolean | undefined> = {
        file: r.file,
        checkpoint: r.checkpoint,
        scenario: r.tags.join(";"),
        item: i?.observationType,
        label: i ? (i.expected ?? CANNOT_TELL) : undefined,
        ai_value: i?.predicted,
        ai_status: i?.status,
        ai_confidence: i?.confidence === undefined ? undefined : Number(i.confidence.toFixed(3)),
        outcome: i?.outcome,
        ai_description: i ? r.observationText[i.observationType] : undefined,
        ai_suggestion: i ? r.modelSuggestion[i.observationType] : undefined,
        ...photo,
      };
      rows.push(CSV_COLUMNS.map((k) => row[k]));
    }
  }
  return toCsv(rows);
}
