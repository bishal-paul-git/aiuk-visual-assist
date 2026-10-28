// Real-photo evaluation of the router checkpoints. See eval/router-photos/README.md.
//
//   npm run eval:photos -- --dir eval/router-photos [--checkpoint router_lights]
//                          [--model claude-opus-5-5] [--effort low] [--limit 10]
//                          [--concurrency 3] [--out reports/run-1] [--dry-run]
//
// Each photo listed in <dir>/labels.csv is resized the way the app resizes a
// camera frame (longest side 960 px, JPEG, under 650 kB), sent to the real
// ClaudeReasoningProvider at its checkpoint, and scored against the label.
// Writes <out>.md and <out>.csv. --dry-run checks the folder and labels only
// and needs no API key.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { getWorkflow } from "@/lib/config/catalog";
import type { EvidenceInterpretation, ReasoningProvider } from "@/lib/providers/types";
import { ClaudeReasoningProvider, DEFAULT_MODEL } from "@/lib/providers/claude/reasoning";
import type { Frame } from "@/lib/qa/evaluation";
import { runPhotoEvaluation, type PhotoCaseResult } from "@/lib/qa/photo-eval";
import { CANNOT_TELL, isImageFile, labelColumns, parseLabels, photoCheckpoints, type LabelIssue, type PhotoLabel } from "@/lib/qa/photo-labels";
import { renderCsv, renderMarkdown, summaryLines } from "@/lib/qa/photo-report";

/** Same limits as lib/client/frame-capture.ts `captureFrame`. */
const MAX_DIM = 960;
const START_QUALITY = 72;
const MAX_BYTES = 650_000;
/** Anthropic's per-image limit, for the no-sharp fallback. */
const API_IMAGE_LIMIT = 5 * 1024 * 1024;
const EFFORTS = ["low", "medium", "high"] as const;
type Effort = (typeof EFFORTS)[number];

const HELP = `Evaluate Claude on real router photos.

Usage: npm run eval:photos -- --dir <folder> [options]

  --dir <folder>          Folder with the photos and labels.csv (required)
  --checkpoint <name>     Only photos labelled with this checkpoint, e.g. router_lights
  --model <id>            Model to test (default: VISUAL_ASSIST_MODEL or ${DEFAULT_MODEL})
  --effort <low|medium|high>  Reasoning effort (default: low, as in live sessions)
  --limit <N>             Only the first N photos
  --concurrency <N>       Photos analysed at once (default 3)
  --out <path>            Report path without extension (default <dir>/reports/photo-eval-<time>)
  --workflow <id>         Workflow to evaluate against (default wf_router_v3)
  --remote <url>          Read each photo with a deployed server's live AI (its model, prompt and
                          settings) instead of calling Claude here. Signs in as the QA reviewer;
                          set STAFF_PASSWORD if the server asks for one. No API key needed here.
  --dry-run               Check the folder and labels only; no API key needed
  --print-header          Print the labels.csv header row for the workflow and exit
  -h, --help              Show this help
`;

type SharpFn = typeof import("sharp");

async function loadSharp(): Promise<SharpFn | undefined> {
  try {
    return (await import("sharp")).default;
  } catch {
    return undefined;
  }
}

/** Resize and re-encode a photo the way the browser prepares a camera frame. */
async function preparePhoto(bytes: Buffer, file: string, sharp: SharpFn | undefined): Promise<Frame & { width?: number; height?: number }> {
  if (!sharp) {
    if (bytes.byteLength > API_IMAGE_LIMIT) throw new Error(`${file} is larger than 5 MB and the image library (sharp) is not installed to shrink it.`);
    return { mime: file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg", data: new Uint8Array(bytes) };
  }
  let quality = START_QUALITY;
  // rotate() applies the phone's EXIF orientation, so the model sees the photo upright as the camera preview did.
  const encode = (q: number) =>
    sharp(bytes)
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: q })
      .toBuffer({ resolveWithObject: true });
  let out = await encode(quality);
  while (out.data.byteLength > MAX_BYTES && quality > 35) {
    quality -= 12;
    out = await encode(quality);
  }
  return { mime: "image/jpeg", data: new Uint8Array(out.data), width: out.info.width, height: out.info.height };
}

function printIssues(issues: LabelIssue[]) {
  for (const i of issues) {
    const where = [i.line ? `line ${i.line}` : "", i.file ?? ""].filter(Boolean).join(", ");
    console.error(`  ${i.severity === "error" ? "ERROR  " : "warning"} ${where ? `${where}: ` : ""}${i.message}`);
  }
}

function countBy<T>(items: T[], key: (t: T) => string | string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) for (const k of [key(it)].flat()) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function loadEnvFiles() {
  for (const f of [".env.local", ".env"]) {
    try {
      if (existsSync(f)) process.loadEnvFile(f);
    } catch {
      // A malformed env file is not fatal here; the key check below reports what is missing.
    }
  }
}

function progressLine(r: PhotoCaseResult, done: number, total: number): string {
  const head = `[${String(done).padStart(String(total).length)}/${total}] ${r.file} @ ${r.checkpoint}`;
  if (r.error) return `${head}  FAILED: ${r.error}`;
  const right = r.items.filter((i) => i.outcome === "correct" || i.outcome === "correct_abstention").length;
  const flag = r.acceptedWrong.length ? "  ⚠ carried on with a wrong reading" : "";
  return `${head}  ${right}/${r.items.length} items right · ${r.predictedAction} (label ${r.expectedAction}) · ${(r.latencyMs / 1000).toFixed(1)}s${flag}`;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      checkpoint: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      limit: { type: "string" },
      concurrency: { type: "string" },
      out: { type: "string" },
      workflow: { type: "string" },
      remote: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "print-header": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const workflow = getWorkflow(values.workflow ?? "wf_router_v3");
  if (!workflow) {
    console.error(`Unknown workflow "${values.workflow}".`);
    return 2;
  }
  if (values["print-header"]) {
    console.log(labelColumns(workflow).join(","));
    return 0;
  }
  if (!values.dir) {
    console.error("Missing --dir <folder>.\n");
    console.error(HELP);
    return 2;
  }
  const effort = (values.effort ?? "low") as Effort;
  if (!EFFORTS.includes(effort)) {
    console.error(`--effort must be one of ${EFFORTS.join(", ")}.`);
    return 2;
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  const concurrency = values.concurrency === undefined ? 3 : Number(values.concurrency);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
    console.error("--limit must be a whole number above 0.");
    return 2;
  }
  if (!(Number.isInteger(concurrency) && concurrency > 0 && concurrency <= 10)) {
    console.error("--concurrency must be a whole number from 1 to 10.");
    return 2;
  }
  const checkpoints = photoCheckpoints(workflow);
  if (values.checkpoint && !checkpoints.some((c) => c.checkpoint === values.checkpoint)) {
    console.error(`Unknown checkpoint "${values.checkpoint}". Use one of: ${checkpoints.map((c) => c.checkpoint).join(", ")}.`);
    return 2;
  }

  const dir = path.resolve(values.dir);
  const labelsPath = path.join(dir, "labels.csv");
  if (!existsSync(labelsPath)) {
    console.error(`No labels.csv in ${dir}. Copy eval/router-photos/labels.csv as a starting point.`);
    return 2;
  }
  const files = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile() && isImageFile(e.name)).map((e) => e.name);
  const { labels, issues } = parseLabels(await readFile(labelsPath, "utf8"), workflow, files);
  const errors = issues.filter((i) => i.severity === "error");

  console.error(`Workflow: ${workflow.name} v${workflow.version}`);
  console.error(`Folder:   ${dir}`);
  console.error(
    `Photos:   ${files.length} image file(s); ${labels.length} valid labelled row(s); ${labels.filter((l) => l.found === false).length} labelled but not in the folder`,
  );
  if (issues.length) {
    console.error(`\nLabel check: ${errors.length} error(s), ${issues.length - errors.length} warning(s)`);
    printIssues(issues);
  } else console.error("\nLabel check: no problems found.");

  let selected = labels.filter((l) => !values.checkpoint || l.checkpoint === values.checkpoint);
  const skippedMissing = selected.filter((l) => l.found === false).length;
  selected = selected.filter((l) => l.found !== false);
  if (limit !== undefined) selected = selected.slice(0, limit);

  const sharp = await loadSharp();
  const resize = sharp
    ? `resized to fit ${MAX_DIM}×${MAX_DIM} px, JPEG (as the app's camera capture)`
    : "sent as-is (sharp not installed, so photos are not resized like the app does)";

  if (values["dry-run"]) {
    if (labels.length) {
      console.error("\nLabelled rows by checkpoint:");
      for (const [k, n] of countBy(labels, (l) => l.checkpoint)) console.error(`  ${k.padEnd(24)} ${n}`);
      console.error("By expected action:");
      for (const [k, n] of countBy(labels, (l) => l.expectedAction)) console.error(`  ${k.padEnd(24)} ${n}`);
      const scen = countBy(labels, (l) => (l.scenarios.length ? l.scenarios : ["(none)"]));
      console.error("By scenario:");
      for (const [k, n] of scen) console.error(`  ${k.padEnd(24)} ${n}`);
      const unreadable = labels.filter((l) => Object.values(l.expected).some((v) => v === null)).length;
      console.error(`Rows with at least one ${CANNOT_TELL}: ${unreadable}`);
    }
    let bad = 0;
    if (sharp && selected.length) {
      for (const l of selected) {
        try {
          await sharp(await readFile(path.join(dir, l.file))).metadata();
        } catch (e) {
          bad += 1;
          console.error(`  ERROR   ${l.file}: cannot be opened as an image (${e instanceof Error ? e.message : String(e)})`);
        }
      }
      console.error(`\nImages: ${selected.length - bad} of ${selected.length} selected photo(s) open correctly.`);
    }
    console.error(`\nImage preparation: ${resize}.`);
    const failed = errors.length > 0 || bad > 0;
    console.error(
      failed
        ? "\nDry run FAILED: fix the errors above."
        : selected.length
          ? `\nDry run OK: ${selected.length} photo(s) would be sent to the model.`
          : "\nDry run OK: the labels are valid, but none of the labelled photos are in the folder yet, so nothing would be sent.",
    );
    return failed ? 1 : 0;
  }

  if (errors.length) {
    console.error("\nFix the label errors above (or run with --dry-run to check) before running the evaluation.");
    return 1;
  }
  if (selected.length === 0) {
    console.error("\nNo photos to evaluate: add photos to the folder and rows to labels.csv.");
    return 1;
  }
  loadEnvFiles();
  if (values.remote) {
    const provider = await remoteProvider(values.remote.replace(/\/+$/, ""));
    console.error(`\nSending ${selected.length} photo(s) to the live AI at ${values.remote} (${concurrency} at a time)…\n`);
    return finish(
      await runPhotoEvaluation(selected, {
        provider,
        workflow,
        concurrency,
        loadPhoto: async (l: PhotoLabel) => preparePhoto(await readFile(path.join(dir, l.file)), l.file, sharp),
        onResult: (r, done, total) => console.error(progressLine(r, done, total)),
      }),
    );
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("\nANTHROPIC_API_KEY is not set. Set it in your shell (or .env.local) and run again. Use --dry-run to check labels without a key.");
    return 2;
  }
  if (!sharp)
    console.error(
      "\nWarning: sharp is not installed, so photos are sent at full size instead of the app's 960 px frames. Results and cost may differ from live sessions.",
    );

  const model = values.model || process.env.VISUAL_ASSIST_MODEL || DEFAULT_MODEL;
  const provider = new ClaudeReasoningProvider(new Anthropic({ maxRetries: 3 }), { model, effort });
  console.error(`\nSending ${selected.length} photo(s) to ${model} (effort ${effort}, ${concurrency} at a time)…\n`);

  const run = await runPhotoEvaluation(selected, {
    provider,
    workflow,
    concurrency,
    loadPhoto: async (l: PhotoLabel) => preparePhoto(await readFile(path.join(dir, l.file)), l.file, sharp),
    onResult: (r, done, total) => console.error(progressLine(r, done, total)),
  });

  return finish(run);

  async function finish(run: Awaited<ReturnType<typeof runPhotoEvaluation>>): Promise<number> {
    const base = values.out ? path.resolve(values.out.replace(/\.(md|csv)$/i, "")) : path.join(dir, "reports", `photo-eval-${stamp(new Date())}`);
    await mkdir(path.dirname(base), { recursive: true });
    const ctx = { folder: dir, effort, checkpoint: values.checkpoint, skippedMissing, resize };
    await writeFile(`${base}.md`, renderMarkdown(run, ctx));
    await writeFile(`${base}.csv`, renderCsv(run));

    console.error("");
    for (const l of summaryLines(run, ctx)) console.error(`• ${l.replace(/\*\*|^_|_$/g, "")}`);
    console.error(`\nReport: ${base}.md\nDetail: ${base}.csv`);
    return run.metrics.failed === run.metrics.photos ? 1 : 0;
  }
}

/** A provider that asks a deployed server's live AI to read each photo (POST /api/qa/photo-check). */
async function remoteProvider(base: string): Promise<ReasoningProvider & { modelVersion?: string }> {
  const res = await fetch(`${base}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: base },
    body: JSON.stringify({ userId: "usr_nadia", password: process.env.STAFF_PASSWORD ?? "" }),
  });
  const cookie = res.headers.get("set-cookie")?.match(/va_session=[^;]+/)?.[0];
  if (!res.ok || !cookie) throw new Error(`Could not sign in to ${base} as the QA reviewer (HTTP ${res.status}).`);
  let model: string | undefined;
  return {
    id: "remote-live",
    simulated: false,
    get modelVersion() {
      return model;
    },
    async interpretUtterance() {
      throw new Error("Not used by the photo evaluation");
    },
    async interpretEvidence(input) {
      const started = Date.now();
      for (let attempt = 0; ; attempt++) {
        const r = await fetch(`${base}/api/qa/photo-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie, origin: base },
          body: JSON.stringify({
            workflowId: input.workflow.id,
            stepKey: input.step?.key,
            mime: input.frame!.mime,
            data: Buffer.from(input.frame!.data).toString("base64"),
          }),
        });
        const body = (await r.json().catch(() => ({}))) as EvidenceInterpretation & { error?: string };
        if (r.ok) {
          model = body.modelVersion;
          return { ...body, latencyMs: body.latencyMs ?? Date.now() - started };
        }
        if (attempt < 2 && (r.status === 502 || r.status === 503 || r.status === 429)) {
          await new Promise((ok) => setTimeout(ok, 3000 * (attempt + 1)));
          continue;
        }
        throw new Error(body.error ?? `Photo check failed (HTTP ${r.status})`);
      }
    },
  };
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exitCode = 1;
  },
);
