import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { users } from "@/lib/config/catalog";
import type { SessionState } from "@/lib/domain/session";
import { OBSERVATION_STATUSES, type EscalationReasonCode, type ObservationStatus, type VisualObservation } from "@/lib/domain/types";
import { isUncertain, latestObservations } from "@/lib/session/handover";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { formatDateTime, formatMinutes, pct } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, Stat, Table, Td, Th, type Tone } from "@/components/ui/primitives";
import { ConfidenceMeter, EscalationReasonBadge, ObservationStatusBadge, OutcomeBadge, SimulatedTag } from "@/components/domain/badges";
import { BarList } from "@/components/charts/bar-list";
import { buttonClass } from "@/components/ui/primitives";
import { qaStore } from "@/lib/server/qa";
import { reviewCalibration } from "@/lib/qa/calibration";
import { CalibrationTable, eceVerdict } from "@/components/qa/calibration-table";

export const metadata = { title: "QA" };

// ---------------------------------------------------------------------------
// Evaluation computations (pure, from session records)
// ---------------------------------------------------------------------------

const BANDS = [
  { key: "lt50", label: "< 50%", min: 0, max: 0.5 },
  { key: "50to75", label: "50–74%", min: 0.5, max: 0.75 },
  { key: "75to85", label: "75–84%", min: 0.75, max: 0.85 },
  { key: "gte85", label: "≥ 85%", min: 0.85, max: 1.0001 },
] as const;
type BandKey = (typeof BANDS)[number]["key"];

const SETTLED: ObservationStatus[] = ["confirmed_visible", "likely_visible", "not_visible"];
const DEFAULT_THRESHOLD = 0.75;

/** Status and confidence disagree, and the AI did not flag the observation for confirmation. */
function inconsistent(o: VisualObservation): boolean {
  const settledLow = (o.status === "confirmed_visible" || o.status === "likely_visible") && o.confidence < DEFAULT_THRESHOLD && !o.requiresConfirmation;
  const doubtfulHigh = !SETTLED.includes(o.status) && o.confidence >= 0.85;
  return settledLow || doubtfulHigh;
}

function band(c: number): BandKey {
  return (BANDS.find((b) => c >= b.min && c < b.max) ?? BANDS[0]).key;
}

type Signal = { label: string; tone: Tone; supported: boolean | null };

/** Evidence in the session record that supports (or not) the escalation reason. */
function escalationSignal(st: SessionState): Signal {
  const e = st.escalation!;
  const has = (t: string) => st.audit.some((a) => a.eventType === t);
  switch (e.reason) {
    case "low_visual_confidence":
    case "repeated_capture_failure": {
      const unsettled = st.observations.some((o) => !SETTLED.includes(o.status) || o.confidence < DEFAULT_THRESHOLD);
      return unsettled
        ? { label: "Unsettled evidence recorded", tone: "ok", supported: true }
        : { label: "No unsettled evidence found", tone: "danger", supported: false };
    }
    case "customer_requested":
      return has("human.requested") ? { label: "Customer request recorded", tone: "ok", supported: true } : { label: "No customer request event", tone: "danger", supported: false };
    case "ai_model_failure":
    case "media_failure":
      return has("ai.failure") || has("media.frame_failed")
        ? { label: "Provider failure recorded", tone: "ok", supported: true }
        : { label: "No failure event", tone: "danger", supported: false };
    case "unresolved_after_workflow":
      return st.workflow.history.filter((h) => h.status === "completed").length >= 3
        ? { label: "Approved steps attempted", tone: "ok", supported: true }
        : { label: "Few steps attempted", tone: "warn", supported: false };
    case "out_of_scope":
      return st.transcript.some((t) => t.intent === "out_of_scope")
        ? { label: "Out-of-scope intent recorded", tone: "ok", supported: true }
        : { label: "No out-of-scope intent", tone: "warn", supported: false };
    default:
      return { label: "Not assessed automatically", tone: "neutral", supported: null };
  }
}

function computeQa(states: SessionState[]) {
  const started = states.filter((s) => s.session.startedAt);
  const observations = started.flatMap((s) => s.observations.map((o) => ({ o, st: s })));

  // Calibration matrix: status × confidence band.
  const empty = (): Record<BandKey, number> => ({ lt50: 0, "50to75": 0, "75to85": 0, gte85: 0 });
  const matrix = new Map<ObservationStatus, { n: Record<BandKey, number>; odd: Record<BandKey, number>; total: number; sum: number }>();
  for (const status of OBSERVATION_STATUSES) matrix.set(status, { n: empty(), odd: empty(), total: 0, sum: 0 });
  for (const { o } of observations) {
    const row = matrix.get(o.status)!;
    row.n[band(o.confidence)] += 1;
    if (inconsistent(o)) row.odd[band(o.confidence)] += 1;
    row.total += 1;
    row.sum += o.confidence;
  }
  const settledBelow = observations.filter(({ o }) => inconsistent(o) && SETTLED.includes(o.status)).length;
  const doubtfulAbove = observations.filter(({ o }) => inconsistent(o) && !SETTLED.includes(o.status)).length;

  // Human review verdicts, overall and per band.
  const reviewed = observations.filter(({ o }) => o.humanReview);
  const reviewByBand = BANDS.map((b) => {
    const inBand = reviewed.filter(({ o }) => band(o.confidence) === b.key);
    return {
      ...b,
      reviewed: inBand.length,
      confirmed: inBand.filter(({ o }) => o.humanReview!.verdict === "confirmed").length,
      rejected: inBand.filter(({ o }) => o.humanReview!.verdict === "rejected").length,
    };
  });

  // Escalation correctness signals.
  const escalated = started.filter((s) => s.escalation);
  const byReason = new Map<EscalationReasonCode, { count: number; supported: number; unsupported: number; humanResolved: number; unresolved: number; waits: number[] }>();
  for (const st of escalated) {
    const r = st.escalation!.reason;
    const row = byReason.get(r) ?? { count: 0, supported: 0, unsupported: 0, humanResolved: 0, unresolved: 0, waits: [] };
    const sig = escalationSignal(st);
    row.count += 1;
    if (sig.supported === true) row.supported += 1;
    if (sig.supported === false) row.unsupported += 1;
    if (st.session.outcome === "resolved_by_human") row.humanResolved += 1;
    if (st.session.outcome === "escalated_unresolved") row.unresolved += 1;
    if (st.escalation!.acceptedAt) row.waits.push((Date.parse(st.escalation!.acceptedAt) - Date.parse(st.escalation!.requestedAt)) / 1000);
    byReason.set(r, row);
  }
  // Possible missed escalations: AI closed the session while evidence was still unsettled.
  const missed = started.filter((s) => s.session.outcome === "resolved_by_ai" && latestObservations(s).some(isUncertain));

  // Sessions flagged for QA review.
  const flagged = started
    .map((st) => {
      const reasons: string[] = [];
      if (st.escalation?.reason === "low_visual_confidence") reasons.push("Escalated: visual evidence unclear");
      if (st.escalation?.reason === "ai_model_failure") reasons.push("Escalated: AI model failure");
      const rejected = st.observations.filter((o) => o.humanReview?.verdict === "rejected").length;
      if (rejected) reasons.push(`${rejected} observation(s) rejected by a human`);
      return { st, reasons };
    })
    .filter((f) => f.reasons.length)
    .sort((a, b) => (b.st.session.startedAt ?? "").localeCompare(a.st.session.startedAt ?? ""));

  // Scenario results (simulation coverage).
  const scenarioRows = SCENARIOS.map((sc) => {
    const runs = started.filter((s) => s.session.scenario === sc.key);
    const ended = runs.filter((s) => s.session.outcome);
    return {
      sc,
      runs: runs.length,
      aiResolved: ended.filter((s) => s.session.outcome === "resolved_by_ai").length,
      escalated: runs.filter((s) => s.escalation).length,
      humanResolved: ended.filter((s) => s.session.outcome === "resolved_by_human").length,
      inProgress: runs.length - ended.length,
    };
  });

  const deniedTools = started.reduce((n, s) => n + s.toolActions.filter((a) => a.status === "denied").length, 0);
  const duplicateBlocked = started.reduce((n, s) => n + s.toolActions.filter((a) => a.status === "duplicate_blocked").length, 0);
  const uncertainObs = observations.filter(({ o }) => !SETTLED.includes(o.status)).length;
  const modelVersions = [...new Set(observations.map(({ o }) => o.modelVersion))];

  return {
    observations,
    matrix,
    settledBelow,
    doubtfulAbove,
    reviewed,
    reviewByBand,
    escalated,
    byReason,
    missed,
    flagged,
    scenarioRows,
    deniedTools,
    duplicateBlocked,
    uncertainObs,
    modelVersions,
    sessions: started.length,
  };
}

// ---------------------------------------------------------------------------
// docs/08 §2 controlled test sets → simulation scenarios
// ---------------------------------------------------------------------------

type Coverage = "covered" | "partial" | "none";
const TEST_SETS: { name: string; intent: string; scenarios: string[]; coverage: Coverage; note: string }[] = [
  {
    name: "Clear visual evidence",
    intent: "Correct reading when the object is fully and clearly visible",
    scenarios: ["power_cycle_fix", "wan_down", "loose_cable"],
    coverage: "covered",
    note: "Router and status lights returned at high confidence.",
  },
  {
    name: "Blurry evidence",
    intent: "Refuses to read detail from a blurred frame and asks again",
    scenarios: ["glare_then_clear", "persistently_unclear"],
    coverage: "partial",
    note: "Proxy only: unreadable frames are caused by glare, not motion or focus blur.",
  },
  {
    name: "Partial visibility",
    intent: "Reports what is and is not visible; requests another view",
    scenarios: ["glare_then_clear", "persistently_unclear"],
    coverage: "covered",
    note: "Wi-Fi indicator partially obscured; internet light unreadable.",
  },
  {
    name: "Conflicting evidence",
    intent: "Flags contradictions between frames or with the customer's account",
    scenarios: [],
    coverage: "none",
    note: "No scenario produces a conflicting_evidence observation.",
  },
  { name: "Low light", intent: "Recognises insufficient lighting and asks the customer to improve it", scenarios: [], coverage: "none", note: "No low-light frames are simulated." },
  {
    name: "Wrong object",
    intent: "Identifies that the shown object is not the one requested",
    scenarios: ["wrong_device"],
    coverage: "covered",
    note: "Customer first shows a TV set-top box.",
  },
  {
    name: "Similar-looking objects",
    intent: "Distinguishes visually similar devices (e.g. router vs. extender vs. ONT)",
    scenarios: [],
    coverage: "none",
    note: "The wrong-device scenario uses a clearly different device.",
  },
  {
    name: "Unsupported requests",
    intent: "Declines out-of-scope requests and escalates or redirects",
    scenarios: [],
    coverage: "partial",
    note: "Out-of-scope intent rule and workflow branch exist, but no scenario script drives them.",
  },
];

const COVERAGE_BADGE: Record<Coverage, { tone: Tone; label: string }> = {
  covered: { tone: "ok", label: "Covered" },
  partial: { tone: "warn", label: "Partial" },
  none: { tone: "danger", label: "Not yet covered" },
};

function userName(id: string): string {
  return users.find((u) => u.id === id)?.name ?? id;
}

export default async function QaPage() {
  const scope = await platformScope("platform.access", "/platform/qa");
  const q = computeQa(scope.states());
  const reasonRows = [...q.byReason.entries()].sort((a, b) => b[1].count - a[1].count);
  const supported = reasonRows.reduce((n, [, r]) => n + r.supported, 0);
  const assessed = reasonRows.reduce((n, [, r]) => n + r.supported + r.unsupported, 0);
  const reviewedRows = [...q.reviewed].sort((a, b) => b.o.humanReview!.at.localeCompare(a.o.humanReview!.at)).slice(0, 20);
  const rejectedCount = q.reviewed.filter(({ o }) => o.humanReview!.verdict === "rejected").length;
  const scenarioByKey = new Map(SCENARIOS.map((s) => [s.key, s]));
  const reviewCal = reviewCalibration(scope.states(), qaStore().reviews);
  const reviewEce = eceVerdict(reviewCal.ece);

  return (
    <>
      <PageHeader
        title="QA and AI evaluation"
        description="Uncertainty calibration, escalation correctness and human review of AI observations (docs/08 §2, docs/05 §7). Computed from session records."
        meta={
          <>
            <SimulatedTag label="All model output is simulated" />
            <Badge tone="neutral">Vision models: {q.modelVersions.join(", ") || "none"}</Badge>
          </>
        }
        actions={
          <>
            <Link href="/platform/qa/review" className={buttonClass("primary", "sm")}>
              Review queue
            </Link>
            <Link href="/platform/qa/evaluations" className={buttonClass("secondary", "sm")}>
              Evaluation sets
            </Link>
          </>
        }
      />

      <div role="note" className="mb-4 flex items-start gap-2 rounded-md border border-dashed border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Every observation on this page was produced by scripted simulation scenarios, not a real multimodal model. These figures validate the evaluation pipeline and
          product behaviour; they say nothing about real-world model accuracy. Correctness against ground truth requires labelled test sets run against a real provider.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Observations" value={q.observations.length} hint={`${q.sessions} sessions`} />
        <Stat label="Unsettled observations" value={pct(q.uncertainObs / Math.max(1, q.observations.length))} hint={`${q.uncertainObs} uncertain / unreadable / other`} />
        <Stat
          label="Calibration inconsistencies"
          value={q.settledBelow + q.doubtfulAbove}
          tone={q.settledBelow + q.doubtfulAbove ? "warn" : "ok"}
          hint={`${q.settledBelow} settled < 75% unflagged · ${q.doubtfulAbove} doubtful ≥ 85%`}
        />
        <Stat label="Escalations supported" value={assessed ? pct(supported / assessed) : "—"} hint={`${supported} of ${assessed} assessed`} />
        <Stat label="Human-reviewed" value={q.reviewed.length} hint={`${rejectedCount} rejected`} tone={rejectedCount ? "warn" : undefined} />
        <Stat label="Flagged for review" value={q.flagged.length} tone={q.flagged.length ? "warn" : undefined} hint={`${q.missed.length} possible missed escalation(s)`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          title="Uncertainty calibration"
          description="Observations by status and confidence band. A calibrated model reports settled statuses at high confidence and doubtful statuses at low confidence."
          className="xl:col-span-2"
          bodyClassName="p-0"
        >
          <Table>
            <thead>
              <tr>
                <Th>Status</Th>
                {BANDS.map((b) => (
                  <Th key={b.key} align="right">
                    {b.label}
                  </Th>
                ))}
                <Th align="right">Total</Th>
                <Th>Mean confidence</Th>
              </tr>
            </thead>
            <tbody>
              {OBSERVATION_STATUSES.map((status) => {
                const row = q.matrix.get(status)!;
                return (
                  <tr key={status}>
                    <Td>
                      <ObservationStatusBadge status={status} />
                    </Td>
                    {BANDS.map((b) => {
                      const n = row.n[b.key];
                      const odd = row.odd[b.key];
                      return (
                        <Td key={b.key} align="right" className={odd ? "font-semibold text-warn" : n === 0 ? "text-muted" : undefined}>
                          {n}
                          {odd > 0 && <span className="sr-only"> ({odd} inconsistent with status)</span>}
                          {odd > 0 && <span aria-hidden> !</span>}
                        </Td>
                      );
                    })}
                    <Td align="right" className="font-medium text-ink">
                      {row.total}
                    </Td>
                    <Td>{row.total ? <ConfidenceMeter value={row.sum / row.total} compact /> : <span className="text-muted">—</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">
            “!” marks observations whose status and confidence disagree: settled below the 75% workflow threshold without being flagged for confirmation, or doubtful at ≥ 85%. Low-confidence “Likely” readings that the AI flagged for confirmation are not counted.
          </p>
        </Panel>

        <Panel title="Human verdicts by confidence band" description="Of observations a human reviewed, how many were confirmed or rejected">
          {q.reviewed.length === 0 ? (
            <p className="text-sm text-muted">No observations have been reviewed by a human yet.</p>
          ) : (
            <BarList
              rows={q.reviewByBand.map((b) => ({
                label: `Confidence ${b.label}`,
                value: b.reviewed,
                hint: b.reviewed ? `${b.confirmed} confirmed · ${b.rejected} rejected` : undefined,
              }))}
            />
          )}
        </Panel>
      </div>

      <Panel
        title="Calibration against human review"
        description="Reported confidence against the share of readings a human confirmed, per confidence band. Uses QA review verdicts, plus agents' confirm/reject in the console for readings no QA reviewer has judged. Only readings where the AI gave a value are counted."
        className="mt-4"
        bodyClassName="p-0"
        actions={
          <Badge tone={reviewEce.tone ?? "neutral"}>
            ECE {reviewCal.ece === undefined ? "—" : reviewCal.ece.toFixed(3)} · {reviewEce.label}
          </Badge>
        }
      >
        {reviewCal.points === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No human-judged readings yet. Complete reviews from the review queue to build this report.</p>
        ) : (
          <>
            <CalibrationTable bins={reviewCal.bins} accuracyLabel="Human-confirmed" />
            <p className="border-t border-line px-4 py-2 text-xs text-muted">
              {reviewCal.points} readings: {reviewCal.fromQaReviews} from QA reviews, {reviewCal.fromConsoleReviews} from agent checks in the console. Overall{" "}
              {reviewCal.accuracy === undefined ? "—" : pct(reviewCal.accuracy)} confirmed at a mean reported confidence of {reviewCal.meanConfidence === undefined ? "—" : pct(reviewCal.meanConfidence)}.
              Agent checks are not a random sample: agents mostly check readings the AI flagged.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="Escalation correctness signals"
        description="For each escalation reason, whether the session record contains evidence that supports it, and what the human outcome was."
        className="mt-4"
        bodyClassName="p-0"
      >
        {reasonRows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No escalations recorded.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reason</Th>
                <Th align="right">Escalations</Th>
                <Th align="right">Supported</Th>
                <Th align="right">Not supported</Th>
                <Th align="right">Resolved by human</Th>
                <Th align="right">Unresolved</Th>
                <Th align="right">Avg wait</Th>
              </tr>
            </thead>
            <tbody>
              {reasonRows.map(([reason, r]) => {
                const assessedHere = r.supported + r.unsupported;
                return (
                  <tr key={reason}>
                    <Td>
                      <EscalationReasonBadge reason={reason} />
                    </Td>
                    <Td align="right">{r.count}</Td>
                    <Td align="right">{assessedHere ? `${r.supported} (${pct(r.supported / assessedHere)})` : <span className="text-muted">Not assessed</span>}</Td>
                    <Td align="right" className={r.unsupported ? "font-semibold text-danger" : undefined}>
                      {assessedHere ? r.unsupported : "—"}
                    </Td>
                    <Td align="right">{r.humanResolved}</Td>
                    <Td align="right">{r.unresolved}</Td>
                    <Td align="right">{r.waits.length ? formatMinutes(r.waits.reduce((a, b) => a + b, 0) / r.waits.length) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="grid gap-4 border-t border-line px-4 py-3 text-[13px] md:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-muted">Possible missed escalations</div>
            <div className="tabular mt-0.5 text-lg font-semibold text-ink">{q.missed.length}</div>
            <p className="text-xs text-muted">Resolved by AI while an observation still needed confirmation and no human confirmed it.</p>
            {q.missed.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-2">
                {q.missed.slice(0, 8).map((s) => (
                  <li key={s.session.id}>
                    <Link href={`/platform/sessions/${s.session.id}`} className="text-xs font-medium text-brand hover:underline">
                      {s.session.reference}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-muted">Tool requests denied by policy</div>
            <div className="tabular mt-0.5 text-lg font-semibold text-ink">{q.deniedTools}</div>
            <p className="text-xs text-muted">Workflow compliance: actions the AI requested that policy refused.</p>
          </div>
          <div>
            <div className="text-xs font-medium text-muted">Duplicate actions blocked</div>
            <div className="tabular mt-0.5 text-lg font-semibold text-ink">{q.duplicateBlocked}</div>
            <p className="text-xs text-muted">Repeat requests stopped by idempotency key.</p>
          </div>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Sessions flagged for review" description="Escalated for unclear evidence or AI model failure, or with any human-rejected observation" bodyClassName="p-0">
          {q.flagged.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No sessions are flagged.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Session</Th>
                    <Th>Why flagged</Th>
                    <Th>Outcome</Th>
                    <Th align="right">Obs.</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.flagged.map(({ st, reasons }) => (
                    <tr key={st.session.id} className="align-top hover:bg-surface-2">
                      <Td className="whitespace-nowrap">
                        <Link href={`/platform/sessions/${st.session.id}`} className="font-medium text-brand hover:underline">
                          {st.session.reference}
                        </Link>
                        <div className="text-xs text-muted">{formatDateTime(st.session.startedAt)}</div>
                      </Td>
                      <Td>
                        <ul className="space-y-0.5 text-xs">
                          {reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </Td>
                      <Td>
                        <OutcomeBadge outcome={st.session.outcome} />
                      </Td>
                      <Td align="right">{st.observations.length}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Panel>

        <Panel title="Human review verdicts" description={`Most recent ${reviewedRows.length} of ${q.reviewed.length} reviewed observations`} bodyClassName="p-0">
          {reviewedRows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No human reviews yet">Agents confirm or reject observations from the console after takeover.</EmptyState>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Observation</Th>
                    <Th>AI status</Th>
                    <Th>Confidence</Th>
                    <Th>Verdict</Th>
                  </tr>
                </thead>
                <tbody>
                  {reviewedRows.map(({ o, st }: { o: VisualObservation; st: SessionState }) => (
                    <tr key={o.id} className="align-top">
                      <Td>
                        <div className="text-ink">{o.observationText}</div>
                        <Link href={`/platform/sessions/${st.session.id}`} className="text-xs font-medium text-brand hover:underline">
                          {st.session.reference}
                        </Link>
                      </Td>
                      <Td>
                        <ObservationStatusBadge status={o.status} />
                      </Td>
                      <Td>
                        <ConfidenceMeter value={o.confidence} compact />
                      </Td>
                      <Td>
                        <Badge tone={o.humanReview!.verdict === "confirmed" ? "ok" : "danger"}>{o.humanReview!.verdict === "confirmed" ? "Confirmed" : "Rejected"}</Badge>
                        <div className="mt-0.5 text-xs text-muted">
                          {userName(o.humanReview!.userId)} · {formatDateTime(o.humanReview!.at)}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Evaluation test sets"
        description="docs/08 §2 controlled test sets mapped to the simulation scenarios that exercise them"
        className="mt-4"
        bodyClassName="p-0"
        actions={<SimulatedTag label="Simulation scenarios" />}
      >
        <Table>
          <thead>
            <tr>
              <Th>Test set</Th>
              <Th>What it checks</Th>
              <Th>Scenarios</Th>
              <Th>Coverage</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {TEST_SETS.map((t) => (
              <tr key={t.name} className="align-top">
                <Td className="whitespace-nowrap font-medium text-ink">{t.name}</Td>
                <Td className="min-w-[200px] text-xs">{t.intent}</Td>
                <Td>
                  {t.scenarios.length ? (
                    <ul className="space-y-0.5">
                      {t.scenarios.map((k) => (
                        <li key={k} className="whitespace-nowrap text-xs">
                          <span className="font-mono">{k}</span>
                          <span className="text-muted"> — {scenarioByKey.get(k)?.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-muted">None</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={COVERAGE_BADGE[t.coverage].tone}>{COVERAGE_BADGE[t.coverage].label}</Badge>
                </Td>
                <Td className="min-w-[200px] text-xs text-muted">{t.note}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          Additionally, <span className="font-mono">vision_outage</span> exercises the provider-failure fallback to a human; it is not one of the docs/08 visual test sets.
        </p>
      </Panel>

      <Panel title="Scenario results" description="How simulated sessions in this environment ended, per scenario, against the expected behaviour" className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Scenario</Th>
              <Th>Expected</Th>
              <Th align="right">Sessions</Th>
              <Th align="right">Resolved by AI</Th>
              <Th align="right">Escalated</Th>
              <Th align="right">Resolved by human</Th>
              <Th align="right">In progress</Th>
            </tr>
          </thead>
          <tbody>
            {q.scenarioRows.map((r) => (
              <tr key={r.sc.key} className="align-top">
                <Td>
                  <div className="font-medium text-ink">{r.sc.name}</div>
                  <div className="font-mono text-xs text-muted">{r.sc.key}</div>
                </Td>
                <Td className="min-w-[180px] text-xs">{r.sc.expectedOutcome}</Td>
                <Td align="right">{r.runs}</Td>
                <Td align="right">{r.aiResolved}</Td>
                <Td align="right">{r.escalated}</Td>
                <Td align="right">{r.humanResolved}</Td>
                <Td align="right">{r.inProgress}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

    </>
  );
}
