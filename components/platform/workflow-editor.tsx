"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Lock, RotateCcw, Save, Send, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { WorkflowDefinition, WorkflowStep } from "@/lib/domain/types";
import { validateWorkflow } from "@/lib/workflow/engine";
import { Badge, buttonClass, cx, Panel } from "@/components/ui/primitives";
import { WorkflowStatusBadge } from "@/components/domain/badges";

type StepEdit = Pick<WorkflowStep, "instruction" | "customerPrompt" | "confidenceThreshold" | "maxAttempts">;

interface Form {
  objective: string;
  changeNote: string;
  defaultConfidenceThreshold: number;
  maxAiDurationSec: number;
  steps: Record<string, StepEdit>;
}

function toForm(wf: WorkflowDefinition): Form {
  return {
    objective: wf.objective,
    changeNote: wf.changeNote,
    defaultConfidenceThreshold: wf.defaultConfidenceThreshold,
    maxAiDurationSec: wf.maxAiDurationSec,
    steps: Object.fromEntries(
      wf.steps.map((s) => [s.key, { instruction: s.instruction, customerPrompt: s.customerPrompt, confidenceThreshold: s.confidenceThreshold, maxAttempts: s.maxAttempts }]),
    ),
  };
}

function apply(wf: WorkflowDefinition, f: Form): WorkflowDefinition {
  return {
    ...wf,
    objective: f.objective,
    changeNote: f.changeNote,
    defaultConfidenceThreshold: f.defaultConfidenceThreshold,
    maxAiDurationSec: f.maxAiDurationSec,
    steps: wf.steps.map((s) => ({ ...s, ...f.steps[s.key] })),
  };
}

const TYPE_LABEL: Record<WorkflowStep["type"], string> = {
  start: "Start",
  question: "Question",
  visual_request: "Visual request",
  guidance: "Guidance",
  business_action: "Business action",
  human_escalation: "Human escalation",
  completion: "Completion",
};

export function WorkflowEditor({ workflow, base }: { workflow: WorkflowDefinition; base?: WorkflowDefinition }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => toForm(workflow));
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string }>();
  const readOnly = workflow.status !== "draft";

  const preview = useMemo(() => apply(workflow, form), [workflow, form]);
  const issues = useMemo(() => validateWorkflow(preview), [preview]);
  const errors = issues.filter((i) => i.severity === "error");
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const changes = useMemo(() => diff(base, preview), [base, preview]);

  const setStep = (key: string, patch: Partial<StepEdit>) => setForm((f) => ({ ...f, steps: { ...f.steps, [key]: { ...f.steps[key], ...patch } } }));

  async function request(label: string, url: string, init: RequestInit, onOk?: () => void) {
    setBusy(label);
    setMessage(undefined);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      onOk?.();
      router.refresh();
      return true;
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<boolean> {
    const patch = {
      objective: form.objective,
      changeNote: form.changeNote,
      defaultConfidenceThreshold: form.defaultConfidenceThreshold,
      maxAiDurationSec: form.maxAiDurationSec,
      steps: workflow.steps
        .filter((s) => JSON.stringify(form.steps[s.key]) !== JSON.stringify(saved.steps[s.key]))
        .map((s) => ({ key: s.key, ...form.steps[s.key], confidenceThreshold: form.steps[s.key].confidenceThreshold ?? null, maxAttempts: form.steps[s.key].maxAttempts ?? null })),
    };
    return request("save", `/api/workflows/${workflow.id}`, { method: "PATCH", body: JSON.stringify({ patch }) }, () => {
      setSaved(form);
      setMessage({ tone: "ok", text: "Draft saved" });
    });
  }

  async function transition(action: "submit" | "reopen" | "publish") {
    if (action === "submit" && dirty && !(await save())) return;
    const ok = await request(action, `/api/workflows/${workflow.id}/transition`, { method: "POST", body: JSON.stringify({ action }) });
    if (ok) {
      setMessage({ tone: "ok", text: action === "publish" ? `Published v${workflow.version}. New sessions now use this version.` : action === "submit" ? "Submitted for review" : "Returned to draft" });
      if (action === "publish") router.push(`/platform/workflows/${workflow.id}`);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Panel title="Definition" description={readOnly ? "In review — reopen to make further changes" : "Edits apply to this draft only; the published version is unchanged until you publish"}>
          <div className="grid gap-4">
            <Field label="Objective">
              <textarea
                value={form.objective}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, objective: e.target.value })}
                rows={2}
                className={inputClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default confidence threshold" hint="0.50–0.99. Steps without their own threshold use this.">
                <input
                  type="number"
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  value={form.defaultConfidenceThreshold}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, defaultConfidenceThreshold: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
              <Field label="Maximum AI duration (minutes)" hint="The session escalates to a person after this long.">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={Math.round(form.maxAiDurationSec / 60)}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, maxAiDurationSec: Number(e.target.value) * 60 })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Change note" hint="Required to submit. Explains why this version exists — it appears in the version history and audit log.">
              <input value={form.changeNote} disabled={readOnly} onChange={(e) => setForm({ ...form, changeNote: e.target.value })} className={inputClass} placeholder="e.g. Clearer lights prompt; stricter threshold on status lights" />
            </Field>
          </div>
        </Panel>

        <Panel title="Steps" description="Wording and evidence thresholds. Step structure and branching rules are locked in this editor.">
          <ol className="space-y-3">
            {workflow.steps.map((s, i) => {
              const e = form.steps[s.key];
              const changed = base && JSON.stringify(stepFields(base.steps.find((b) => b.key === s.key))) !== JSON.stringify(stepFields({ ...s, ...e }));
              return (
                <li key={s.key} className={cx("rounded-md border p-3", changed ? "border-brand/40 bg-brand-soft/40" : "border-line")}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="tabular text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <Badge tone="navy">{TYPE_LABEL[s.type]}</Badge>
                    <span className="text-[13px] font-semibold text-ink">{s.title}</span>
                    <code className="text-[11px] text-muted">{s.key}</code>
                    {changed && <Badge tone="brand">Changed</Badge>}
                  </div>
                  <div className="grid gap-3">
                    <Field label="AI says">
                      <textarea value={e.instruction} disabled={readOnly} rows={2} onChange={(ev) => setStep(s.key, { instruction: ev.target.value })} className={inputClass} />
                    </Field>
                    <Field label={`Customer screen prompt (${e.customerPrompt.length}/120)`}>
                      <input value={e.customerPrompt} maxLength={120} disabled={readOnly} onChange={(ev) => setStep(s.key, { customerPrompt: ev.target.value })} className={inputClass} />
                    </Field>
                    {s.type === "visual_request" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Confidence threshold" hint={`Blank uses the default (${form.defaultConfidenceThreshold})`}>
                          <input
                            type="number"
                            min={0.5}
                            max={0.99}
                            step={0.01}
                            value={e.confidenceThreshold ?? ""}
                            disabled={readOnly}
                            onChange={(ev) => setStep(s.key, { confidenceThreshold: ev.target.value === "" ? undefined : Number(ev.target.value) })}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Max capture attempts" hint="1–5, capped by policy">
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={e.maxAttempts ?? ""}
                            disabled={readOnly}
                            onChange={(ev) => setStep(s.key, { maxAttempts: ev.target.value === "" ? undefined : Number(ev.target.value) })}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Panel title="Version" bodyClassName="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-semibold text-ink">v{workflow.version}</span>
            <WorkflowStatusBadge status={workflow.status} />
            {workflow.basedOnVersion && <span className="text-muted">based on v{workflow.basedOnVersion}</span>}
          </div>
          {workflow.status === "in_review" && workflow.submittedBy && <p className="text-xs text-muted">Submitted by {workflow.submittedBy}</p>}
          {message && (
            <p role="status" className={cx("rounded-md px-2.5 py-2 text-xs", message.tone === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
              {message.text}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {workflow.status === "draft" && (
              <>
                <button type="button" className={buttonClass("secondary", "sm")} disabled={!dirty || !!busy} onClick={() => void save()}>
                  <Save className="size-3.5" aria-hidden /> {busy === "save" ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className={buttonClass("primary", "sm")}
                  disabled={errors.length > 0 || !form.changeNote.trim() || !!busy}
                  onClick={() => void transition("submit")}
                  title={errors.length ? "Fix publish-check errors first" : !form.changeNote.trim() ? "Add a change note" : undefined}
                >
                  <Send className="size-3.5" aria-hidden /> Submit for review
                </button>
              </>
            )}
            {workflow.status === "in_review" && (
              <>
                <button type="button" className={buttonClass("primary", "sm")} disabled={errors.length > 0 || !!busy} onClick={() => void transition("publish")}>
                  <Upload className="size-3.5" aria-hidden /> Publish v{workflow.version}
                </button>
                <button type="button" className={buttonClass("secondary", "sm")} disabled={!!busy} onClick={() => void transition("reopen")}>
                  <RotateCcw className="size-3.5" aria-hidden /> Back to draft
                </button>
              </>
            )}
            <button
              type="button"
              className={buttonClass("ghost", "sm")}
              disabled={!!busy}
              onClick={() =>
                window.confirm(`Discard v${workflow.version}? This can't be undone.`) &&
                void request("discard", `/api/workflows/${workflow.id}`, { method: "DELETE" }, () => router.push("/platform/workflows"))
              }
            >
              <Trash2 className="size-3.5" aria-hidden /> Discard
            </button>
          </div>
          {workflow.status === "in_review" && (
            <p className="flex gap-1.5 text-[11px] text-muted">
              <Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> Publishing retires the current published version. Sessions already running stay on their version.
            </p>
          )}
          <p className="text-[11px] text-muted">
            Four-eyes approval and role-based publish rights arrive with SSO/RBAC. Every change is recorded in the{" "}
            <Link href="/platform/audit?type=config" className="text-brand hover:underline">
              audit log
            </Link>
            .
          </p>
        </Panel>

        <Panel title={<span className="flex items-center gap-1.5"><ShieldCheck className="size-4" aria-hidden /> Publish checks</span>} description="Live — recalculated as you edit">
          {issues.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[13px] text-ok">
              <CheckCircle2 className="size-4" aria-hidden /> All checks pass
            </p>
          ) : (
            <ul className="space-y-1.5 text-[12px]">
              {issues.map((i, idx) => (
                <li key={idx} className="flex gap-1.5">
                  {i.severity === "error" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-label="Error" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-muted" aria-label={i.severity} />}
                  <span className={i.severity === "error" ? "text-danger" : "text-ink-2"}>
                    {i.stepKey && <code className="mr-1 text-[11px]">{i.stepKey}</code>}
                    {i.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Changes from v${base?.version ?? "—"}`} description={dirty ? "Includes unsaved edits" : undefined}>
          {changes.length === 0 ? (
            <p className="text-[13px] text-muted">No changes yet.</p>
          ) : (
            <ul className="space-y-2 text-[12px]">
              {changes.map((c) => (
                <li key={c.field}>
                  <div className="font-medium text-ink">{c.field}</div>
                  <div className="text-danger line-through decoration-danger/50">{c.from}</div>
                  <div className="text-ok">{c.to}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>
    </div>
  );
}

const inputClass = "w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink disabled:bg-surface-2 disabled:text-ink-2";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function stepFields(s?: WorkflowStep) {
  return s ? { instruction: s.instruction, customerPrompt: s.customerPrompt, confidenceThreshold: s.confidenceThreshold, maxAttempts: s.maxAttempts } : null;
}

function diff(base: WorkflowDefinition | undefined, next: WorkflowDefinition): { field: string; from: string; to: string }[] {
  if (!base) return [];
  const out: { field: string; from: string; to: string }[] = [];
  const cmp = (field: string, a: unknown, b: unknown) => {
    if (String(a ?? "—") !== String(b ?? "—")) out.push({ field, from: String(a ?? "—"), to: String(b ?? "—") });
  };
  cmp("Objective", base.objective, next.objective);
  cmp("Default confidence threshold", base.defaultConfidenceThreshold, next.defaultConfidenceThreshold);
  cmp("Max AI duration (s)", base.maxAiDurationSec, next.maxAiDurationSec);
  for (const s of next.steps) {
    const b = base.steps.find((x) => x.key === s.key);
    if (!b) continue;
    cmp(`${s.title} · AI says`, b.instruction, s.instruction);
    cmp(`${s.title} · customer prompt`, b.customerPrompt, s.customerPrompt);
    cmp(`${s.title} · threshold`, b.confidenceThreshold, s.confidenceThreshold);
    cmp(`${s.title} · max attempts`, b.maxAttempts, s.maxAttempts);
  }
  return out;
}
