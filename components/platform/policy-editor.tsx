"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, Lock, RotateCcw, Save, Send, ShieldCheck, Trash2, Upload, UsersRound } from "lucide-react";
import type { Policy, ToolPermission, ToolRisk } from "@/lib/domain/types";
import { validatePolicy } from "@/lib/policy/engine";
import { Badge, buttonClass, cx, Panel, Table, Td, Th } from "@/components/ui/primitives";
import { ConfigStatusBadge, Mono } from "./config-ui";
import { ActingAdminSelect, defaultAdmin, type AdminOption } from "./acting-admin";
import { Field, inputClass } from "./workflow-structure-editor";

const MODES: ToolPermission["mode"][] = ["allow", "human_only", "deny"];
const RISKS: ToolRisk[] = ["low", "medium", "high", "regulated"];
const MODE_LABEL: Record<ToolPermission["mode"], string> = { allow: "AI may run", human_only: "Human only", deny: "Denied" };
const RISK_LABEL: Record<ToolRisk, string> = { low: "Low", medium: "Medium", high: "High", regulated: "Regulated" };

interface Form {
  changeNote: string;
  minObservationConfidence: number;
  maxCaptureAttempts: number;
  maxAiDurationSec: number;
  allowReturnToAi: boolean;
  tools: ToolPermission[];
}

function toForm(p: Policy): Form {
  return {
    changeNote: p.changeNote ?? "",
    minObservationConfidence: p.minObservationConfidence,
    maxCaptureAttempts: p.maxCaptureAttempts,
    maxAiDurationSec: p.maxAiDurationSec,
    allowReturnToAi: p.allowReturnToAi,
    tools: p.tools.map((t) => ({ ...t })),
  };
}

/**
 * Policy draft editor: tool modes and risk, limits and return-to-AI, with
 * live publish checks and the same draft → review → publish lifecycle and
 * four-eyes rule as workflows. Regulated tools cannot be set to "AI may run".
 */
export function PolicyEditor({ policy, base, admins }: { policy: Policy; base?: Policy; admins: AdminOption[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => toForm(policy));
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string }>();
  const [actorId, setActorId] = useState(() => defaultAdmin(admins, policy.submittedById));
  const readOnly = policy.status !== "draft";
  const actor = admins.find((a) => a.id === actorId);
  const isSubmitter = policy.status === "in_review" && (policy.submittedById ? policy.submittedById === actorId : policy.submittedBy === actor?.name);

  const preview = useMemo<Policy>(() => ({ ...policy, ...form }), [policy, form]);
  const issues = useMemo(() => validatePolicy(preview), [preview]);
  const errors = issues.filter((i) => i.severity === "error");
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const setTool = (tool: string, patch: Partial<ToolPermission>) =>
    setForm((f) => ({
      ...f,
      tools: f.tools.map((t) => {
        if (t.tool !== tool) return t;
        const next = { ...t, ...patch };
        // A regulated tool can never be run by the AI; fall back to human only.
        if (next.risk === "regulated" && next.mode === "allow") next.mode = "human_only";
        return next;
      }),
    }));

  async function request(label: string, url: string, method: string, body?: Record<string, unknown>, onOk?: () => void): Promise<boolean> {
    setBusy(label);
    setMessage(undefined);
    try {
      const res = await fetch(method === "DELETE" ? `${url}?actorId=${encodeURIComponent(actorId)}` : url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify({ ...body, actorId }) : undefined,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Request failed (${res.status})`);
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
      changeNote: form.changeNote,
      minObservationConfidence: form.minObservationConfidence,
      maxCaptureAttempts: form.maxCaptureAttempts,
      maxAiDurationSec: form.maxAiDurationSec,
      allowReturnToAi: form.allowReturnToAi,
      tools: form.tools
        .filter((t) => JSON.stringify(t) !== JSON.stringify(saved.tools.find((s) => s.tool === t.tool)))
        .map(({ tool, mode, risk, requiresIdempotencyKey }) => ({ tool, mode, risk, requiresIdempotencyKey })),
    };
    return request("save", `/api/policies/${policy.id}`, "PATCH", { patch }, () => {
      setSaved(form);
      setMessage({ tone: "ok", text: "Draft saved" });
    });
  }

  async function transition(action: "submit" | "reopen" | "publish") {
    if (action === "submit" && dirty && !(await save())) return;
    const ok = await request(action, `/api/policies/${policy.id}/transition`, "POST", { action });
    if (ok) {
      setMessage({ tone: "ok", text: action === "publish" ? `Published v${policy.version}. New sessions now use this version.` : action === "submit" ? "Submitted for review" : "Returned to draft" });
      if (action === "publish") router.push(`/platform/policies#${policy.key ?? policy.id}`);
    }
  }

  const baseTool = (tool: string) => base?.tools.find((t) => t.tool === tool);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Panel
          title="Tool permissions"
          description={readOnly ? "In review — reopen to make further changes" : "Edits apply to this draft only; the active version is unchanged until you publish"}
          bodyClassName="p-0"
        >
          <Table>
            <thead>
              <tr>
                <Th>Tool</Th>
                <Th>Risk</Th>
                <Th>Mode</Th>
                <Th>Idempotency key</Th>
              </tr>
            </thead>
            <tbody>
              {form.tools.map((t) => {
                const b = baseTool(t.tool);
                const changed = b && (b.mode !== t.mode || b.risk !== t.risk || b.requiresIdempotencyKey !== t.requiresIdempotencyKey);
                const toolIssues = issues.filter((i) => i.tool === t.tool);
                return (
                  <tr key={t.tool} className={changed ? "bg-brand-soft/40" : undefined}>
                    <Td>
                      <Mono>{t.tool}</Mono>
                      {changed && (
                        <Badge tone="brand" className="ml-2">
                          Changed
                        </Badge>
                      )}
                      {toolIssues.map((i, n) => (
                        <div key={n} className={cx("mt-1 flex gap-1 text-[11px]", i.severity === "error" ? "text-danger" : "text-muted")}>
                          {i.severity === "error" ? <AlertTriangle className="mt-px size-3 shrink-0" aria-label="Error" /> : <Info className="mt-px size-3 shrink-0" aria-label={i.severity} />}
                          {i.message}
                        </div>
                      ))}
                    </Td>
                    <Td>
                      <select
                        aria-label={`Risk for ${t.tool}`}
                        value={t.risk}
                        disabled={readOnly || !!busy}
                        onChange={(e) => setTool(t.tool, { risk: e.target.value as ToolRisk })}
                        className={cx(inputClass, "w-32")}
                      >
                        {RISKS.map((r) => (
                          <option key={r} value={r}>
                            {RISK_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td>
                      <select
                        aria-label={`Mode for ${t.tool}`}
                        value={t.mode}
                        disabled={readOnly || !!busy}
                        onChange={(e) => setTool(t.tool, { mode: e.target.value as ToolPermission["mode"] })}
                        className={cx(inputClass, "w-36")}
                      >
                        {MODES.map((m) => (
                          <option key={m} value={m} disabled={m === "allow" && t.risk === "regulated"}>
                            {MODE_LABEL[m]}
                            {m === "allow" && t.risk === "regulated" ? " (not for regulated)" : ""}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td>
                      <label className="flex items-center gap-2 text-xs text-ink-2">
                        <input
                          type="checkbox"
                          checked={t.requiresIdempotencyKey}
                          disabled={readOnly || !!busy}
                          onChange={(e) => setTool(t.tool, { requiresIdempotencyKey: e.target.checked })}
                        />
                        Required
                      </label>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="px-4 py-2.5 text-xs text-muted">Tools not listed are denied. Regulated tools always need a person, so they can only be human only or denied.</p>
        </Panel>

        <Panel title="Limits and control">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum observation confidence" hint="0.50–0.99. Observations below this never drive a workflow branch.">
              <input
                type="number"
                min={0.5}
                max={0.99}
                step={0.01}
                value={form.minObservationConfidence}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, minObservationConfidence: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Maximum capture attempts" hint="1–5 per visual checkpoint before escalating.">
              <input
                type="number"
                min={1}
                max={5}
                value={form.maxCaptureAttempts}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, maxCaptureAttempts: Number(e.target.value) })}
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
            <label className="flex items-center gap-2 self-center text-[13px] text-ink-2">
              <input type="checkbox" checked={form.allowReturnToAi} disabled={readOnly} onChange={(e) => setForm({ ...form, allowReturnToAi: e.target.checked })} />
              Agents may hand a session back to the AI (never after a mandatory-human escalation)
            </label>
          </div>
          <div className="mt-4">
            <Field label="Change note" hint="Required to submit. Explains why this version exists — it appears in the version history and audit log.">
              <input
                value={form.changeNote}
                disabled={readOnly}
                maxLength={400}
                onChange={(e) => setForm({ ...form, changeNote: e.target.value })}
                className={inputClass}
                placeholder="e.g. Line tests now need a person while the diagnostics API is unstable"
              />
            </Field>
          </div>
        </Panel>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Panel title="Version" bodyClassName="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-semibold text-ink">v{policy.version}</span>
            <ConfigStatusBadge status={policy.status} />
            {policy.basedOnVersion && <span className="text-muted">based on v{policy.basedOnVersion}</span>}
          </div>
          {policy.status === "in_review" && policy.submittedBy && <p className="text-xs text-muted">Submitted by {policy.submittedBy}</p>}
          <ActingAdminSelect admins={admins} value={actorId} onChange={setActorId} disabled={!!busy} />
          {message && (
            <p role="status" className={cx("rounded-md px-2.5 py-2 text-xs", message.tone === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
              {message.text}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {policy.status === "draft" && (
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
            {policy.status === "in_review" && (
              <>
                <button
                  type="button"
                  className={buttonClass("primary", "sm")}
                  disabled={errors.length > 0 || isSubmitter || !!busy}
                  title={isSubmitter ? "A different administrator must approve" : undefined}
                  onClick={() => void transition("publish")}
                >
                  <Upload className="size-3.5" aria-hidden /> Approve and publish v{policy.version}
                </button>
                <button type="button" className={buttonClass("secondary", "sm")} disabled={!!busy} onClick={() => void transition("reopen")}>
                  <RotateCcw className="size-3.5" aria-hidden /> Back to draft
                </button>
              </>
            )}
            {policy.basedOnVersion !== undefined && (
              <button
                type="button"
                className={buttonClass("ghost", "sm")}
                disabled={!!busy}
                onClick={() =>
                  window.confirm(`Discard v${policy.version}? This can't be undone.`) &&
                  void request("discard", `/api/policies/${policy.id}`, "DELETE", undefined, () => router.push("/platform/policies"))
                }
              >
                <Trash2 className="size-3.5" aria-hidden /> Discard
              </button>
            )}
          </div>
          {isSubmitter && (
            <p className="flex gap-1.5 rounded-md bg-warn-soft px-2.5 py-2 text-[11px] text-warn">
              <UsersRound className="mt-0.5 size-3 shrink-0" aria-hidden /> You submitted this version. Four-eyes approval needs a different administrator to approve and publish it.
            </p>
          )}
          {policy.status === "in_review" && (
            <p className="flex gap-1.5 text-[11px] text-muted">
              <Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> Publishing retires the active version. Sessions already running keep the policy they started with.
            </p>
          )}
          <p className="text-[11px] text-muted">
            Publishing needs a second administrator: whoever submits a version cannot approve it. Every change is recorded in the{" "}
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
                    {i.tool && <code className="mr-1 text-[11px]">{i.tool}</code>}
                    {i.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Changes from v${base?.version ?? "—"}`} description={dirty ? "Includes unsaved edits" : undefined}>
          <Changes base={base} next={preview} />
        </Panel>
      </aside>
    </div>
  );
}

function Changes({ base, next }: { base?: Policy; next: Policy }) {
  if (!base) return <p className="text-[13px] text-muted">First version of this policy.</p>;
  const out: { field: string; from: string; to: string }[] = [];
  const cmp = (field: string, a: unknown, b: unknown) => {
    if (String(a) !== String(b)) out.push({ field, from: String(a), to: String(b) });
  };
  cmp("Minimum confidence", base.minObservationConfidence, next.minObservationConfidence);
  cmp("Max capture attempts", base.maxCaptureAttempts, next.maxCaptureAttempts);
  cmp("Max AI duration (s)", base.maxAiDurationSec, next.maxAiDurationSec);
  cmp("Return to AI", base.allowReturnToAi ? "Permitted" : "Not permitted", next.allowReturnToAi ? "Permitted" : "Not permitted");
  for (const t of next.tools) {
    const b = base.tools.find((x) => x.tool === t.tool);
    if (!b) continue;
    cmp(`${t.tool} · mode`, MODE_LABEL[b.mode], MODE_LABEL[t.mode]);
    cmp(`${t.tool} · risk`, RISK_LABEL[b.risk], RISK_LABEL[t.risk]);
    cmp(`${t.tool} · idempotency key`, b.requiresIdempotencyKey ? "Required" : "Not required", t.requiresIdempotencyKey ? "Required" : "Not required");
  }
  if (out.length === 0) return <p className="text-[13px] text-muted">No changes yet.</p>;
  return (
    <ul className="space-y-2 text-[12px]">
      {out.map((c) => (
        <li key={c.field}>
          <div className="font-medium text-ink">{c.field}</div>
          <div className="text-danger line-through decoration-danger/50">{c.from}</div>
          <div className="text-ok">{c.to}</div>
        </li>
      ))}
    </ul>
  );
}
