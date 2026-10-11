import type {
  EscalationReasonCode,
  EscalationSeverity,
  EvidenceRequirement,
  NextRule,
  SessionOutcome,
  StepAction,
  StepCondition,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepType,
} from "@/lib/domain/types";
import { ESCALATION_REASON_LABELS, OUTCOME_LABELS } from "@/lib/domain/labels";
import { WorkflowRegistryError } from "./errors";

/**
 * Structural workflow editing (docs/03 §4 builder): add, remove and reorder
 * steps, edit branching rules and type-specific step settings. Every function
 * validates its input and throws WorkflowRegistryError before changing
 * anything; semantic problems that only matter at publish time (vocabulary,
 * reachability, missing evidence) are left to validateWorkflow so a draft can
 * pass through incomplete states while it is being built.
 *
 * Pure: operates on the definition it is given. The registry applies these to
 * a copy of a draft, audits the change and re-runs publish checks.
 */

export const STEP_TYPES: WorkflowStepType[] = ["start", "question", "visual_request", "guidance", "business_action", "human_escalation", "completion"];
export const CONDITION_KINDS: StepCondition["kind"][] = ["always", "intent", "observation", "tool_result"];
export const EVIDENCE_VIEWS: EvidenceRequirement["view"][] = ["front", "close_up", "rear", "wide", "detail"];
export const ESCALATION_REASONS = Object.keys(ESCALATION_REASON_LABELS) as EscalationReasonCode[];
export const SESSION_OUTCOMES = Object.keys(OUTCOME_LABELS) as SessionOutcome[];
export const SEVERITIES: EscalationSeverity[] = ["low", "medium", "high", "critical"];

/** Intents the reasoning layer emits for every workflow; workflows may add their own. */
export const COMMON_INTENTS = ["affirm", "negate", "done", "cannot", "out_of_scope"];

const MAX_STEPS = 60;
const MAX_RULES = 12;
const KEY_RE = /^[a-z][a-z0-9_]{1,47}$/;
const TOKEN_RE = /^[a-z][a-z0-9_]{0,47}$/;
const FIELD_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export interface NewStepInput {
  key: string;
  type: WorkflowStepType;
  title: string;
  instruction?: string;
  customerPrompt?: string;
}

/** Type-specific settings. `null` clears an optional setting. */
export interface StepConfigPatch {
  title?: string;
  type?: WorkflowStepType;
  evidence?: EvidenceRequirement | null;
  onFailure?: { to: string; reason: EscalationReasonCode } | null;
  escalation?: NonNullable<WorkflowStep["escalation"]> | null;
  completion?: { outcome: SessionOutcome } | null;
  action?: StepAction | null;
  allowedGuidance?: string[] | null;
}

export type StructuralOp =
  | { kind: "add_step"; step: NewStepInput; after?: string }
  | { kind: "remove_step"; key: string; removeReferences?: boolean }
  | { kind: "move_step"; key: string; toIndex: number }
  | { kind: "set_rules"; key: string; rules: NextRule[] }
  | { kind: "update_step"; key: string; patch: StepConfigPatch };

/** Where a step is referenced from: a branching rule, a failure path or the start step. */
export interface StepReference {
  from: string;
  kind: "rule" | "failure" | "start";
  label: string;
}

export function referencesTo(def: WorkflowDefinition, key: string): StepReference[] {
  const refs: StepReference[] = [];
  if (def.startStep === key) refs.push({ from: "", kind: "start", label: "Start step" });
  for (const s of def.steps) {
    if (s.key === key) continue;
    for (const r of s.next) if (r.to === key) refs.push({ from: s.key, kind: "rule", label: `${s.title}: rule “${r.label}”` });
    if (s.onFailure?.to === key) refs.push({ from: s.key, kind: "failure", label: `${s.title}: failure path` });
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Operations (mutate `def`; validate first)
// ---------------------------------------------------------------------------

export function addStep(def: WorkflowDefinition, input: NewStepInput, after?: string): WorkflowStep {
  if (def.steps.length >= MAX_STEPS) throw new WorkflowRegistryError(`A workflow can have at most ${MAX_STEPS} steps`);
  const key = String(input.key ?? "").trim();
  if (!KEY_RE.test(key)) throw new WorkflowRegistryError("Step key must be 2–48 characters: lower-case letters, digits and underscores, starting with a letter");
  if (def.steps.some((s) => s.key === key)) throw new WorkflowRegistryError(`A step with key "${key}" already exists`);
  const type = stepType(input.type);
  const step: WorkflowStep = {
    key,
    type,
    title: text(input.title, 80, "Step title"),
    // Wording may start empty; publish checks block until it is written.
    instruction: text(input.instruction ?? "", 600, "AI instruction", true),
    customerPrompt: text(input.customerPrompt ?? "", 120, "Customer prompt", true),
    next: [],
    ...typeDefaults(type),
  };
  let index = def.steps.length;
  if (after !== undefined && after !== "") {
    const i = def.steps.findIndex((s) => s.key === after);
    if (i < 0) throw new WorkflowRegistryError(`Unknown step "${after}"`);
    index = i + 1;
  }
  def.steps.splice(index, 0, step);
  return step;
}

/**
 * Remove a step. Refuses while other steps still lead to it unless
 * `removeReferences` is set, in which case those rules and failure paths are
 * removed too (and reported). The start step can never be removed.
 */
export function removeStep(def: WorkflowDefinition, key: string, removeReferences = false): StepReference[] {
  const step = mustStep(def, key);
  const refs = referencesTo(def, key);
  if (refs.some((r) => r.kind === "start")) throw new WorkflowRegistryError(`${step.title} is the start step and cannot be removed`);
  if (refs.length && !removeReferences) {
    throw new WorkflowRegistryError(`${step.title} is still referenced by ${refs.map((r) => r.label).join("; ")}. Remove those references first, or remove them with the step.`);
  }
  for (const s of def.steps) {
    s.next = s.next.filter((r) => r.to !== key);
    if (s.onFailure?.to === key) delete s.onFailure;
  }
  def.steps.splice(def.steps.indexOf(step), 1);
  return refs;
}

/** Move a step to a new position. Order is presentation only; branching is by rule. */
export function moveStep(def: WorkflowDefinition, key: string, toIndex: number): { from: number; to: number } {
  const from = def.steps.findIndex((s) => s.key === key);
  if (from < 0) throw new WorkflowRegistryError(`Unknown step "${key}"`);
  if (!Number.isInteger(toIndex)) throw new WorkflowRegistryError("Position must be a whole number");
  const to = Math.max(0, Math.min(def.steps.length - 1, toIndex));
  if (to !== from) {
    const [step] = def.steps.splice(from, 1);
    def.steps.splice(to, 0, step);
  }
  return { from, to };
}

/** Replace a step's branching rules. Rule order is the evaluation priority. */
export function setRules(def: WorkflowDefinition, key: string, rules: NextRule[]): void {
  const step = mustStep(def, key);
  if (!Array.isArray(rules)) throw new WorkflowRegistryError("Rules must be a list");
  if (rules.length > MAX_RULES) throw new WorkflowRegistryError(`A step can have at most ${MAX_RULES} rules`);
  const keys = new Set(def.steps.map((s) => s.key));
  step.next = rules.map((r, i) => {
    const n = i + 1;
    if (!r || typeof r !== "object") throw new WorkflowRegistryError(`Rule ${n} is invalid`);
    const to = String(r.to ?? "");
    if (!keys.has(to)) throw new WorkflowRegistryError(`Rule ${n} targets unknown step "${to}"`);
    return { when: condition(r.when, n), to, label: text(r.label, 80, `Rule ${n} label`) };
  });
}

/** Change a step's title, type or type-specific settings. */
export function updateStep(def: WorkflowDefinition, key: string, patch: StepConfigPatch): string[] {
  const step = mustStep(def, key);
  const changed: string[] = [];
  const keys = new Set(def.steps.map((s) => s.key));

  if (patch.title !== undefined && patch.title !== step.title) {
    step.title = text(patch.title, 80, "Step title");
    changed.push("title");
  }
  if (patch.type !== undefined && patch.type !== step.type) {
    const type = stepType(patch.type);
    // Settings that only make sense for the old type are dropped so the
    // runtime never acts on, e.g., evidence attached to a question.
    for (const f of TYPE_FIELDS) if (!f.types.includes(type)) delete step[f.field];
    Object.assign(step, { ...typeDefaults(type), ...pickDefined(step, Object.keys(typeDefaults(type)) as (keyof WorkflowStep)[]) });
    step.type = type;
    changed.push("type");
  }
  const requireType = (field: string, types: WorkflowStepType[]) => {
    if (!types.includes(step.type)) throw new WorkflowRegistryError(`${field} only applies to ${types.map((t) => t.replace("_", " ")).join(" or ")} steps`);
  };

  if (patch.evidence !== undefined) {
    requireType("Evidence", ["visual_request"]);
    if (patch.evidence === null) delete step.evidence;
    else step.evidence = evidence(patch.evidence);
    changed.push("evidence");
  }
  if (patch.onFailure !== undefined) {
    if (patch.onFailure === null) delete step.onFailure;
    else {
      const to = String(patch.onFailure.to ?? "");
      if (!keys.has(to) || to === step.key) throw new WorkflowRegistryError(`Failure path must lead to another step`);
      step.onFailure = { to, reason: oneOf(patch.onFailure.reason, ESCALATION_REASONS, "Failure reason") };
    }
    changed.push("onFailure");
  }
  if (patch.escalation !== undefined) {
    requireType("Escalation", ["human_escalation"]);
    if (patch.escalation === null) delete step.escalation;
    else
      step.escalation = {
        reason: oneOf(patch.escalation.reason, ESCALATION_REASONS, "Escalation reason"),
        severity: oneOf(patch.escalation.severity, SEVERITIES, "Severity"),
        ...(patch.escalation.humanOnly ? { humanOnly: true } : {}),
      };
    changed.push("escalation");
  }
  if (patch.completion !== undefined) {
    requireType("Outcome", ["completion"]);
    if (patch.completion === null) delete step.completion;
    else step.completion = { outcome: oneOf(patch.completion.outcome, SESSION_OUTCOMES, "Outcome") };
    changed.push("completion");
  }
  if (patch.action !== undefined) {
    requireType("Action", ["business_action"]);
    if (patch.action === null) delete step.action;
    else step.action = action(patch.action);
    changed.push("action");
  }
  if (patch.allowedGuidance !== undefined) {
    requireType("Allowed guidance", ["guidance"]);
    if (patch.allowedGuidance === null || patch.allowedGuidance.length === 0) delete step.allowedGuidance;
    else step.allowedGuidance = list(patch.allowedGuidance, 10, (v) => text(v, 120, "Allowed guidance"));
    changed.push("allowedGuidance");
  }
  return changed;
}

/** Apply one operation; returns the audit payload describing it. */
export function applyOp(def: WorkflowDefinition, op: StructuralOp): Record<string, unknown> {
  switch (op.kind) {
    case "add_step": {
      const step = addStep(def, op.step, op.after);
      return { step: step.key, type: step.type, after: op.after ?? null };
    }
    case "remove_step": {
      const refs = removeStep(def, op.key, op.removeReferences);
      return { step: op.key, removedReferences: refs.map((r) => r.label) };
    }
    case "move_step":
      return { step: op.key, ...moveStep(def, op.key, op.toIndex) };
    case "set_rules":
      setRules(def, op.key, op.rules);
      return { step: op.key, rules: op.rules.length };
    case "update_step":
      return { step: op.key, fields: updateStep(def, op.key, op.patch) };
  }
}

// ---------------------------------------------------------------------------
// Request parsing (untrusted JSON -> typed op; shape only, values checked above)
// ---------------------------------------------------------------------------

export function parseStructuralOp(raw: unknown): StructuralOp | string {
  if (!raw || typeof raw !== "object") return "Invalid operation";
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key : "";
  switch (o.kind) {
    case "add_step": {
      const s = (o.step ?? {}) as Record<string, unknown>;
      return {
        kind: "add_step",
        step: { key: String(s.key ?? ""), type: String(s.type ?? "") as WorkflowStepType, title: String(s.title ?? ""), instruction: optStr(s.instruction), customerPrompt: optStr(s.customerPrompt) },
        after: optStr(o.after),
      };
    }
    case "remove_step":
      return { kind: "remove_step", key, removeReferences: o.removeReferences === true };
    case "move_step":
      return { kind: "move_step", key, toIndex: Number(o.toIndex) };
    case "set_rules":
      if (!Array.isArray(o.rules)) return "rules must be a list";
      return { kind: "set_rules", key, rules: o.rules as NextRule[] };
    case "update_step":
      if (!o.patch || typeof o.patch !== "object") return "patch is required";
      return { kind: "update_step", key, patch: o.patch as StepConfigPatch };
    default:
      return "Unknown operation";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Settings owned by particular step types. */
const TYPE_FIELDS: { field: "evidence" | "confidenceThreshold" | "maxAttempts" | "action" | "escalation" | "completion" | "allowedGuidance"; types: WorkflowStepType[] }[] = [
  { field: "evidence", types: ["visual_request"] },
  { field: "confidenceThreshold", types: ["visual_request"] },
  { field: "maxAttempts", types: ["visual_request"] },
  { field: "action", types: ["business_action"] },
  { field: "escalation", types: ["human_escalation"] },
  { field: "completion", types: ["completion"] },
  { field: "allowedGuidance", types: ["guidance"] },
];

/** Sensible starting settings for a new step of a type; anything still missing is flagged by publish checks. */
function typeDefaults(type: WorkflowStepType): Partial<WorkflowStep> {
  switch (type) {
    case "visual_request":
      return { maxAttempts: 3 };
    case "human_escalation":
      return { escalation: { reason: "unresolved_after_workflow", severity: "medium" } };
    case "completion":
      return { completion: { outcome: "resolved_by_ai" } };
    default:
      return {};
  }
}

function pickDefined(step: WorkflowStep, fields: (keyof WorkflowStep)[]): Partial<WorkflowStep> {
  return Object.fromEntries(fields.filter((f) => step[f] !== undefined).map((f) => [f, step[f]]));
}

function mustStep(def: WorkflowDefinition, key: string): WorkflowStep {
  const step = def.steps.find((s) => s.key === key);
  if (!step) throw new WorkflowRegistryError(`Unknown step "${key}"`);
  return step;
}

function stepType(v: unknown): WorkflowStepType {
  return oneOf(v, STEP_TYPES, "Step type");
}

function condition(raw: unknown, n: number): StepCondition {
  const c = (raw ?? {}) as Record<string, unknown>;
  switch (c.kind) {
    case "always":
      return { kind: "always" };
    case "intent":
      return { kind: "intent", intents: list(c.intents, 10, (v) => token(v, `Rule ${n} intent`), `Rule ${n} needs at least one intent`) };
    case "observation": {
      const observationType = token(c.observationType, `Rule ${n} observation type`);
      return { kind: "observation", observationType, values: list(c.values, 20, (v) => token(v, `Rule ${n} value`), `Rule ${n} needs at least one value`) };
    }
    case "tool_result": {
      const field = String(c.field ?? "").trim();
      if (!FIELD_RE.test(field) || field.length > 80) throw new WorkflowRegistryError(`Rule ${n} needs a tool result field such as line_test.status`);
      return { kind: "tool_result", field, values: list(c.values, 20, (v) => token(v, `Rule ${n} value`), `Rule ${n} needs at least one value`) };
    }
    default:
      throw new WorkflowRegistryError(`Rule ${n} has an unknown condition kind`);
  }
}

function evidence(raw: EvidenceRequirement): EvidenceRequirement {
  if (!raw || typeof raw !== "object") throw new WorkflowRegistryError("Evidence is invalid");
  return {
    checkpoint: token(raw.checkpoint, "Evidence checkpoint"),
    description: text(raw.description, 200, "Evidence description"),
    observationTypes: list(raw.observationTypes, 10, (v) => token(v, "Required observation"), "", true),
    view: oneOf(raw.view, EVIDENCE_VIEWS, "Camera view"),
  };
}

function action(raw: StepAction): StepAction {
  if (!raw || typeof raw !== "object") throw new WorkflowRegistryError("Action is invalid");
  const params: StepAction["params"] = {};
  const entries = Object.entries(raw.params ?? {});
  if (entries.length > 10) throw new WorkflowRegistryError("An action can have at most 10 parameters");
  for (const [k, v] of entries) {
    if (!TOKEN_RE.test(k)) throw new WorkflowRegistryError(`Parameter name "${k}" is invalid`);
    if (typeof v === "string") params[k] = text(v, 120, `Parameter ${k}`, true);
    else if (typeof v === "number" && Number.isFinite(v)) params[k] = v;
    else if (typeof v === "boolean") params[k] = v;
    else throw new WorkflowRegistryError(`Parameter ${k} must be text, a number or true/false`);
  }
  return { tool: token(raw.tool, "Action tool"), params };
}

function list<T>(raw: unknown, max: number, each: (v: unknown) => T, emptyMessage = "", allowEmpty = false): T[] {
  if (!Array.isArray(raw)) throw new WorkflowRegistryError(emptyMessage || "Expected a list");
  if (!allowEmpty && raw.length === 0) throw new WorkflowRegistryError(emptyMessage || "List cannot be empty");
  if (raw.length > max) throw new WorkflowRegistryError(`At most ${max} entries allowed`);
  return [...new Set(raw.map(each))];
}

function token(v: unknown, label: string): string {
  const t = String(v ?? "").trim();
  if (!TOKEN_RE.test(t)) throw new WorkflowRegistryError(`${label} must be lower-case letters, digits and underscores`);
  return t;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], label: string): T {
  if (!allowed.includes(v as T)) throw new WorkflowRegistryError(`${label} is not valid`);
  return v as T;
}

export function text(v: unknown, max: number, label: string, allowEmpty = false): string {
  const t = String(v ?? "").trim();
  if (!allowEmpty && !t) throw new WorkflowRegistryError(`${label} cannot be empty`);
  if (t.length > max) throw new WorkflowRegistryError(`${label} is longer than ${max} characters`);
  return t;
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
