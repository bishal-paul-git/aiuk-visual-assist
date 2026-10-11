"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Info, Plus, Save, Trash2, X } from "lucide-react";
import type { EscalationReasonCode, EvidenceRequirement, NextRule, SessionOutcome, StepCondition, WorkflowDefinition, WorkflowStep, WorkflowStepType } from "@/lib/domain/types";
import type { ValidationIssue } from "@/lib/workflow/engine";
import {
  COMMON_INTENTS,
  CONDITION_KINDS,
  ESCALATION_REASONS,
  EVIDENCE_VIEWS,
  SESSION_OUTCOMES,
  SEVERITIES,
  STEP_TYPES,
  referencesTo,
  type StepConfigPatch,
  type StructuralOp,
} from "@/lib/workflow/structure";
import { ESCALATION_REASON_LABELS, OUTCOME_LABELS, humanize } from "@/lib/domain/labels";
import { Badge, buttonClass, cx } from "@/components/ui/primitives";

/**
 * Structural section of the workflow editor: add, remove and reorder steps,
 * edit branching rules and type-specific settings. Each change is sent to the
 * server as one operation (audited, publish checks re-run); the page then
 * refreshes with the updated draft.
 */

export const STEP_TYPE_LABEL: Record<WorkflowStepType, string> = {
  start: "Start",
  question: "Question",
  visual_request: "Visual request",
  guidance: "Guidance",
  business_action: "Business action",
  human_escalation: "Human escalation",
  completion: "Completion",
};

const CONDITION_LABEL: Record<StepCondition["kind"], string> = {
  always: "Always (fallback)",
  intent: "Customer intent",
  observation: "Visual observation",
  tool_result: "Tool result",
};

const VIEW_LABEL: Record<EvidenceRequirement["view"], string> = { front: "Front", close_up: "Close-up", rear: "Rear", wide: "Wide", detail: "Detail" };

/** Sends one operation; resolves to an error message, or undefined on success. */
export type RunOp = (op: StructuralOp) => Promise<string | undefined>;

export function WorkflowStructureEditor({
  workflow,
  issues,
  readOnly,
  tools,
  onOp,
}: {
  workflow: WorkflowDefinition;
  issues: ValidationIssue[];
  readOnly: boolean;
  /** Tool names in the linked policy, offered for business actions. */
  tools: string[];
  onOp: RunOp;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<{ key: string; text: string }>();
  const toggle = (key: string) => setOpen((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));

  const vocab = useMemo(() => workflow.observationVocabulary ?? {}, [workflow.observationVocabulary]);
  const intents = useMemo(
    () => [...new Set([...COMMON_INTENTS, ...workflow.steps.flatMap((s) => s.next.flatMap((r) => (r.when.kind === "intent" ? r.when.intents : [])))])],
    [workflow.steps],
  );
  const toolFields = useMemo(
    () => [
      ...new Set([
        ...workflow.steps.flatMap((s) => s.next.flatMap((r) => (r.when.kind === "tool_result" ? [r.when.field] : []))),
        ...workflow.steps.flatMap((s) => (s.action ? [`${s.action.tool}.status`] : [])),
      ]),
    ],
    [workflow.steps],
  );

  const run = async (key: string, op: StructuralOp) => {
    setError(undefined);
    const err = await onOp(op);
    if (err) setError({ key, text: err });
    return !err;
  };

  return (
    <div className="space-y-3">
      <datalist id="wf-intents">
        {intents.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="wf-tool-fields">
        {toolFields.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <datalist id="wf-tools">
        {tools.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <ol className="space-y-2">
        {workflow.steps.map((s, i) => {
          const stepIssues = issues.filter((x) => x.stepKey === s.key);
          const errs = stepIssues.filter((x) => x.severity === "error").length;
          const expanded = open.has(s.key);
          return (
            <li key={s.key} id={`edit-step-${s.key}`} className={cx("rounded-md border", errs ? "border-danger/40" : "border-line")}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggle(s.key)}
                  aria-expanded={expanded}
                  aria-controls={`edit-step-body-${s.key}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {expanded ? <ChevronDown className="size-3.5 shrink-0 text-muted" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden />}
                  <span className="tabular text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <Badge tone="navy">{STEP_TYPE_LABEL[s.type]}</Badge>
                  <span className="truncate text-[13px] font-semibold text-ink">{s.title}</span>
                  <code className="hidden text-[11px] text-muted sm:inline">{s.key}</code>
                  {workflow.startStep === s.key && <Badge tone="brand">Entry</Badge>}
                  <span className="text-[11px] text-muted">
                    {s.next.length} rule{s.next.length === 1 ? "" : "s"}
                  </span>
                  {errs > 0 && <Badge tone="danger">{errs} error{errs === 1 ? "" : "s"}</Badge>}
                </button>
                {!readOnly && (
                  <div className="flex items-center gap-1">
                    <IconButton label={`Move ${s.title} up`} disabled={i === 0} onClick={() => void run(s.key, { kind: "move_step", key: s.key, toIndex: i - 1 })}>
                      <ArrowUp className="size-3.5" aria-hidden />
                    </IconButton>
                    <IconButton label={`Move ${s.title} down`} disabled={i === workflow.steps.length - 1} onClick={() => void run(s.key, { kind: "move_step", key: s.key, toIndex: i + 1 })}>
                      <ArrowDown className="size-3.5" aria-hidden />
                    </IconButton>
                    <IconButton
                      label={`Remove ${s.title}`}
                      disabled={workflow.startStep === s.key}
                      onClick={() => {
                        const refs = referencesTo(workflow, s.key);
                        const msg = refs.length
                          ? `${s.title} is referenced by:\n\n${refs.map((r) => `• ${r.label}`).join("\n")}\n\nRemove the step and these references?`
                          : `Remove ${s.title}?`;
                        if (window.confirm(msg)) void run(s.key, { kind: "remove_step", key: s.key, removeReferences: refs.length > 0 });
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </IconButton>
                  </div>
                )}
              </div>

              {stepIssues.length > 0 && (
                <ul className="space-y-1 border-t border-line px-3 py-2 text-[12px]">
                  {stepIssues.map((x, n) => (
                    <li key={n} className="flex gap-1.5">
                      {x.severity === "error" ? (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-label="Error" />
                      ) : (
                        <Info className="mt-0.5 size-3.5 shrink-0 text-muted" aria-label={x.severity} />
                      )}
                      <span className={x.severity === "error" ? "text-danger" : "text-ink-2"}>{x.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              {error?.key === s.key && (
                <p role="alert" className="border-t border-line bg-danger-soft px-3 py-2 text-xs text-danger">
                  {error.text}
                </p>
              )}

              {expanded && (
                <div id={`edit-step-body-${s.key}`} className="space-y-4 border-t border-line bg-surface-2/40 px-3 py-3">
                  <StepSettings key={hash(s)} step={s} workflow={workflow} vocab={vocab} readOnly={readOnly} onSave={(patch) => run(s.key, { kind: "update_step", key: s.key, patch })} />
                  <RulesEditor key={hash(s.next)} step={s} workflow={workflow} vocab={vocab} readOnly={readOnly} onSave={(rules) => run(s.key, { kind: "set_rules", key: s.key, rules })} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!readOnly && <AddStep workflow={workflow} onAdd={(op) => run("__add", op)} error={error?.key === "__add" ? error.text : undefined} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add step
// ---------------------------------------------------------------------------

function AddStep({ workflow, onAdd, error }: { workflow: WorkflowDefinition; onAdd: (op: StructuralOp) => Promise<boolean>; error?: string }) {
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<WorkflowStepType>("question");
  const [after, setAfter] = useState(workflow.steps.at(-1)?.key ?? "");
  const [busy, setBusy] = useState(false);
  const suggestedKey = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 48);

  return (
    <form
      className="rounded-md border border-dashed border-line-strong p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onAdd({ kind: "add_step", step: { key: key || suggestedKey, type, title }, after });
        setBusy(false);
        if (ok) {
          setKey("");
          setTitle("");
        }
      }}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Add step</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Title">
          <input required value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Check Wi-Fi name" />
        </Field>
        <Field label="Key" hint={!key && suggestedKey ? `Will use ${suggestedKey}` : undefined}>
          <input value={key} maxLength={48} onChange={(e) => setKey(e.target.value)} className={cx(inputClass, "font-mono")} placeholder={suggestedKey || "check_wifi"} />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as WorkflowStepType)} className={inputClass}>
            {STEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {STEP_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Insert after">
          <select value={after} onChange={(e) => setAfter(e.target.value)} className={inputClass}>
            {workflow.steps.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="submit" className={buttonClass("secondary", "sm")} disabled={busy || !title.trim()}>
          <Plus className="size-3.5" aria-hidden /> {busy ? "Adding…" : "Add step"}
        </button>
        <span className="text-[11px] text-muted">New steps start without wording or rules; publish checks list what is still needed.</span>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step settings (title, type and type-specific fields)
// ---------------------------------------------------------------------------

type Vocab = NonNullable<WorkflowDefinition["observationVocabulary"]>;

function StepSettings({
  step,
  workflow,
  vocab,
  readOnly,
  onSave,
}: {
  step: WorkflowStep;
  workflow: WorkflowDefinition;
  vocab: Vocab;
  readOnly: boolean;
  onSave: (patch: StepConfigPatch) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(step.title);
  const [type, setType] = useState(step.type);
  const [evidence, setEvidence] = useState<EvidenceRequirement>(
    step.evidence ?? { checkpoint: step.key, description: "", observationTypes: [], view: "front" },
  );
  const [failTo, setFailTo] = useState(step.onFailure?.to ?? "");
  const [failReason, setFailReason] = useState<EscalationReasonCode>(step.onFailure?.reason ?? "low_visual_confidence");
  const [escalation, setEscalation] = useState<NonNullable<WorkflowStep["escalation"]>>(step.escalation ?? { reason: "unresolved_after_workflow", severity: "medium" });
  const [outcome, setOutcome] = useState<SessionOutcome>(step.completion?.outcome ?? "resolved_by_ai");
  const [tool, setTool] = useState(step.action?.tool ?? "");
  const [params, setParams] = useState(formatParams(step.action?.params ?? {}));
  const [guidance, setGuidance] = useState((step.allowedGuidance ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const others = workflow.steps.filter((s) => s.key !== step.key);
  const typeChanged = type !== step.type;

  function patch(): StepConfigPatch | string {
    const p: StepConfigPatch = {};
    if (title !== step.title) p.title = title;
    if (typeChanged) p.type = type;
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (type === "visual_request" && (typeChanged || !same(evidence, step.evidence))) p.evidence = evidence;
    const failure = failTo ? { to: failTo, reason: failReason } : null;
    if (!same(failure, step.onFailure ?? null)) p.onFailure = failure;
    if (type === "human_escalation" && (typeChanged || !same(escalation, step.escalation))) p.escalation = escalation;
    if (type === "completion" && (typeChanged || outcome !== step.completion?.outcome)) p.completion = { outcome };
    if (type === "business_action") {
      const parsed = parseParams(params);
      if (typeof parsed === "string") return parsed;
      const action = tool.trim() ? { tool: tool.trim(), params: parsed } : null;
      if (typeChanged || !same(action, step.action ?? null)) p.action = action;
    }
    if (type === "guidance") {
      const lines = guidance.split("\n").map((l) => l.trim()).filter(Boolean);
      if (typeChanged || !same(lines, step.allowedGuidance ?? [])) p.allowedGuidance = lines;
    }
    return p;
  }

  const pending = patch();
  const dirty = typeof pending === "string" || Object.keys(pending).length > 0;

  return (
    <fieldset disabled={readOnly || busy} className="space-y-3">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Step settings</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Type" hint={typeChanged ? "Settings that only apply to the old type are removed on save." : undefined}>
          <select value={type} onChange={(e) => setType(e.target.value as WorkflowStepType)} className={inputClass}>
            {STEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {STEP_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {type === "visual_request" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Checkpoint">
            <input value={evidence.checkpoint} onChange={(e) => setEvidence({ ...evidence, checkpoint: e.target.value })} className={cx(inputClass, "font-mono")} />
          </Field>
          <Field label="Camera view">
            <select value={evidence.view} onChange={(e) => setEvidence({ ...evidence, view: e.target.value as EvidenceRequirement["view"] })} className={inputClass}>
              {EVIDENCE_VIEWS.map((v) => (
                <option key={v} value={v}>
                  {VIEW_LABEL[v]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What must be visible">
            <input value={evidence.description} maxLength={200} onChange={(e) => setEvidence({ ...evidence, description: e.target.value })} className={inputClass} />
          </Field>
          <div>
            <span className={labelClass}>Required observations</span>
            {Object.keys(vocab).length === 0 ? (
              <p className="text-[11px] text-muted">This workflow has no observation vocabulary.</p>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.keys(vocab).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                    <input
                      type="checkbox"
                      checked={evidence.observationTypes.includes(t)}
                      onChange={(e) =>
                        setEvidence({
                          ...evidence,
                          observationTypes: e.target.checked ? [...evidence.observationTypes, t] : evidence.observationTypes.filter((x) => x !== t),
                        })
                      }
                    />
                    <span className="font-mono">{t}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {type === "business_action" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tool" hint="Whether the AI may run it is decided by the linked policy.">
            <input list="wf-tools" value={tool} onChange={(e) => setTool(e.target.value)} className={cx(inputClass, "font-mono")} placeholder="create_ticket" />
          </Field>
          <Field label="Parameters" hint="One per line: name = value">
            <textarea rows={2} value={params} onChange={(e) => setParams(e.target.value)} className={cx(inputClass, "font-mono")} />
          </Field>
        </div>
      )}

      {type === "human_escalation" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Reason">
            <select value={escalation.reason} onChange={(e) => setEscalation({ ...escalation, reason: e.target.value as typeof escalation.reason })} className={inputClass}>
              {ESCALATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {ESCALATION_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select value={escalation.severity} onChange={(e) => setEscalation({ ...escalation, severity: e.target.value as typeof escalation.severity })} className={inputClass}>
              {SEVERITIES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-1.5 text-[12px] text-ink-2">
            <input type="checkbox" checked={Boolean(escalation.humanOnly)} onChange={(e) => setEscalation({ ...escalation, humanOnly: e.target.checked || undefined })} />
            A person must finish the session
          </label>
        </div>
      )}

      {type === "completion" && (
        <Field label="Outcome">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className={inputClass}>
            {SESSION_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {type === "guidance" && (
        <Field label="Allowed guidance" hint="One approved instruction per line; the AI may not go beyond these.">
          <textarea rows={2} value={guidance} onChange={(e) => setGuidance(e.target.value)} className={inputClass} />
        </Field>
      )}

      {type !== "completion" && type !== "human_escalation" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="On failure, go to" hint={type === "visual_request" ? "Required for visual requests (attempts exhausted)." : "Optional; failures escalate by default."}>
            <select value={failTo} onChange={(e) => setFailTo(e.target.value)} className={inputClass}>
              <option value="">No failure path</option>
              {others.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
          {failTo && (
            <Field label="Failure reason">
              <select value={failReason} onChange={(e) => setFailReason(e.target.value as typeof failReason)} className={inputClass}>
                {ESCALATION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {ESCALATION_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            disabled={!dirty}
            onClick={async () => {
              const p = patch();
              if (typeof p === "string") return setLocalError(p);
              setLocalError(undefined);
              setBusy(true);
              await onSave(p);
              setBusy(false);
            }}
          >
            <Save className="size-3.5" aria-hidden /> {busy ? "Saving…" : "Save settings"}
          </button>
          {localError && <span className="text-xs text-danger">{localError}</span>}
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Transition rules
// ---------------------------------------------------------------------------

interface RuleDraft {
  kind: StepCondition["kind"];
  intents: string;
  observationType: string;
  values: string[];
  field: string;
  toolValues: string;
  to: string;
  label: string;
}

function toDraft(r: NextRule): RuleDraft {
  const c = r.when;
  return {
    kind: c.kind,
    intents: c.kind === "intent" ? c.intents.join(", ") : "",
    observationType: c.kind === "observation" ? c.observationType : "",
    values: c.kind === "observation" ? c.values : [],
    field: c.kind === "tool_result" ? c.field : "",
    toolValues: c.kind === "tool_result" ? c.values.join(", ") : "",
    to: r.to,
    label: r.label,
  };
}

const splitList = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

function fromDraft(d: RuleDraft): NextRule {
  const when: StepCondition =
    d.kind === "always"
      ? { kind: "always" }
      : d.kind === "intent"
        ? { kind: "intent", intents: splitList(d.intents) }
        : d.kind === "observation"
          ? { kind: "observation", observationType: d.observationType, values: d.values }
          : { kind: "tool_result", field: d.field.trim(), values: splitList(d.toolValues) };
  return { when, to: d.to, label: d.label };
}

function RulesEditor({
  step,
  workflow,
  vocab,
  readOnly,
  onSave,
}: {
  step: WorkflowStep;
  workflow: WorkflowDefinition;
  vocab: Vocab;
  readOnly: boolean;
  onSave: (rules: NextRule[]) => Promise<boolean>;
}) {
  const [rules, setRules] = useState<RuleDraft[]>(() => step.next.map(toDraft));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rules.map(fromDraft)) !== JSON.stringify(step.next);
  const vocabTypes = Object.keys(vocab);

  const update = (i: number, patch: Partial<RuleDraft>) => setRules((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRules((rs) => {
      const next = [...rs];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <fieldset disabled={readOnly || busy} className="space-y-2">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Next-step rules</legend>
      <p className="text-[11px] text-muted">Evaluated top to bottom; the first rule that matches decides the next step.</p>
      {rules.length === 0 && <p className="text-[12px] text-muted">No rules. Completion and escalation steps end the AI workflow; every other step needs at least one rule.</p>}
      <ol className="space-y-2">
        {rules.map((r, i) => (
          <li key={i} className="rounded-md border border-line bg-surface p-2.5">
            <div className="grid gap-2 md:grid-cols-[150px_1fr]">
              <Field label={`Rule ${i + 1} · when`}>
                <select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as RuleDraft["kind"] })} className={inputClass}>
                  {CONDITION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {CONDITION_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                {r.kind === "always" && <p className="self-end pb-1.5 text-[12px] text-muted">Matches whatever happens. Put it last.</p>}
                {r.kind === "intent" && (
                  <Field label="Intents" hint="Comma-separated, e.g. affirm, done">
                    <input list="wf-intents" value={r.intents} onChange={(e) => update(i, { intents: e.target.value })} className={cx(inputClass, "font-mono")} />
                  </Field>
                )}
                {r.kind === "observation" && (
                  <>
                    <Field label="Observation">
                      {vocabTypes.length ? (
                        <select value={r.observationType} onChange={(e) => update(i, { observationType: e.target.value, values: [] })} className={cx(inputClass, "font-mono")}>
                          <option value="">Choose…</option>
                          {vocabTypes.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                          {r.observationType && !vocab[r.observationType] && <option value={r.observationType}>{r.observationType} (not in vocabulary)</option>}
                        </select>
                      ) : (
                        <input value={r.observationType} onChange={(e) => update(i, { observationType: e.target.value })} className={cx(inputClass, "font-mono")} />
                      )}
                    </Field>
                    <div>
                      <span className={labelClass}>Is one of</span>
                      {vocab[r.observationType] ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {[...new Set([...vocab[r.observationType].values, ...r.values])].map((v) => (
                            <label key={v} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                              <input
                                type="checkbox"
                                checked={r.values.includes(v)}
                                onChange={(e) => update(i, { values: e.target.checked ? [...r.values, v] : r.values.filter((x) => x !== v) })}
                              />
                              <span className={cx("font-mono", !vocab[r.observationType].values.includes(v) && "text-danger")}>{v}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input value={r.values.join(", ")} onChange={(e) => update(i, { values: splitList(e.target.value) })} className={cx(inputClass, "font-mono")} />
                      )}
                    </div>
                  </>
                )}
                {r.kind === "tool_result" && (
                  <>
                    <Field label="Result field">
                      <input list="wf-tool-fields" value={r.field} onChange={(e) => update(i, { field: e.target.value })} className={cx(inputClass, "font-mono")} placeholder="line_test.status" />
                    </Field>
                    <Field label="Is one of" hint="Comma-separated">
                      <input value={r.toolValues} onChange={(e) => update(i, { toolValues: e.target.value })} className={cx(inputClass, "font-mono")} />
                    </Field>
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Then go to">
                <select value={r.to} onChange={(e) => update(i, { to: e.target.value })} className={inputClass}>
                  <option value="">Choose a step…</option>
                  {workflow.steps.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.title}
                      {s.key === step.key ? " (repeat this step)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Label">
                <input value={r.label} maxLength={80} onChange={(e) => update(i, { label: e.target.value })} className={inputClass} placeholder="e.g. Lights normal" />
              </Field>
              {!readOnly && (
                <div className="flex items-end gap-1 pb-0.5">
                  <IconButton label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" aria-hidden />
                  </IconButton>
                  <IconButton label={`Move rule ${i + 1} down`} disabled={i === rules.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" aria-hidden />
                  </IconButton>
                  <IconButton label={`Remove rule ${i + 1}`} onClick={() => setRules((rs) => rs.filter((_, n) => n !== i))}>
                    <X className="size-3.5" aria-hidden />
                  </IconButton>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClass("ghost", "sm")}
            disabled={rules.length >= 12}
            onClick={() => setRules((rs) => [...rs, { kind: "intent", intents: "", observationType: "", values: [], field: "", toolValues: "", to: "", label: "" }])}
          >
            <Plus className="size-3.5" aria-hidden /> Add rule
          </button>
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            disabled={!dirty}
            onClick={async () => {
              setBusy(true);
              await onSave(rules.map(fromDraft));
              setBusy(false);
            }}
          >
            <Save className="size-3.5" aria-hidden /> {busy ? "Saving…" : "Save rules"}
          </button>
          {dirty && (
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRules(step.next.map(toDraft))}>
              Undo changes
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export const inputClass = "w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink disabled:bg-surface-2 disabled:text-ink-2";
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function formatParams(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k} = ${v}`)
    .join("\n");
}

function parseParams(text: string): Record<string, string | number | boolean> | string {
  const out: Record<string, string | number | boolean> = {};
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^([a-z][a-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) return `Parameter line “${line}” should look like name = value`;
    const v = m[2].trim();
    out[m[1]] = v === "true" ? true : v === "false" ? false : v !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return out;
}

/** Cheap content hash used to reset local form state when the server copy changes. */
function hash(v: unknown): string {
  const s = JSON.stringify(v) ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h.toString(36);
}
