import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { QaStore } from "@/lib/qa/store";
import type { EvalCase, EvaluationRun } from "@/lib/qa/evaluation";
import type { QaReview } from "@/lib/qa/reviews";
import { log } from "@/lib/server/log";
import type { PgDatabase } from "./pg/db";
import { LatestWriter } from "./pg/writer";

/**
 * Durable QA records: review records, evaluation runs and cases added from
 * reviews, in <DATA_DIR>/qa.json (file store) or the single row of
 * visual_assist.qa (Postgres store). Same pattern as the configuration
 * store: load on attach, then save on every change.
 */

const FORMAT_VERSION = 1;

interface QaFile {
  version: number;
  savedAt: string;
  reviews: QaReview[];
  runs: EvaluationRun[];
  reviewedCases: EvalCase[];
}

function applyQa(store: QaStore, saved: QaFile | undefined): boolean {
  if (!saved || saved.version !== FORMAT_VERSION || !Array.isArray(saved.reviews) || !Array.isArray(saved.runs)) return false;
  // Replace in place: readers hold references to these arrays.
  store.reviews.splice(0, store.reviews.length, ...saved.reviews);
  store.runs.splice(0, store.runs.length, ...saved.runs);
  store.reviewedCases.splice(0, store.reviewedCases.length, ...(saved.reviewedCases ?? []));
  return true;
}

function currentQa(store: QaStore): QaFile {
  return { version: FORMAT_VERSION, savedAt: new Date().toISOString(), reviews: store.reviews, runs: store.runs, reviewedCases: store.reviewedCases };
}

export function attachQaStore(dir: string, store: QaStore): { restored: boolean } {
  const file = path.join(path.resolve(dir), "qa.json");
  let restored = false;

  try {
    restored = applyQa(store, JSON.parse(fs.readFileSync(file, "utf8")) as QaFile);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error(JSON.stringify({ level: "error", msg: "qa.load_failed", error: String(e) }));
  }

  store.onChange = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(currentQa(store)));
    fs.renameSync(tmp, file);
  };
  return { restored };
}

/** Postgres variant (DATABASE_URL). Writes run in the background, the newest wins, and shutdown waits for them. */
export async function attachPostgresQaStore(db: PgDatabase, store: QaStore): Promise<{ restored: boolean }> {
  const { rows } = await db.query<{ body: QaFile | string }>("select body from visual_assist.qa where id = 1");
  const body = rows[0]?.body;
  const restored = applyQa(store, typeof body === "string" ? (JSON.parse(body) as QaFile) : body);
  const writer = new LatestWriter(
    (json) =>
      db.query(
        "insert into visual_assist.qa (id, body, updated_at) values (1, $1::jsonb, now()) on conflict (id) do update set body = excluded.body, updated_at = now()",
        [json],
      ),
    (err) => log.error("qa.save_failed", { store: "postgres", error: (err as Error).message }),
  );
  store.onChange = () => void db.track(writer.push(() => JSON.stringify(currentQa(store))));
  return { restored };
}
