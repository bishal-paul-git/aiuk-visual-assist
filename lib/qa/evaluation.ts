import { agents, getPolicy } from "@/lib/config/catalog";
import type { SessionState } from "@/lib/domain/session";
import type { ISODateString, ObservationStatus, VisualEvent, WorkflowDefinition } from "@/lib/domain/types";
import { renderRouterSvg, parseSyntheticRef } from "@/lib/media/router-svg";
import type { ReasoningProvider } from "@/lib/providers/types";
import { createSession, type ObservationInput } from "@/lib/session/orchestrator";
import { calibrationBins, expectedCalibrationError, TEN_BINS, type CalibrationBin, type CalibrationPoint } from "./calibration";
import type { QaReview } from "./reviews";

/**
 * Labelled evaluation sets and the runner that scores a ReasoningProvider
 * against them (docs/08 §2: correctness, confidence calibration, hallucination
 * rate). Isomorphic: frame loading and any image conversion are injected, so
 * the server can rasterise frames for a real model while tests and the static
 * demo run the simulated provider directly.
 */

export type EvalImage =
  | { kind: "synthetic"; ref: string }
  /** A captured frame held by the session runtime ("mem:<id>"); `visualEventId` lets pages link to it. */
  | { kind: "frame"; sessionId: string; frameReference: string; visualEventId?: string };

export interface EvalCase {
  id: string;
  title: string;
  tags: string[];
  image: EvalImage;
  /** Workflow evidence checkpoint: selects the step and the observation types asked for. */
  checkpoint: string;
  /** Expected value per observation type; null means it cannot be determined, so the reader should decline. */
  expected: Record<string, string | null>;
  /** Set when the case was added from a completed QA review. */
  source?: { reviewId: string; sessionId: string; reference: string; addedAt: ISODateString; addedBy: string };
}

export interface EvaluationSet {
  id: string;
  name: string;
  description: string;
  workflowId: string;
  version: number;
  cases: EvalCase[];
}

/**
 * correct              committed to the expected value
 * incorrect            committed to a different value
 * abstained            declined although the value could be read
 * missing              said nothing about an item it was asked for
 * hallucinated         committed to a value that cannot be determined from the image
 * correct_abstention   declined (or stayed silent) on an item that cannot be determined
 */
export type ItemOutcome = "correct" | "incorrect" | "abstained" | "missing" | "hallucinated" | "correct_abstention";

export interface ItemResult {
  observationType: string;
  expected: string | null;
  predicted?: string;
  status?: ObservationStatus;
  confidence?: number;
  outcome: ItemOutcome;
}

export interface CaseResult {
  caseId: string;
  title: string;
  tags: string[];
  items: ItemResult[];
  error?: string;
  latencyMs: number;
}

export interface TypeMetrics {
  observationType: string;
  items: number;
  correct: number;
  incorrect: number;
  abstained: number;
  missing: number;
  hallucinated: number;
  correctAbstentions: number;
  /** (correct + correct abstentions) / items */
  accuracy: number;
}

export interface EvaluationMetrics {
  cases: number;
  casesFailed: number;
  items: number;
  accuracy: number;
  /** Items where the reader committed to a value. */
  answered: number;
  /** correct / answered */
  answeredAccuracy?: number;
  /** answered / items whose value can be determined */
  coverage?: number;
  hallucinations: number;
  /** hallucinated / items that cannot be determined */
  hallucinationRate?: number;
  byType: TypeMetrics[];
  byTag: { tag: string; items: number; accuracy: number }[];
  /** expected → predicted → count, per observation type. */
  confusion: Record<string, Record<string, Record<string, number>>>;
  calibration: { points: number; ece?: number; meanConfidence?: number; accuracy?: number; bins: CalibrationBin[] };
}

export interface EvaluationRun {
  id: string;
  setId: string;
  setName: string;
  setVersion: number;
  provider: { id: string; label: string; model?: string; simulated: boolean };
  startedAt: ISODateString;
  finishedAt: ISODateString;
  startedBy: { id: string; name: string };
  results: CaseResult[];
  metrics: EvaluationMetrics;
}

export const CANNOT_TELL = "(cannot tell)";
export const DECLINED = "(declined)";
export const NOT_REPORTED = "(not reported)";

const COMMITTED: ObservationStatus[] = ["confirmed_visible", "likely_visible"];

/** A reading the provider committed to: a value with a visible status. */
export function committedValue(o: Pick<ObservationInput, "value" | "status"> | undefined): string | undefined {
  return o && o.value && COMMITTED.includes(o.status) ? o.value : undefined;
}

export function scoreItem(observationType: string, expected: string | null, o: ObservationInput | undefined): ItemResult {
  const predicted = committedValue(o);
  const base = { observationType, expected, predicted, status: o?.status, confidence: o?.confidence };
  if (expected === null) return { ...base, outcome: predicted ? "hallucinated" : "correct_abstention" };
  if (!o) return { ...base, outcome: "missing" };
  if (!predicted) return { ...base, outcome: "abstained" };
  return { ...base, outcome: predicted === expected ? "correct" : "incorrect" };
}

function ratio(n: number, d: number): number | undefined {
  return d ? n / d : undefined;
}

export function computeMetrics(results: CaseResult[]): EvaluationMetrics {
  const items = results.flatMap((r) => r.items.map((i) => ({ i, tags: r.tags })));
  const count = (pred: (i: ItemResult) => boolean) => items.filter(({ i }) => pred(i)).length;
  const good = (i: ItemResult) => i.outcome === "correct" || i.outcome === "correct_abstention";

  const types = [...new Set(items.map(({ i }) => i.observationType))];
  const byType: TypeMetrics[] = types.map((t) => {
    const of = items.filter(({ i }) => i.observationType === t).map(({ i }) => i);
    const n = (o: ItemOutcome) => of.filter((i) => i.outcome === o).length;
    return {
      observationType: t,
      items: of.length,
      correct: n("correct"),
      incorrect: n("incorrect"),
      abstained: n("abstained"),
      missing: n("missing"),
      hallucinated: n("hallucinated"),
      correctAbstentions: n("correct_abstention"),
      accuracy: of.filter(good).length / of.length,
    };
  });

  const tags = [...new Set(results.flatMap((r) => r.tags))];
  const byTag = tags.map((tag) => {
    const of = items.filter((x) => x.tags.includes(tag)).map(({ i }) => i);
    return { tag, items: of.length, accuracy: of.length ? of.filter(good).length / of.length : 0 };
  });

  const confusion: EvaluationMetrics["confusion"] = {};
  for (const { i } of items) {
    const exp = i.expected ?? CANNOT_TELL;
    const pred = i.predicted ?? (i.outcome === "missing" || (i.outcome === "correct_abstention" && i.status === undefined) ? NOT_REPORTED : DECLINED);
    const row = ((confusion[i.observationType] ??= {})[exp] ??= {});
    row[pred] = (row[pred] ?? 0) + 1;
  }

  const points: CalibrationPoint[] = items
    .filter(({ i }) => i.predicted !== undefined && i.confidence !== undefined)
    .map(({ i }) => ({ confidence: i.confidence!, correct: i.outcome === "correct" }));
  const answered = points.length;
  const determinable = count((i) => i.expected !== null);
  const undeterminable = count((i) => i.expected === null);
  const hallucinations = count((i) => i.outcome === "hallucinated");

  return {
    cases: results.length,
    casesFailed: results.filter((r) => r.error).length,
    items: items.length,
    accuracy: items.length ? count(good) / items.length : 0,
    answered,
    answeredAccuracy: ratio(count((i) => i.outcome === "correct"), answered),
    coverage: ratio(count((i) => i.expected !== null && i.predicted !== undefined), determinable),
    hallucinations,
    hallucinationRate: ratio(hallucinations, undeterminable),
    byType,
    byTag,
    confusion,
    calibration: {
      points: answered,
      ece: expectedCalibrationError(points, TEN_BINS),
      meanConfidence: ratio(points.reduce((s, p) => s + p.confidence, 0), answered),
      accuracy: ratio(points.filter((p) => p.correct).length, answered),
      bins: calibrationBins(points, TEN_BINS),
    },
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export type Frame = { mime: string; data: Uint8Array };

export interface RunOptions {
  provider: ReasoningProvider;
  /** Plain-English provider name shown on the evaluation page. */
  providerLabel: string;
  workflow: WorkflowDefinition;
  startedBy: { id: string; name: string };
  id?: string;
  now?: () => Date;
  /** Bytes for an uploaded/captured frame reference. Synthetic scenes are rendered locally. */
  loadFrame?: (sessionId: string, frameReference: string) => Frame | undefined;
  /** Convert a frame before it is sent, e.g. rasterise SVG for a model that only accepts bitmaps. */
  prepareFrame?: (frame: Frame) => Promise<Frame>;
  /** Cases evaluated at once (a real model benefits from a few in parallel). */
  concurrency?: number;
}

export function syntheticFrame(ref: string): Frame | undefined {
  const scene = parseSyntheticRef(ref);
  return scene ? { mime: "image/svg+xml", data: new TextEncoder().encode(renderRouterSvg(scene)) } : undefined;
}

function evaluationState(workflow: WorkflowDefinition, id: string, now: string): SessionState {
  const policy = getPolicy(workflow.policyId);
  const agent = agents.find((a) => a.workflowIds.includes(workflow.id)) ?? agents.find((a) => a.tenantId === workflow.tenantId);
  if (!policy || !agent) throw new Error(`Workflow ${workflow.id} has no policy or agent configured`);
  let n = 0;
  return createSession(
    { id, reference: "EVAL", tenantId: workflow.tenantId, channel: "website", customerLabel: "Evaluation" },
    { now: () => now, id: (p) => `${p}_eval_${(n += 1)}`, workflow, policy, agent },
  );
}

async function runCase(c: EvalCase, opts: RunOptions, index: number): Promise<CaseResult> {
  const now = (opts.now ?? (() => new Date()))();
  const started = now.getTime();
  const base = { caseId: c.id, title: c.title, tags: c.tags };
  // A case the provider could not run is reported as failed and left out of the scores.
  const fail = (error: string): CaseResult => ({ ...base, error, latencyMs: 0, items: [] });
  try {
    // Frames an agent asked for ("human_request") have no workflow step; providers then read every vocabulary type, as in a live session.
    const step = opts.workflow.steps.find((s) => s.evidence?.checkpoint === c.checkpoint);
    const reference = c.image.kind === "synthetic" ? c.image.ref : c.image.frameReference;
    let frame = c.image.kind === "synthetic" ? syntheticFrame(c.image.ref) : opts.loadFrame?.(c.image.sessionId, c.image.frameReference);
    if (!frame) return fail("The frame for this case is no longer available (it may have been deleted under the retention policy).");
    if (opts.prepareFrame) frame = await opts.prepareFrame(frame);
    const sessionId = `eval_${index}`;
    const state = evaluationState(opts.workflow, sessionId, now.toISOString());
    const visualEvent: VisualEvent = {
      id: `ve_eval_${index}`,
      sessionId,
      triggerType: "workflow_checkpoint",
      timestamp: now.toISOString(),
      frameReference: reference,
      checkpoint: c.checkpoint,
      stepKey: step?.key,
      width: 640,
      height: 480,
      bytes: frame.data.byteLength,
      processingStatus: "analysing",
    };
    const out = await opts.provider.interpretEvidence({ state, visualEvent, workflow: opts.workflow, step, frame });
    const byType = new Map<string, ObservationInput>();
    // If a type is reported twice, keep the reading the provider was most sure of.
    for (const o of out.observations) if (!byType.has(o.observationType) || byType.get(o.observationType)!.confidence < o.confidence) byType.set(o.observationType, o);
    const items = Object.entries(c.expected).map(([t, e]) => scoreItem(t, e, byType.get(t)));
    const elapsed = (opts.now ?? (() => new Date()))().getTime() - started;
    return { ...base, items, latencyMs: out.latencyMs || Math.max(0, elapsed) };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

export async function runEvaluation(set: EvaluationSet, opts: RunOptions): Promise<EvaluationRun> {
  const clock = opts.now ?? (() => new Date());
  const startedAt = clock().toISOString();
  const results: CaseResult[] = new Array(set.cases.length);
  const width = Math.max(1, Math.min(opts.concurrency ?? 1, set.cases.length || 1));
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < set.cases.length) {
        const i = next++;
        results[i] = await runCase(set.cases[i], opts, i);
      }
    }),
  );
  const provider = opts.provider as ReasoningProvider & { modelVersion?: string };
  return {
    id: opts.id ?? `evr_${globalThis.crypto.randomUUID().slice(0, 12)}`,
    setId: set.id,
    setName: set.name,
    setVersion: set.version,
    provider: { id: provider.id, label: opts.providerLabel, model: provider.modelVersion, simulated: provider.simulated },
    startedAt,
    finishedAt: clock().toISOString(),
    startedBy: opts.startedBy,
    results,
    metrics: computeMetrics(results),
  };
}

// ---------------------------------------------------------------------------
// Cases from completed reviews
// ---------------------------------------------------------------------------

/**
 * Turn a completed review into labelled cases: one per evidence frame, with
 * the reviewer's verdicts as ground truth (the AI's value where marked
 * correct, the corrected value where not). Frames purged under retention are
 * skipped.
 */
export function casesFromReview(review: QaReview, state: SessionState, addedBy: string, now: ISODateString): EvalCase[] {
  if (review.status !== "completed") return [];
  const cases: EvalCase[] = [];
  for (const ve of state.visualEvents) {
    if (!ve.checkpoint || ve.purgedAt || ve.frameReference === "purged") continue;
    const expected: Record<string, string | null> = {};
    for (const v of review.verdicts.filter((x) => x.visualEventId === ve.id)) {
      if (v.verdict === "correct") expected[v.observationType] = v.aiValue && COMMITTED.includes(v.aiStatus) ? v.aiValue : null;
      else expected[v.observationType] = v.correctedValue ?? null;
    }
    if (Object.keys(expected).length === 0) continue;
    const image: EvalImage = ve.frameReference.startsWith("synthetic:")
      ? { kind: "synthetic", ref: ve.frameReference }
      : { kind: "frame", sessionId: state.session.id, frameReference: ve.frameReference, visualEventId: ve.id };
    cases.push({
      id: `rev_${review.id}_${ve.id}`,
      title: `${review.reference} · ${ve.checkpoint}`,
      tags: ["reviewed_session"],
      image,
      checkpoint: ve.checkpoint,
      expected,
      source: { reviewId: review.id, sessionId: state.session.id, reference: review.reference, addedAt: now, addedBy },
    });
  }
  return cases;
}

export const REVIEWED_SET_ID = "reviewed-sessions";

export function reviewedSessionsSet(cases: EvalCase[], workflowId = "wf_router_v3"): EvaluationSet {
  return {
    id: REVIEWED_SET_ID,
    name: "Reviewed session frames",
    description: "Evidence frames from completed QA reviews, labelled with the reviewer's verdicts.",
    workflowId,
    version: cases.length,
    cases,
  };
}
