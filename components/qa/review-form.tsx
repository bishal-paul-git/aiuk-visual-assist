"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Undo2 } from "lucide-react";
import type { ObservationStatus } from "@/lib/domain/types";
import {
  EXPECTED_OUTCOME_LABELS,
  MAX_NOTES,
  SCORE_KEYS,
  SCORE_LABELS,
  UNDETERMINED,
  type ExpectedOutcome,
  type ObservationVerdictValue,
  type ScoreKey,
} from "@/lib/qa/reviews";
import { humanize } from "@/lib/domain/labels";
import { Badge, buttonClass, cx } from "@/components/ui/primitives";
import { ConfidenceMeter, ObservationStatusBadge } from "@/components/domain/badges";

export interface FormObservation {
  id: string;
  frame: number;
  checkpoint?: string;
  text: string;
  type: string;
  value?: string;
  status: ObservationStatus;
  confidence: number;
  /** Allowed values from the workflow vocabulary; free text when absent. */
  vocabulary?: string[];
}

type VerdictState = { verdict?: ObservationVerdictValue; corrected?: string };

const fieldClass =
  "h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

/** Verdict form for a claimed review: per-observation verdicts, outcome, rubric scores and notes. */
export function ReviewForm({
  sessionId,
  observations,
  outcomeSummary,
  canAddToEvaluationSet,
}: {
  sessionId: string;
  observations: FormObservation[];
  outcomeSummary: string;
  canAddToEvaluationSet: boolean;
}) {
  const router = useRouter();
  const [verdicts, setVerdicts] = useState<Record<string, VerdictState>>({});
  const [outcomeCorrect, setOutcomeCorrect] = useState<"yes" | "no">();
  const [expected, setExpected] = useState<ExpectedOutcome>();
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>>>({});
  const [notes, setNotes] = useState("");
  const [addToSet, setAddToSet] = useState(canAddToEvaluationSet);
  const [busy, setBusy] = useState<"submit" | "release">();
  const [errors, setErrors] = useState<string[]>([]);

  const frames = useMemo(() => {
    const m = new Map<number, FormObservation[]>();
    for (const o of observations) m.set(o.frame, [...(m.get(o.frame) ?? []), o]);
    return [...m.entries()];
  }, [observations]);
  const decided = observations.filter((o) => verdicts[o.id]?.verdict).length;

  const set = (id: string, patch: VerdictState) => setVerdicts((v) => ({ ...v, [id]: { ...v[id], ...patch } }));

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/qa/reviews/${encodeURIComponent(sessionId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { res, body: (await res.json().catch(() => ({}))) as { error?: string; details?: string[] } };
  }

  async function submit() {
    setBusy("submit");
    setErrors([]);
    const { res, body } = await post({
      action: "submit",
      verdicts: observations.map((o) => {
        const v = verdicts[o.id] ?? {};
        return { observationId: o.id, verdict: v.verdict, ...(v.verdict === "incorrect" ? { correctedValue: v.corrected ?? "" } : {}) };
      }),
      outcome: outcomeCorrect === undefined ? undefined : { correct: outcomeCorrect === "yes", expected: outcomeCorrect === "no" ? expected : undefined },
      scores,
      notes,
      addToEvaluationSet: canAddToEvaluationSet && addToSet,
    });
    setBusy(undefined);
    if (!res.ok) {
      setErrors(body.details?.length ? body.details : [body.error ?? "Could not submit the review"]);
      return;
    }
    router.refresh();
  }

  async function release() {
    setBusy("release");
    const { res, body } = await post({ action: "release" });
    setBusy(undefined);
    if (!res.ok) return setErrors([body.error ?? "Could not release the review"]);
    router.push("/platform/qa/review");
    router.refresh();
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <legend className="text-[13px] font-semibold text-ink">
            AI observations{" "}
            <span className="font-normal text-muted">
              ({decided} of {observations.length} judged)
            </span>
          </legend>
          {observations.length > 0 && (
            <button
              type="button"
              className={buttonClass("secondary", "sm")}
              onClick={() => setVerdicts(Object.fromEntries(observations.map((o) => [o.id, { verdict: "correct" as const }])))}
            >
              <CheckCheck className="size-3.5" aria-hidden /> Mark all correct
            </button>
          )}
        </div>
        {observations.length === 0 ? (
          <p className="text-sm text-muted">The AI made no observations in this session.</p>
        ) : (
          <div className="space-y-3">
            {frames.map(([frame, obs]) => (
              <div key={frame} className="rounded-md border border-line">
                <div className="border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2">
                  Frame {frame}
                  {obs[0].checkpoint && <span className="text-muted"> · checkpoint {obs[0].checkpoint}</span>}
                </div>
                <ul className="divide-y divide-line">
                  {obs.map((o) => {
                    const v = verdicts[o.id] ?? {};
                    const name = `verdict-${o.id}`;
                    return (
                      <li key={o.id} className="grid gap-2 px-3 py-2.5 md:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <div className="text-sm text-ink">{o.text}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span className="font-mono">{o.type}</span>
                            <span>
                              Value: <span className="font-medium text-ink-2">{o.value ?? "none (declined)"}</span>
                            </span>
                            <ObservationStatusBadge status={o.status} />
                            <span className="w-28">
                              <ConfidenceMeter value={o.confidence} compact />
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-start gap-1.5 md:items-end">
                          <div role="radiogroup" aria-label={`Verdict for ${o.text}`} className="inline-flex overflow-hidden rounded-md border border-line-strong text-xs">
                            {(["correct", "incorrect"] as const).map((value) => (
                              <label
                                key={value}
                                className={cx(
                                  "cursor-pointer px-2.5 py-1 font-medium",
                                  v.verdict === value ? (value === "correct" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger") : "bg-surface text-ink-2 hover:bg-surface-2",
                                  value === "incorrect" && "border-l border-line-strong",
                                )}
                              >
                                <input type="radio" className="sr-only" name={name} value={value} checked={v.verdict === value} onChange={() => set(o.id, { verdict: value })} />
                                {value === "correct" ? "Correct" : "Incorrect"}
                              </label>
                            ))}
                          </div>
                          {v.verdict === "incorrect" &&
                            (o.vocabulary ? (
                              <label className="flex items-center gap-1.5 text-xs text-muted">
                                Actually shown
                                <select className={fieldClass} value={v.corrected ?? ""} onChange={(e) => set(o.id, { corrected: e.target.value })}>
                                  <option value="">Choose…</option>
                                  {o.vocabulary
                                    .filter((x) => x !== o.value)
                                    .map((x) => (
                                      <option key={x} value={x}>
                                        {humanize(x)}
                                      </option>
                                    ))}
                                  {o.value && <option value={UNDETERMINED}>Cannot be determined from the frame</option>}
                                </select>
                              </label>
                            ) : (
                              <label className="flex items-center gap-1.5 text-xs text-muted">
                                Actually shown
                                <input className={fieldClass} maxLength={80} value={v.corrected ?? ""} onChange={(e) => set(o.id, { corrected: e.target.value })} />
                              </label>
                            ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-semibold text-ink">Was the outcome right?</legend>
        <p className="text-xs text-muted">{outcomeSummary}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["yes", "Yes, the escalation or resolution was right"],
              ["no", "No"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5">
              <input type="radio" name="outcome" value={value} checked={outcomeCorrect === value} onChange={() => setOutcomeCorrect(value)} />
              {label}
            </label>
          ))}
        </div>
        {outcomeCorrect === "no" && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            What should have happened?
            <select className={fieldClass} value={expected ?? ""} onChange={(e) => setExpected((e.target.value || undefined) as ExpectedOutcome | undefined)}>
              <option value="">Choose…</option>
              {(Object.keys(EXPECTED_OUTCOME_LABELS) as ExpectedOutcome[]).map((k) => (
                <option key={k} value={k}>
                  {EXPECTED_OUTCOME_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink">Scores (1 = poor, 5 = excellent)</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {SCORE_KEYS.map((k) => (
            <div key={k} className="rounded-md border border-line px-3 py-2">
              <div className="text-sm font-medium text-ink">{SCORE_LABELS[k].label}</div>
              <div className="mb-1.5 text-xs text-muted">{SCORE_LABELS[k].hint}</div>
              <div role="radiogroup" aria-label={SCORE_LABELS[k].label} className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label
                    key={n}
                    className={cx(
                      "tabular flex size-8 cursor-pointer items-center justify-center rounded-md border text-sm font-medium",
                      scores[k] === n ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    <input type="radio" className="sr-only" name={`score-${k}`} value={n} checked={scores[k] === n} onChange={() => setScores((s) => ({ ...s, [k]: n }))} />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-[13px] font-semibold text-ink">Notes</span>
        <textarea
          className="mt-1 block min-h-[88px] w-full rounded-md border border-line-strong bg-surface px-2.5 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          maxLength={MAX_NOTES}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What went well, what went wrong, and anything the workflow or policy owner should know"
        />
        <span className="text-[11px] text-muted">
          {notes.length}/{MAX_NOTES}
        </span>
      </label>

      {canAddToEvaluationSet && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={addToSet} onChange={(e) => setAddToSet(e.target.checked)} />
          <span>
            Add this session&apos;s evidence frames to the evaluation set, labelled with these verdicts
            <span className="block text-xs text-muted">Frames deleted under the retention policy are skipped.</span>
          </span>
        </label>
      )}

      {errors.length > 0 && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <p className="font-medium">The review could not be submitted:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <button type="button" className={buttonClass("ghost", "md")} disabled={Boolean(busy)} onClick={() => void release()}>
          <Undo2 className="size-4" aria-hidden /> {busy === "release" ? "Releasing…" : "Release back to the queue"}
        </button>
        <div className="flex items-center gap-2">
          {decided < observations.length && <Badge tone="warn">{observations.length - decided} observation(s) not judged</Badge>}
          <button type="submit" className={buttonClass("primary", "md")} disabled={Boolean(busy)}>
            {busy === "submit" ? "Submitting…" : "Submit review"}
          </button>
        </div>
      </div>
    </form>
  );
}
