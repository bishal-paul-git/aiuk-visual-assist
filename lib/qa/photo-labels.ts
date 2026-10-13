import type { WorkflowDefinition, WorkflowStep } from "@/lib/domain/types";
import { SENSITIVE_TYPES } from "@/lib/providers/claude/reasoning";
import { parseCsv } from "./csv";

/**
 * Labels for the real-photo evaluation (eval/router-photos/README.md).
 *
 * One spreadsheet row per photo: which checkpoint the photo answers, what a
 * careful person can read from it for each item the checkpoint asks about, and
 * what the assistant should do next. Column names and allowed values come from
 * the workflow, so the sheet always matches what the model is asked.
 */

/** The label for an item a careful person cannot read from this photo; the right answer is to decline. */
export const CANNOT_TELL = "cannot_tell";

/**
 * What the assistant should do with the photo, in the terms `assessEvidence`
 * (lib/workflow/engine.ts) decides: carry on with the workflow, or ask for a
 * closer view or another angle. The provider's `recommended_next_action` uses
 * the same `request_*` names.
 */
export const PHOTO_ACTIONS = ["proceed", "request_closer_view", "request_another_angle"] as const;
export type PhotoAction = (typeof PHOTO_ACTIONS)[number];

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

export const LABEL_FIXED_COLUMNS = ["file", "checkpoint"] as const;
export const LABEL_TRAILING_COLUMNS = ["expected_action", "scenario", "sensitive_content", "notes"] as const;

export interface PhotoCheckpoint {
  checkpoint: string;
  stepKey: string;
  title: string;
  observationTypes: string[];
}

export interface PhotoLabel {
  /** 1-based line in labels.csv (the header is line 1). */
  line: number;
  file: string;
  checkpoint: string;
  stepKey: string;
  /** Expected value per item the checkpoint asks about; null = cannot tell from this photo. */
  expected: Record<string, string | null>;
  expectedAction: PhotoAction;
  /** Free-text scenario tags, e.g. glare, blurry, too_far. */
  scenarios: string[];
  /** Expected privacy flag, when the labeller filled it in. */
  sensitiveContent?: string;
  notes?: string;
  /** False when the folder was checked and the photo is not there (the row is skipped in a run). */
  found?: boolean;
}

export interface LabelIssue {
  severity: "error" | "warning";
  line?: number;
  file?: string;
  message: string;
}

export interface LabelValidation {
  labels: PhotoLabel[];
  issues: LabelIssue[];
  columns: string[];
}

/** Workflow checkpoints a photo can be labelled against (visual steps with required evidence). */
export function photoCheckpoints(workflow: WorkflowDefinition): PhotoCheckpoint[] {
  const out: PhotoCheckpoint[] = [];
  for (const s of workflow.steps as WorkflowStep[]) {
    const ev = s.evidence;
    if (!ev || ev.observationTypes.length === 0 || out.some((c) => c.checkpoint === ev.checkpoint)) continue;
    out.push({ checkpoint: ev.checkpoint, stepKey: s.key, title: s.title, observationTypes: [...ev.observationTypes] });
  }
  return out;
}

/** Item columns: the workflow's observation vocabulary, in definition order. */
export function observationColumns(workflow: WorkflowDefinition): string[] {
  const vocab = Object.keys(workflow.observationVocabulary ?? {});
  const used = photoCheckpoints(workflow).flatMap((c) => c.observationTypes);
  return [...new Set([...vocab, ...used])];
}

/** The full labels.csv header for a workflow. */
export function labelColumns(workflow: WorkflowDefinition): string[] {
  return [...LABEL_FIXED_COLUMNS, ...observationColumns(workflow), ...LABEL_TRAILING_COLUMNS];
}

/** Allowed values for one item, from the vocabulary or, failing that, the workflow's branch rules. */
export function allowedValues(workflow: WorkflowDefinition, type: string): string[] {
  const v = workflow.observationVocabulary?.[type]?.values;
  if (v) return v;
  const values = new Set<string>();
  for (const s of workflow.steps) for (const r of s.next) if (r.when.kind === "observation" && r.when.observationType === type) r.when.values.forEach((x) => values.add(x));
  return [...values];
}

/** Lower-case, trim, and treat spaces and hyphens as underscores ("Cannot tell" → "cannot_tell"). */
export function normaliseLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normaliseHeader(value: string): string {
  return normaliseLabel(value).replace(/[^a-z0-9_]/g, "");
}

function extensionOf(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot >= 0 ? file.slice(dot).toLowerCase() : "";
}

export function isImageFile(name: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/**
 * Parse and validate labels.csv against the workflow. `files` (the image file
 * names found in the folder) enables the missing/unlabelled photo checks.
 * Rows with errors are left out of `labels`; warnings keep the row.
 */
export function parseLabels(text: string, workflow: WorkflowDefinition, files?: string[]): LabelValidation {
  const issues: LabelIssue[] = [];
  const labels: PhotoLabel[] = [];
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { labels, columns: [], issues: [{ severity: "error", message: e instanceof Error ? e.message : String(e) }] };
  }
  const header = (rows[0] ?? []).map(normaliseHeader);
  if (header.length === 0 || header.every((h) => !h)) return { labels, columns: [], issues: [{ severity: "error", message: "labels.csv is empty. Copy the header row from the template." }] };

  const items = observationColumns(workflow);
  const known = new Set([...LABEL_FIXED_COLUMNS, ...items, ...LABEL_TRAILING_COLUMNS]);
  for (const required of ["file", "checkpoint", "expected_action"]) {
    if (!header.includes(required)) issues.push({ severity: "error", line: 1, message: `Missing column "${required}". The header must be: ${labelColumns(workflow).join(",")}` });
  }
  header.forEach((h, i) => {
    if (h && !known.has(h)) issues.push({ severity: "warning", line: 1, message: `Column "${rows[0][i]}" is not used and will be ignored.` });
    if (h && header.indexOf(h) !== i) issues.push({ severity: "error", line: 1, message: `Column "${rows[0][i]}" appears more than once.` });
  });
  if (issues.some((i) => i.severity === "error")) return { labels, columns: header, issues };

  const checkpoints = photoCheckpoints(workflow);
  const imageNames = files ? new Map(files.map((f) => [f.toLowerCase(), f])) : undefined;
  const seen = new Map<string, number>();

  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const cells = rows[r];
    if (cells.every((c) => !c.trim())) continue;
    const get = (col: string) => {
      const i = header.indexOf(col);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const file = get("file");
    const rowIssues: LabelIssue[] = [];
    const err = (message: string) => rowIssues.push({ severity: "error", line, file: file || undefined, message });
    const warn = (message: string) => rowIssues.push({ severity: "warning", line, file: file || undefined, message });

    if (cells.length > header.length && cells.slice(header.length).some((c) => c.trim())) warn("This row has more cells than the header; the extra cells are ignored.");

    if (!file) err("The file name is empty.");
    else if (/[\\/]/.test(file) || file.startsWith(".")) err(`"${file}" must be a plain file name in the photo folder, without folders or a leading dot.`);
    else if (!isImageFile(file)) err(`"${file}" is not a JPEG or PNG file. Export the photo as .jpg or .png.`);
    else if (imageNames && !imageNames.has(file.toLowerCase())) warn(`Photo "${file}" is not in the folder yet; this row is skipped until it is added.`);
    else if (imageNames && imageNames.get(file.toLowerCase()) !== file) warn(`The file is called "${imageNames.get(file.toLowerCase())}" (different capital letters); that file will be used.`);

    const checkpointRaw = normaliseLabel(get("checkpoint"));
    const cp = checkpoints.find((c) => c.checkpoint === checkpointRaw);
    if (!checkpointRaw) err("The checkpoint is empty.");
    else if (!cp) err(`Unknown checkpoint "${get("checkpoint")}". Use one of: ${checkpoints.map((c) => c.checkpoint).join(", ")}.`);

    const expected: Record<string, string | null> = {};
    if (cp) {
      for (const type of items) {
        const raw = get(type);
        const value = normaliseLabel(raw);
        const asked = cp.observationTypes.includes(type);
        if (!asked) {
          if (value) warn(`${type} is not asked at ${cp.checkpoint}; "${raw}" is ignored.`);
          continue;
        }
        if (!header.includes(type)) {
          err(`Column "${type}" is needed for checkpoint ${cp.checkpoint}.`);
          continue;
        }
        const allowed = allowedValues(workflow, type);
        if (!value) err(`${type} is empty. Use one of: ${[...allowed, CANNOT_TELL].join(", ")}.`);
        else if (value === CANNOT_TELL) expected[type] = null;
        else if (allowed.includes(value)) expected[type] = value;
        else err(`${type} "${raw}" is not allowed. Use one of: ${[...allowed, CANNOT_TELL].join(", ")}.`);
      }
    }

    const actionRaw = get("expected_action");
    const action = normaliseLabel(actionRaw) as PhotoAction;
    if (!actionRaw) err(`expected_action is empty. Use one of: ${PHOTO_ACTIONS.join(", ")}.`);
    else if (!PHOTO_ACTIONS.includes(action)) err(`expected_action "${actionRaw}" is not allowed. Use one of: ${PHOTO_ACTIONS.join(", ")}.`);

    const sensitiveRaw = get("sensitive_content");
    const sensitive = sensitiveRaw ? normaliseLabel(sensitiveRaw) : undefined;
    if (sensitive && !(SENSITIVE_TYPES as readonly string[]).includes(sensitive)) err(`sensitive_content "${sensitiveRaw}" is not allowed. Use one of: ${SENSITIVE_TYPES.join(", ")}, or leave it empty.`);

    if (cp && PHOTO_ACTIONS.includes(action) && Object.keys(expected).length === cp.observationTypes.length) {
      const unreadable = Object.values(expected).some((v) => v === null);
      if (action === "proceed" && unreadable) warn(`expected_action is "proceed" but an item is ${CANNOT_TELL}; the app would ask for another photo when it cannot read an item.`);
      if (action !== "proceed" && !unreadable) warn(`expected_action is "${action}" but every item has a value; check whether each item can really be read from this photo.`);
    }

    if (file && cp) {
      const key = `${file.toLowerCase()}|${cp.checkpoint}`;
      if (seen.has(key)) err(`"${file}" is already labelled for ${cp.checkpoint} on line ${seen.get(key)}.`);
      else seen.set(key, line);
    }

    issues.push(...rowIssues);
    if (rowIssues.some((i) => i.severity === "error") || !cp) continue;
    const scenarios = get("scenario")
      .split(/[;,|]/)
      .map(normaliseLabel)
      .filter(Boolean);
    labels.push({
      line,
      file: imageNames?.get(file.toLowerCase()) ?? file,
      checkpoint: cp.checkpoint,
      stepKey: cp.stepKey,
      expected,
      expectedAction: action,
      scenarios,
      ...(sensitive ? { sensitiveContent: sensitive } : {}),
      ...(get("notes") ? { notes: get("notes") } : {}),
      ...(imageNames ? { found: imageNames.has(file.toLowerCase()) } : {}),
    });
  }

  if (imageNames) {
    const labelled = new Set(rows.slice(1).map((c) => (c[header.indexOf("file")] ?? "").trim().toLowerCase()));
    for (const [lower, name] of imageNames) if (!labelled.has(lower)) issues.push({ severity: "warning", file: name, message: `Photo "${name}" has no row in labels.csv and will be skipped.` });
  }
  if (labels.length === 0 && !issues.some((i) => i.severity === "error")) issues.push({ severity: "error", message: "labels.csv has no labelled photos yet." });
  return { labels, issues, columns: header };
}

