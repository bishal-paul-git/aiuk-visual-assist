import type { EvalCase, EvaluationRun, EvaluationSet } from "./evaluation";
import { reviewedSessionsSet } from "./evaluation";
import type { QaReview } from "./reviews";
import { ROUTER_EVAL_SET } from "./router-eval-set";

/**
 * In-process QA records: review records, evaluation runs, and cases added to
 * the evaluation set from completed reviews. Process-wide singleton (survives
 * dev hot reloads). With DATA_DIR set, the server attaches file persistence
 * (lib/server/store/qa.ts), which saves on every change.
 */

export const MAX_RUNS = 50;

export class QaStore {
  readonly reviews: QaReview[] = [];
  readonly runs: EvaluationRun[] = [];
  readonly reviewedCases: EvalCase[] = [];
  /** Called after every change (used to persist). */
  onChange?: () => void;

  changed() {
    this.onChange?.();
  }

  addRun(run: EvaluationRun) {
    this.runs.unshift(run);
    if (this.runs.length > MAX_RUNS) this.runs.splice(MAX_RUNS);
    this.changed();
  }

  /** Add cases, replacing any with the same id. Returns how many were new. */
  addCases(cases: EvalCase[]): number {
    let added = 0;
    for (const c of cases) {
      const i = this.reviewedCases.findIndex((x) => x.id === c.id);
      if (i >= 0) this.reviewedCases[i] = c;
      else {
        this.reviewedCases.push(c);
        added += 1;
      }
    }
    if (cases.length) this.changed();
    return added;
  }

  evaluationSets(): EvaluationSet[] {
    return this.reviewedCases.length ? [ROUTER_EVAL_SET, reviewedSessionsSet(this.reviewedCases)] : [ROUTER_EVAL_SET];
  }
}

const g = globalThis as unknown as { __aiukQaStore?: QaStore };

export function getQaStore(): QaStore {
  return (g.__aiukQaStore ??= new QaStore());
}
