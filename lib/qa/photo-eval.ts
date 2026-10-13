import type { ModelUsage, VisualEvent, VisualObservation, WorkflowDefinition } from "@/lib/domain/types";
import { measuredModelCost, usdToGbp } from "@/lib/domain/pricing";
import type { ReasoningProvider } from "@/lib/providers/types";
import type { ObservationInput } from "@/lib/session/orchestrator";
import { assessEvidence, getStep } from "@/lib/workflow/engine";
import { calibrationBins, QA_BAND_EDGES, type CalibrationBin, type CalibrationPoint } from "./calibration";
import { computeMetrics, evaluationState, scoreItem, type CaseResult, type EvaluationMetrics, type Frame } from "./evaluation";
import type { PhotoAction, PhotoLabel } from "./photo-labels";

/**
 * Real-photo evaluation (scripts/eval-photos.ts, eval/router-photos/).
 *
 * Each labelled photo is sent to a ReasoningProvider exactly as a live session
 * would send a frame at that checkpoint. Item readings are scored with the
 * same rules as the synthetic evaluation set (lib/qa/evaluation.ts), and the
 * next action is decided by the workflow engine's own `assessEvidence`, so the
 * report measures what the product would actually do with the photo.
 */

export interface PhotoCaseResult extends CaseResult {
  file: string;
  checkpoint: string;
  expectedAction: PhotoAction;
  /** What the workflow engine would do with this reading; absent when the call failed. */
  predictedAction?: PhotoAction;
  /** Items the engine would have acted on with a value that does not match the label. */
  acceptedWrong: string[];
  /** Model's own description per item, for reviewing mistakes. */
  observationText: Record<string, string>;
  /** Model's own next-action suggestion per item, when it gave one. */
  modelSuggestion: Record<string, string>;
  expectedSensitive?: string;
  predictedSensitive?: string;
  usage?: ModelUsage;
  costUsd?: number;
}

export interface PhotoRunOptions {
  provider: ReasoningProvider;
  workflow: WorkflowDefinition;
  /** Bytes for a labelled photo, already resized the way the app resizes frames. */
  loadPhoto: (label: PhotoLabel) => Promise<Frame & { width?: number; height?: number }>;
  concurrency?: number;
  now?: () => Date;
  /** Called after each photo, e.g. for a progress line. */
  onResult?: (result: PhotoCaseResult, done: number, total: number) => void;
}

const RETAKE: PhotoAction[] = ["request_closer_view", "request_another_angle"];

export function isRetake(action: PhotoAction | undefined): boolean {
  return action !== undefined && RETAKE.includes(action);
}

/** Map the engine's evidence assessment to the label vocabulary. */
export function decideAction(workflow: WorkflowDefinition, stepKey: string, observations: ObservationInput[]): { action: PhotoAction; accepted: Map<string, string> } {
  const step = getStep(workflow, stepKey);
  const asVisual: VisualObservation[] = observations.map((o, i) => ({
    ...o,
    id: `obs_eval_${i}`,
    visualEventId: "ve_eval",
    sessionId: "eval",
    modelVersion: "eval",
    timestamp: "1970-01-01T00:00:00.000Z",
  }));
  const a = assessEvidence(step, asVisual, workflow.defaultConfidenceThreshold);
  if (a.kind === "sufficient") return { action: "proceed", accepted: new Map(a.accepted.filter((o) => o.value !== undefined).map((o) => [o.observationType, o.value!])) };
  return { action: a.recommendation === "closer" ? "request_closer_view" : "request_another_angle", accepted: new Map() };
}

async function runPhoto(label: PhotoLabel, opts: PhotoRunOptions, index: number): Promise<PhotoCaseResult> {
  const now = (opts.now ?? (() => new Date()))();
  const base = {
    caseId: `${label.file}#${label.checkpoint}`,
    title: label.file,
    tags: label.scenarios,
    file: label.file,
    checkpoint: label.checkpoint,
    expectedAction: label.expectedAction,
    acceptedWrong: [],
    observationText: {},
    modelSuggestion: {},
    ...(label.sensitiveContent ? { expectedSensitive: label.sensitiveContent } : {}),
  };
  try {
    const frame = await opts.loadPhoto(label);
    const step = getStep(opts.workflow, label.stepKey);
    const sessionId = `eval_photo_${index}`;
    const state = evaluationState(opts.workflow, sessionId, now.toISOString());
    const visualEvent: VisualEvent = {
      id: `ve_eval_photo_${index}`,
      sessionId,
      triggerType: "workflow_checkpoint",
      timestamp: now.toISOString(),
      frameReference: `photo:${label.file}`,
      checkpoint: label.checkpoint,
      stepKey: step.key,
      width: frame.width ?? 0,
      height: frame.height ?? 0,
      bytes: frame.data.byteLength,
      processingStatus: "analysing",
    };
    const out = await opts.provider.interpretEvidence({ state, visualEvent, workflow: opts.workflow, step, frame: { mime: frame.mime, data: frame.data } });
    const sensitive = out.observations.find((o) => o.observationType === "sensitive_content");
    const readings = out.observations.filter((o) => o.observationType !== "sensitive_content");
    const byType = new Map<string, ObservationInput>();
    // As in the synthetic runner: if an item is reported twice, keep the reading the provider was most sure of.
    for (const o of readings) if (!byType.has(o.observationType) || byType.get(o.observationType)!.confidence < o.confidence) byType.set(o.observationType, o);

    const items = Object.entries(label.expected).map(([t, e]) => scoreItem(t, e, byType.get(t)));
    const { action, accepted } = decideAction(opts.workflow, label.stepKey, readings);
    const acceptedWrong = action === "proceed" ? [...accepted].filter(([t, v]) => t in label.expected && label.expected[t] !== v).map(([t]) => t) : [];
    const cost = out.usage ? measuredModelCost(out.usage) : undefined;
    return {
      ...base,
      items,
      latencyMs: out.latencyMs,
      predictedAction: action,
      acceptedWrong,
      observationText: Object.fromEntries([...byType].map(([t, o]) => [t, o.observationText])),
      modelSuggestion: Object.fromEntries([...byType].filter(([, o]) => o.recommendedNextAction).map(([t, o]) => [t, o.recommendedNextAction!])),
      predictedSensitive: typeof sensitive?.value === "string" ? sensitive.value : "none",
      ...(out.usage ? { usage: out.usage } : {}),
      ...(cost ? { costUsd: cost.usd } : {}),
    };
  } catch (e) {
    return { ...base, items: [], latencyMs: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ActionMetrics {
  /** Photos with a decision (failed calls excluded). */
  scored: number;
  correct: number;
  accuracy?: number;
  /** expected → predicted → count */
  confusion: Record<string, Record<string, number>>;
  /** Photos labelled as needing another photo. */
  retakeNeeded: number;
  /** …where the assistant did ask for another photo (either kind). */
  retakeAsked: number;
  /** …where it went ahead anyway ("guessed"). */
  guessed: number;
  /** Retakes asked for with the same kind (closer vs angle) as the label. */
  retakeKindMatched: number;
  /** Photos labelled "proceed". */
  proceedExpected: number;
  /** …where it asked for another photo it did not need. */
  unnecessaryRetakes: number;
  /** Photos where it went ahead and acted on at least one wrong reading. */
  unsafeProceeds: number;
}

export interface LatencyMetrics {
  count: number;
  meanMs?: number;
  medianMs?: number;
  p95Ms?: number;
  maxMs?: number;
}

export interface CostMetrics {
  /** Photos with provider-reported token usage. */
  withUsage: number;
  /** Photos whose usage could be priced from lib/domain/pricing.ts. */
  priced: number;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
  totalGbp: number;
  perPhotoUsd?: number;
  perPhotoGbp?: number;
  models: string[];
}

export interface PhotoMetrics {
  photos: number;
  failed: number;
  items: EvaluationMetrics;
  actions: ActionMetrics;
  /** Committed readings bucketed by the confidence bands used on the QA pages. */
  calibrationBands: CalibrationBin[];
  sensitive: { scored: number; correct: number; missed: number; falseAlarms: number };
  latency: LatencyMetrics;
  cost: CostMetrics;
}

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function latencyMetrics(values: number[]): LatencyMetrics {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0 };
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    meanMs: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    medianMs: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    p95Ms: percentile(sorted, 95),
    maxMs: sorted[sorted.length - 1],
  };
}

export function computePhotoMetrics(results: PhotoCaseResult[]): PhotoMetrics {
  const ok = results.filter((r) => !r.error);
  const decided = ok.filter((r) => r.predictedAction !== undefined);

  const confusion: ActionMetrics["confusion"] = {};
  for (const r of decided) {
    const row = (confusion[r.expectedAction] ??= {});
    row[r.predictedAction!] = (row[r.predictedAction!] ?? 0) + 1;
  }
  const needRetake = decided.filter((r) => isRetake(r.expectedAction));
  const needProceed = decided.filter((r) => r.expectedAction === "proceed");
  const correct = decided.filter((r) => r.predictedAction === r.expectedAction).length;
  const actions: ActionMetrics = {
    scored: decided.length,
    correct,
    accuracy: decided.length ? correct / decided.length : undefined,
    confusion,
    retakeNeeded: needRetake.length,
    retakeAsked: needRetake.filter((r) => isRetake(r.predictedAction)).length,
    guessed: needRetake.filter((r) => r.predictedAction === "proceed").length,
    retakeKindMatched: needRetake.filter((r) => r.predictedAction === r.expectedAction).length,
    proceedExpected: needProceed.length,
    unnecessaryRetakes: needProceed.filter((r) => isRetake(r.predictedAction)).length,
    unsafeProceeds: decided.filter((r) => r.predictedAction === "proceed" && r.acceptedWrong.length > 0).length,
  };

  const points: CalibrationPoint[] = ok.flatMap((r) =>
    r.items.filter((i) => i.predicted !== undefined && i.confidence !== undefined).map((i) => ({ confidence: i.confidence!, correct: i.outcome === "correct" })),
  );

  const sensitiveScored = ok.filter((r) => r.expectedSensitive !== undefined);
  const flagged = (v: string | undefined) => v !== undefined && v !== "none";
  const sensitive = {
    scored: sensitiveScored.length,
    correct: sensitiveScored.filter((r) => (r.predictedSensitive ?? "none") === r.expectedSensitive).length,
    missed: sensitiveScored.filter((r) => flagged(r.expectedSensitive) && !flagged(r.predictedSensitive)).length,
    falseAlarms: sensitiveScored.filter((r) => !flagged(r.expectedSensitive) && flagged(r.predictedSensitive)).length,
  };

  const withUsage = ok.filter((r) => r.usage);
  const priced = withUsage.filter((r) => r.costUsd !== undefined);
  const totalUsd = priced.reduce((s, r) => s + r.costUsd!, 0);
  const cost: CostMetrics = {
    withUsage: withUsage.length,
    priced: priced.length,
    inputTokens: withUsage.reduce((s, r) => s + r.usage!.inputTokens + r.usage!.cacheCreationInputTokens + r.usage!.cacheReadInputTokens, 0),
    outputTokens: withUsage.reduce((s, r) => s + r.usage!.outputTokens, 0),
    totalUsd,
    totalGbp: totalUsd * usdToGbp(),
    perPhotoUsd: priced.length ? totalUsd / priced.length : undefined,
    perPhotoGbp: priced.length ? (totalUsd * usdToGbp()) / priced.length : undefined,
    models: [...new Set(withUsage.flatMap((r) => (r.usage!.parts?.length ? r.usage!.parts.map((p) => p.model) : [r.usage!.model])))],
  };

  return {
    photos: results.length,
    failed: results.length - ok.length,
    items: computeMetrics(results),
    actions,
    calibrationBands: calibrationBins(points, QA_BAND_EDGES),
    sensitive,
    latency: latencyMetrics(ok.map((r) => r.latencyMs)),
    cost,
  };
}

export interface PhotoEvalRun {
  startedAt: string;
  finishedAt: string;
  provider: { id: string; model?: string; simulated: boolean };
  workflow: { id: string; name: string; version: number };
  results: PhotoCaseResult[];
  metrics: PhotoMetrics;
}

export async function runPhotoEvaluation(labels: PhotoLabel[], opts: PhotoRunOptions): Promise<PhotoEvalRun> {
  const clock = opts.now ?? (() => new Date());
  const startedAt = clock().toISOString();
  const results: PhotoCaseResult[] = new Array(labels.length);
  const width = Math.max(1, Math.min(opts.concurrency ?? 1, labels.length || 1));
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < labels.length) {
        const i = next++;
        results[i] = await runPhoto(labels[i], opts, i);
        done += 1;
        opts.onResult?.(results[i], done, labels.length);
      }
    }),
  );
  const provider = opts.provider as ReasoningProvider & { modelVersion?: string };
  return {
    startedAt,
    finishedAt: clock().toISOString(),
    provider: { id: provider.id, model: provider.modelVersion, simulated: provider.simulated },
    workflow: { id: opts.workflow.id, name: opts.workflow.name, version: opts.workflow.version },
    results,
    metrics: computePhotoMetrics(results),
  };
}
