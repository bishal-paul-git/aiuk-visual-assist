import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageOff, Info, Lock } from "lucide-react";
import { platformRuntime, STATIC_EXPORT } from "@/lib/server/platform-data";
import { getRuntime } from "@/lib/server/runtime";
import { currentUser } from "@/lib/server/auth";
import { qaStore, samplingConfig } from "@/lib/server/qa";
import { getQaStore } from "@/lib/qa/store";
import { can } from "@/lib/auth/rbac";
import { tenantName, users, getWorkflow } from "@/lib/config/catalog";
import { frameSrc } from "@/lib/media/frame-src";
import { humanize } from "@/lib/domain/labels";
import { buildHandover, buildSummary } from "@/lib/session/handover";
import { buildQueue } from "@/lib/qa/queue";
import { SAMPLE_REASON_LABELS, sampleReasons } from "@/lib/qa/sampling";
import { ROUTER_EVAL_SET } from "@/lib/qa/router-eval-set";
import {
  EXPECTED_OUTCOME_LABELS,
  REVIEW_STATUS_LABELS,
  SCORE_KEYS,
  SCORE_LABELS,
  reviewFor,
  reviewStatus,
  sessionHandlers,
  type QaReview,
  type ReviewStatus,
} from "@/lib/qa/reviews";
import { confidencePct, formatDateTime, formatTimeSec } from "@/lib/format";
import { Badge, EmptyState, KeyValue, PageHeader, Panel, Table, Td, Th, buttonClass, type Tone } from "@/components/ui/primitives";
import { ConfidenceMeter, EscalationReasonBadge, ObservationStatusBadge, OutcomeBadge, SimulatedTag } from "@/components/domain/badges";
import { ClaimButton } from "@/components/qa/claim-button";
import { ReviewForm, type FormObservation } from "@/components/qa/review-form";

type Props = { params: Promise<{ sessionId: string }> };

const STATUS_TONE: Record<ReviewStatus, Tone> = { queued: "neutral", in_review: "brand", completed: "ok" };

export async function generateStaticParams() {
  return buildQueue(getRuntime().states(), getQaStore().reviews, samplingConfig()).map((i) => ({ sessionId: i.state.session.id }));
}

export async function generateMetadata({ params }: Props) {
  const { sessionId } = await params;
  const ref = getRuntime().get(sessionId)?.state.session.reference;
  return { title: ref ? `Review ${ref}` : "Review not found" };
}

function userName(id: string): string {
  return users.find((u) => u.id === id)?.name ?? id;
}

function Note({ icon, children, tone = "neutral" }: { icon: ReactNode; children: ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <div
      role="note"
      className={
        tone === "warn"
          ? "flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn"
          : "flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-2"
      }
    >
      {icon}
      <div>{children}</div>
    </div>
  );
}

export default async function ReviewWorkspacePage({ params }: Props) {
  const { sessionId } = await params;
  const rt = await platformRuntime("qa.review", `/platform/qa/review/${sessionId}`);
  const entry = rt.get(sessionId);
  if (!entry) notFound();
  const user = STATIC_EXPORT ? null : await currentUser();
  const { state, workflow } = entry;
  const s = state.session;
  if (user && !can(user, "qa.review", { tenantId: s.tenantId })) notFound();

  const store = qaStore();
  const review = reviewFor(store.reviews, s.id);
  const reasons = review?.sampleReasons.length ? review.sampleReasons : sampleReasons(state, samplingConfig());
  if (!review && reasons.length === 0) notFound();
  const status = reviewStatus(review);
  const handled = Boolean(user && sessionHandlers(state).has(user.id));
  const mine = Boolean(user && review?.reviewerId === user.id);
  const handover = buildHandover(state, workflow);
  const summary = buildSummary(state);
  const evalWorkflow = getWorkflow(ROUTER_EVAL_SET.workflowId);
  const canAddToEvaluationSet = Boolean(evalWorkflow && workflow.key === evalWorkflow.key && state.visualEvents.some((v) => v.checkpoint && !v.purgedAt));

  const frameIndex = new Map(state.visualEvents.map((v, i) => [v.id, i + 1]));
  const formObservations: FormObservation[] = state.observations.map((o) => {
    const ve = state.visualEvents.find((v) => v.id === o.visualEventId);
    return {
      id: o.id,
      frame: frameIndex.get(o.visualEventId) ?? 0,
      checkpoint: ve?.checkpoint,
      text: o.observationText,
      type: o.observationType,
      value: o.value,
      status: o.status,
      confidence: o.confidence,
      vocabulary: workflow.observationVocabulary?.[o.observationType]?.values,
    };
  });
  const outcomeSummary = s.escalationReason
    ? `The AI escalated this session (${humanize(s.escalationReason)}); it ended ${s.outcome ? humanize(s.outcome).toLowerCase() : "without a recorded outcome"}.`
    : `The session ended ${s.outcome ? humanize(s.outcome).toLowerCase() : "without a recorded outcome"} with no escalation.`;

  return (
    <>
      <div className="mb-3">
        <Link href="/platform/qa/review" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
          <ArrowLeft className="size-3" aria-hidden /> Review queue
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Review {s.reference}
            <span className="font-mono text-xs font-normal text-muted">{s.id}</span>
          </span>
        }
        description={`${s.workflowName} v${s.workflowVersion} · ${tenantName(s.tenantId)} · ended ${formatDateTime(s.endedAt)}`}
        meta={
          <>
            <Badge tone={STATUS_TONE[status]}>{REVIEW_STATUS_LABELS[status]}</Badge>
            <OutcomeBadge outcome={s.outcome} />
            {s.escalationReason && <EscalationReasonBadge reason={s.escalationReason} />}
            {reasons.map((r) => (
              <Badge key={r} tone="neutral">
                {SAMPLE_REASON_LABELS[r]}
              </Badge>
            ))}
            {s.scenario && <SimulatedTag label={`Simulated · ${s.scenario}`} />}
          </>
        }
        actions={
          <>
            <Link href={`/platform/sessions/${s.id}`} className={buttonClass("secondary", "sm")}>
              Full session record
            </Link>
            {user && status === "queued" && !handled && <ClaimButton sessionId={s.id} label="Claim for review" />}
          </>
        }
      />

      <div className="mb-4 space-y-2">
        {STATIC_EXPORT && (
          <Note icon={<Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}>
            Claiming and submitting reviews needs the server edition. This static demo shows the review workspace read-only.
          </Note>
        )}
        {user && status === "queued" && handled && (
          <Note tone="warn" icon={<Lock className="mt-0.5 size-4 shrink-0" aria-hidden />}>
            You handled this session as the agent, so another reviewer must review it.
          </Note>
        )}
        {user && status === "in_review" && !mine && review && (
          <Note icon={<Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}>
            Claimed by {review.reviewerName} on {formatDateTime(review.claimedAt)}. You can read the session but not record verdicts.
          </Note>
        )}
        {user && status === "queued" && !handled && (
          <Note icon={<Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}>Claim this session to record verdicts. Claiming stops other reviewers working on it at the same time.</Note>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Evidence and AI observations"
          description="Each selected frame with what the AI reported and how confident it was"
          className="xl:col-span-2"
          actions={s.scenario ? <SimulatedTag /> : undefined}
        >
          {state.visualEvents.length === 0 ? (
            <EmptyState title="No evidence frames" icon={<ImageOff className="size-5" aria-hidden />}>
              No frames were selected during this session.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {state.visualEvents.map((ve, i) => {
                const obs = state.observations.filter((o) => o.visualEventId === ve.id);
                return (
                  <li key={ve.id} className="grid gap-4 border-b border-line pb-4 last:border-b-0 last:pb-0 md:grid-cols-[220px_1fr]">
                    <figure>
                      {ve.purgedAt ? (
                        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-line-strong bg-surface-2 text-center text-xs text-muted">
                          Deleted under the retention policy
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={frameSrc(s.id, ve)}
                          alt={`Evidence frame ${i + 1}${ve.checkpoint ? ` for checkpoint ${ve.checkpoint}` : ""}`}
                          width={ve.width}
                          height={ve.height}
                          loading="lazy"
                          className="aspect-[4/3] w-full rounded-md border border-line bg-surface-2 object-cover"
                        />
                      )}
                      <figcaption className="mt-1.5 text-xs text-muted">
                        <span className="font-medium text-ink-2">Frame {i + 1}</span> · {formatTimeSec(ve.timestamp)} · {ve.checkpoint ? `checkpoint ${ve.checkpoint}` : "no checkpoint"}
                      </figcaption>
                    </figure>
                    <div className="min-w-0">
                      {obs.length === 0 ? (
                        <p className="text-sm text-muted">{ve.processingStatus === "failed" ? "The AI could not analyse this frame." : "No observations recorded for this frame."}</p>
                      ) : (
                        <Table className="rounded-md border border-line">
                          <thead>
                            <tr>
                              <Th>Observation</Th>
                              <Th>Value</Th>
                              <Th>Status</Th>
                              <Th>Confidence</Th>
                              <Th>Agent check</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {obs.map((o) => (
                              <tr key={o.id} className="align-top">
                                <Td>
                                  <div className="text-ink">{o.observationText}</div>
                                  <div className="font-mono text-[11px] text-muted">{o.observationType}</div>
                                </Td>
                                <Td>{o.value ?? <span className="text-muted">—</span>}</Td>
                                <Td>
                                  <ObservationStatusBadge status={o.status} />
                                </Td>
                                <Td className="min-w-[120px]">
                                  <ConfidenceMeter value={o.confidence} compact />
                                </Td>
                                <Td>
                                  {o.humanReview ? (
                                    <>
                                      <Badge tone={o.humanReview.verdict === "confirmed" ? "ok" : "danger"}>{o.humanReview.verdict === "confirmed" ? "Confirmed" : "Rejected"}</Badge>
                                      <div className="mt-0.5 text-[11px] text-muted">{userName(o.humanReview.userId)}</div>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted">—</span>
                                  )}
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Handover" description="What a human would have received (docs/05 §6)">
            <p className="mb-3 text-sm text-ink">{summary}</p>
            <KeyValue
              items={[
                ["Customer issue", handover.customerIssue],
                ["Reason for escalation", handover.reasonForEscalation],
                [
                  "Uncertain items",
                  handover.uncertainItems.length ? (
                    <ul className="space-y-1">
                      {handover.uncertainItems.map((u) => (
                        <li key={u.id}>
                          {u.observationText} <span className="tabular text-xs text-muted">{confidencePct(u.confidence)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "None"
                  ),
                ],
                ["Actions taken", handover.actionsTaken.length ? handover.actionsTaken.map((a) => a.summary).join("; ") : "None"],
                ["Recommended next step", handover.recommendedNextStep],
              ]}
            />
          </Panel>

          <Panel title="Transcript" description={`${state.transcript.length} turns`} bodyClassName="max-h-[480px] overflow-y-auto p-0">
            {state.transcript.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">{state.retention?.transcriptPurgedAt ? "Transcript deleted under the retention policy." : "No transcript recorded."}</p>
            ) : (
              <ol className="divide-y divide-line">
                {state.transcript.map((t) => (
                  <li key={t.id} className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span className="font-medium text-ink-2">{t.speakerName}</span>
                      <span className="tabular">{formatTimeSec(t.timestamp)}</span>
                      {t.intent && <span>intent: {t.intent}</span>}
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink">{t.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      {review?.status === "completed" ? (
        <CompletedReview review={review} />
      ) : user && mine ? (
        <Panel title="Your verdict" description="Judge each AI observation, whether the outcome was right, and score the session" className="mt-4">
          <ReviewForm sessionId={s.id} observations={formObservations} outcomeSummary={outcomeSummary} canAddToEvaluationSet={canAddToEvaluationSet} />
        </Panel>
      ) : null}
    </>
  );
}

function CompletedReview({ review }: { review: QaReview }) {
  const incorrect = review.verdicts.filter((v) => v.verdict === "incorrect").length;
  return (
    <Panel
      title="Completed review"
      description={`Submitted by ${review.reviewerName} on ${formatDateTime(review.submittedAt)}`}
      className="mt-4"
      actions={<Badge tone={incorrect ? "warn" : "ok"}>{incorrect ? `${incorrect} incorrect reading(s)` : "All readings correct"}</Badge>}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <KeyValue
          items={[
            [
              "Outcome",
              review.outcome?.correct ? (
                <Badge key="o" tone="ok">
                  Right
                </Badge>
              ) : (
                <span key="o" className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="danger">Wrong</Badge>
                  {review.outcome?.expected && EXPECTED_OUTCOME_LABELS[review.outcome.expected]}
                </span>
              ),
            ],
            ...SCORE_KEYS.map((k): [ReactNode, ReactNode] => [SCORE_LABELS[k].label, review.scores ? <span className="tabular">{review.scores[k]} / 5</span> : "—"]),
            ["Notes", review.notes ?? <span className="text-muted">None</span>],
            ["Claimed", formatDateTime(review.claimedAt)],
          ]}
        />
        <Table className="rounded-md border border-line">
          <thead>
            <tr>
              <Th>Reading</Th>
              <Th>AI value</Th>
              <Th>Confidence</Th>
              <Th>Verdict</Th>
            </tr>
          </thead>
          <tbody>
            {review.verdicts.map((v) => (
              <tr key={v.observationId}>
                <Td className="font-mono text-xs">{v.observationType}</Td>
                <Td>
                  {v.aiValue ?? <span className="text-muted">declined</span>} <span className="text-xs text-muted">({humanize(v.aiStatus)})</span>
                </Td>
                <Td className="tabular">{confidencePct(v.aiConfidence)}</Td>
                <Td>
                  <Badge tone={v.verdict === "correct" ? "ok" : "danger"}>{v.verdict === "correct" ? "Correct" : "Incorrect"}</Badge>
                  {v.verdict === "incorrect" && <span className="ml-1.5 text-xs text-ink-2">{v.correctedValue ? `actually ${v.correctedValue}` : "cannot be determined"}</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Panel>
  );
}
