import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { QaStore } from "@/lib/qa/store";
import type { EvalCase, EvaluationRun } from "@/lib/qa/evaluation";
import type { QaReview } from "@/lib/qa/reviews";

/**
 * Durable QA records for the file store: review records, evaluation runs and
 * cases added from reviews, in <DATA_DIR>/qa.json. Same pattern as the
 * configuration store: load on attach, then write atomically on every change.
 */

const FORMAT_VERSION = 1;

interface QaFile {
  version: number;
  savedAt: string;
  reviews: QaReview[];
  runs: EvaluationRun[];
  reviewedCases: EvalCase[];
}

export function attachQaStore(dir: string, store: QaStore): { restored: boolean } {
  const file = path.join(path.resolve(dir), "qa.json");
  let restored = false;

  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as QaFile;
    if (saved.version === FORMAT_VERSION && Array.isArray(saved.reviews) && Array.isArray(saved.runs)) {
      // Replace in place: readers hold references to these arrays.
      store.reviews.splice(0, store.reviews.length, ...saved.reviews);
      store.runs.splice(0, store.runs.length, ...saved.runs);
      store.reviewedCases.splice(0, store.reviewedCases.length, ...(saved.reviewedCases ?? []));
      restored = true;
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error(JSON.stringify({ level: "error", msg: "qa.load_failed", error: String(e) }));
  }

  store.onChange = () => {
    const body: QaFile = { version: FORMAT_VERSION, savedAt: new Date().toISOString(), reviews: store.reviews, runs: store.runs, reviewedCases: store.reviewedCases };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(body));
    fs.renameSync(tmp, file);
  };
  return { restored };
}
