import type { ReactNode } from "react";
import Link from "next/link";
import { consolePath } from "@/lib/paths";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Headset, ImageOff, Info, User as UserIcon } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { getRuntime } from "@/lib/server/runtime";
import { frameSrc } from "@/lib/media/frame-src";
import { getAgent, getPolicy, getTenant, tenantName, users } from "@/lib/config/catalog";
import type { SessionState } from "@/lib/domain/session";
import type { Speaker, ToolAction, WorkflowDefinition } from "@/lib/domain/types";
import { CUSTOMER_STATE_LABELS, humanize } from "@/lib/domain/labels";
import { buildHandover, buildSummary } from "@/lib/session/handover";
import { formatDateTime, formatDuration, formatGBP, formatTimeSec, confidencePct } from "@/lib/format";
import { Badge, EmptyState, KeyValue, PageHeader, Panel, Stat, Table, Td, Th, buttonClass, type Tone } from "@/components/ui/primitives";
import {
  ConfidenceMeter,
  EscalationReasonBadge,
  ObservationStatusBadge,
  OutcomeBadge,
  OwnerBadge,
  SessionStatusBadge,
  SeverityBadge,
  SimulatedTag,
} from "@/components/domain/badges";
import { ACTOR_LABELS, actorName, summarizePayload, versionContext } from "@/components/platform/audit-format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await platformScope("platform.access", `/platform/sessions/${id}`);
  const entry = scope.rt.get(id);
  // Never reveal another client's session reference.
  const ref = entry && scope.includes(entry.state.session.tenantId) ? entry.state.session.reference : undefined;
  return { title: ref ? `${ref} · Session Detail` : "Session not found" };
}

const LIVE_STATUSES = new Set(["created", "awaiting_consent", "active", "escalated", "human_active"]);

function secondsBetweenIso(a?: string, b?: string): number {
  return a && b ? (Date.parse(b) - Date.parse(a)) / 1000 : NaN;
}

/** Duration of the session; ongoing sessions are measured to now (kept out of render for purity). */
function sessionDuration(state: SessionState, now = Date.now()): number {
  const s = state.session;
  if (!s.startedAt) return NaN;
  return ((s.endedAt ? Date.parse(s.endedAt) : now) - Date.parse(s.startedAt)) / 1000;
}

function userName(id?: string): string {
  if (!id) return "—";
  return users.find((u) => u.id === id)?.name ?? id;
}

const SPEAKER_ICON: Record<Speaker, ReactNode> = {
  customer: <UserIcon className="size-3.5" aria-hidden />,
  ai: <Bot className="size-3.5" aria-hidden />,
  human_agent: <Headset className="size-3.5" aria-hidden />,
  system: <Info className="size-3.5" aria-hidden />,
};
const SPEAKER_TONE: Record<Speaker, Tone> = { customer: "neutral", ai: "brand", human_agent: "violet", system: "neutral" };
const SPEAKER_LABEL: Record<Speaker, string> = { customer: "Customer", ai: "AI", human_agent: "Human", system: "System" };

const TOOL_TONE: Record<ToolAction["status"], Tone> = {
  requested: "neutral",
  running: "brand",
  completed: "ok",
  failed: "danger",
  duplicate_blocked: "warn",
  denied: "danger",
};

const STEP_TONE: Record<string, Tone> = { active: "brand", completed: "ok", failed: "danger", abandoned: "neutral" };

function Json({ value }: { value: unknown }) {
  if (value === undefined) return <span className="text-muted">—</span>;
  return (
    <pre className="max-w-xs overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface-2 px-2 py-1 font-mono text-[11px] leading-4 text-ink-2">
      {JSON.stringify(value, null, 1)}
    </pre>
  );
}

function stepDefinitionStatus(workflow: WorkflowDefinition, state: SessionState) {
  return workflow.steps.map((step) => {
    const visits = state.workflow.history.filter((h) => h.stepKey === step.key);
    const last = visits.at(-1);
    return { step, visits: visits.length, last, current: state.workflow.currentStep === step.key };
  });
}

/** Static demo: prerender every seeded session. */
export async function generateStaticParams() {
  return getRuntime().summaries().map((s) => ({ id: s.id }));
}

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await platformScope("platform.access", `/platform/sessions/${id}`);
  const entry = scope.rt.get(id);
  // Another client's session is reported as not found, not forbidden, so its existence does not leak.
  if (!entry || !scope.includes(entry.state.session.tenantId)) notFound();

  const { state, workflow } = entry;
  const s = state.session;
  const tenant = getTenant(s.tenantId);
  const policy = getPolicy(s.policyId);
  const agent = getAgent(s.agentId);
  const summary = buildSummary(state);
  const handover = buildHandover(state, workflow);
  const duration = sessionDuration(state);
  const uncertainCount = handover.uncertainItems.length;
  const costTotal = state.costs.reduce((n, c) => n + c.estimatedCost, 0);
  const isLive = entry.live && LIVE_STATUSES.has(s.status);
  const evidenceMode = tenant?.retention.evidenceMode ?? "live_only";
  const definitionSteps = stepDefinitionStatus(workflow, state);
  const audit = [...state.audit].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const humanReviewed = state.observations.filter((o) => o.humanReview).length;

  return (
    <>
      <div className="mb-3">
        <Link href="/platform/sessions" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
          <ArrowLeft className="size-3" aria-hidden /> Session history
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {s.reference}
            <span className="font-mono text-xs font-normal text-muted">{s.id}</span>
          </span>
        }
        description={`${s.workflowName} v${s.workflowVersion} · ${tenantName(s.tenantId)} · ${humanize(s.channel)} · ${s.customerLabel}`}
        meta={
          <>
            <SessionStatusBadge status={s.status} />
            <OutcomeBadge outcome={s.outcome} />
            <OwnerBadge owner={s.ownerType} />
            {s.escalationReason && <EscalationReasonBadge reason={s.escalationReason} />}
            {s.scenario && <SimulatedTag label={`Simulated · ${s.scenario}`} />}
          </>
        }
        actions={
          isLive ? (
            <Link href={consolePath(s.id)} className={buttonClass("primary", "sm")}>
              Open in agent console
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Started" value={<span className="text-lg">{formatDateTime(s.startedAt ?? s.createdAt)}</span>} hint={s.endedAt ? `Ended ${formatDateTime(s.endedAt)}` : "In progress"} />
        <Stat label="Duration" value={formatDuration(duration)} hint={isLive ? "Still running" : undefined} />
        <Stat label="Evidence frames" value={state.visualEvents.length} hint={`${state.observations.length} observations`} />
        <Stat label="Uncertain items" value={uncertainCount} tone={uncertainCount ? "warn" : undefined} hint={`${humanReviewed} human-reviewed`} />
        <Stat label="Tool actions" value={state.toolActions.length} hint={`${state.toolActions.filter((a) => a.status === "completed").length} completed`} />
        <Stat label="Estimated cost" value={formatGBP(costTotal, 3)} hint={`${state.costs.length} cost events`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Summary and handover" description="Built deterministically from the session record (docs/05 §6)" className="xl:col-span-2">
          <p className="text-sm text-ink">{summary}</p>
          <KeyValue
            className="mt-4"
            items={[
              ["Customer issue", handover.customerIssue],
              ["Workflow", handover.workflow],
              [
                "Completed steps",
                handover.completedSteps.length ? (
                  <ol className="list-inside list-decimal space-y-0.5">
                    {handover.completedSteps.map((c, i) => (
                      <li key={`${c.key}-${i}`}>
                        {c.title}
                        {c.outcome && <span className="text-muted"> — {c.outcome}</span>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  "None"
                ),
              ],
              [
                "Uncertain items",
                handover.uncertainItems.length ? (
                  <ul className="space-y-1">
                    {handover.uncertainItems.map((u) => (
                      <li key={u.id} className="flex flex-wrap items-center gap-2">
                        <ObservationStatusBadge status={u.status} />
                        <span>{u.observationText}</span>
                        <span className="tabular text-xs text-muted">{confidencePct(u.confidence)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "None"
                ),
              ],
              [
                "Actions taken",
                handover.actionsTaken.length ? (
                  <ul className="space-y-0.5">
                    {handover.actionsTaken.map((a, i) => (
                      <li key={i}>
                        <Badge tone={TOOL_TONE[a.status]}>{humanize(a.status)}</Badge> {a.summary}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "None"
                ),
              ],
              ["Reason for escalation", handover.reasonForEscalation],
              ["Recommended next step", handover.recommendedNextStep],
            ]}
          />
        </Panel>

        <Panel title="Session record" description="Versions and configuration in force for this session">
          <KeyValue
            items={[
              ["Client", tenantName(s.tenantId)],
              ["Workflow", `${s.workflowName} (${s.workflowKey}) v${s.workflowVersion}`],
              ["Policy", `${policy?.name ?? s.policyId} v${s.policyVersion}`],
              ["AI agent", agent ? `${agent.name} v${agent.version}` : s.agentId],
              ["Model", <span key="m" className="font-mono text-xs">{s.modelVersion}</span>],
              ["Prompt", <span key="p" className="font-mono text-xs">{s.promptVersion}</span>],
              ["Channel", humanize(s.channel)],
              ["Customer UX state", CUSTOMER_STATE_LABELS[state.customerState]],
              ["Consent", state.consent ? `Accepted ${formatTimeSec(state.consent.acceptedAt)} · notice ${state.consent.noticeVersion}` : "Not recorded"],
              ["Evidence mode", evidenceMode === "live_only" ? "Live only — frames not retained" : `Retained ${tenant?.retention.evidenceRetentionDays ?? "?"} days`],
              [
                "Participants",
                <ul key="pt" className="space-y-0.5">
                  {state.participants.map((p) => (
                    <li key={p.id}>
                      {p.displayName} <span className="text-xs text-muted">({humanize(p.type)})</span>
                    </li>
                  ))}
                </ul>,
              ],
              ["Scenario", s.scenario ? <SimulatedTag key="sc" label={s.scenario} /> : "—"],
            ]}
          />
        </Panel>
      </div>

      {state.escalation && (
        <Panel title="Escalation record" className="mt-4">
          <KeyValue
            items={[
              ["Reason", <EscalationReasonBadge key="r" reason={state.escalation.reason} />],
              ["Detail", state.escalation.reasonDetail],
              [
                "Severity",
                <span key="sv" className="flex flex-wrap gap-1">
                  <SeverityBadge severity={state.escalation.severity} />
                  {state.escalation.mandatoryHuman && <Badge tone="navy">Mandatory human — no return to AI</Badge>}
                </span>,
              ],
              ["Requested", formatDateTime(state.escalation.requestedAt)],
              [
                "Accepted",
                state.escalation.acceptedAt
                  ? `${formatDateTime(state.escalation.acceptedAt)} · waited ${formatDuration(secondsBetweenIso(state.escalation.requestedAt, state.escalation.acceptedAt))}`
                  : "Not yet accepted",
              ],
              ["Assigned to", state.escalation.assignedUserName ?? userName(state.escalation.assignedUserId)],
              ["Resolution", state.escalation.resolution ?? "—"],
            ]}
          />
        </Panel>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Transcript" description={`${state.transcript.length} turns · customer ASR confidence shown`} bodyClassName="max-h-[560px] overflow-y-auto p-0">
          {state.transcript.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No transcript recorded.</p>
          ) : (
            <ol className="divide-y divide-line">
              {state.transcript.map((t) => (
                <li key={t.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={SPEAKER_TONE[t.speaker]} icon={SPEAKER_ICON[t.speaker]}>
                      {SPEAKER_LABEL[t.speaker]}
                    </Badge>
                    <span className="font-medium text-ink-2">{t.speakerName}</span>
                    <span className="tabular">{formatTimeSec(t.timestamp)}</span>
                    {t.speaker === "customer" && <span className="tabular">ASR {confidencePct(t.confidence)}</span>}
                    {t.intent && <Badge tone="neutral">intent: {t.intent}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink">{t.text}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Workflow step history" description={`${workflow.name} v${workflow.version} — steps as executed`} bodyClassName="p-0">
          {state.workflow.history.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Workflow not started.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Step</Th>
                  <Th>Entered</Th>
                  <Th>Completed</Th>
                  <Th align="right">Time</Th>
                  <Th>Outcome</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {state.workflow.history.map((h, i) => {
                  const def = workflow.steps.find((x) => x.key === h.stepKey);
                  return (
                    <tr key={`${h.stepKey}-${i}`}>
                      <Td>
                        <div className="font-medium text-ink">{h.title}</div>
                        <div className="text-xs text-muted">
                          {h.stepKey}
                          {def && ` · ${humanize(def.type)}`}
                        </div>
                      </Td>
                      <Td className="tabular whitespace-nowrap">{formatTimeSec(h.enteredAt)}</Td>
                      <Td className="tabular whitespace-nowrap">{formatTimeSec(h.completedAt)}</Td>
                      <Td align="right">{h.completedAt ? formatDuration(secondsBetweenIso(h.enteredAt, h.completedAt)) : "—"}</Td>
                      <Td>{h.outcome ?? "—"}</Td>
                      <Td>
                        <Badge tone={STEP_TONE[h.status] ?? "neutral"}>{humanize(h.status)}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <div className="border-t border-line px-4 py-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Against the workflow definition</h3>
            <ul className="grid gap-1 text-[13px] sm:grid-cols-2">
              {definitionSteps.map(({ step, visits, last, current }) => (
                <li key={step.key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-ink-2">
                    {step.title} <span className="text-xs text-muted">({humanize(step.type)})</span>
                  </span>
                  {current ? (
                    <Badge tone="brand">Current</Badge>
                  ) : visits ? (
                    <Badge tone={STEP_TONE[last?.status ?? "completed"] ?? "neutral"}>
                      {humanize(last?.status ?? "completed")}
                      {visits > 1 ? ` ×${visits}` : ""}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Not reached</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <Panel
        title="Selected evidence frames"
        description="Only frames selected by the frame-selection rules are recorded. Observations come from the simulated vision provider."
        className="mt-4"
        actions={<SimulatedTag />}
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
                <li key={ve.id} className="grid gap-4 border-b border-line pb-4 last:border-b-0 last:pb-0 md:grid-cols-[240px_1fr]">
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={frameSrc(s.id, ve)}
                      alt={`Evidence frame ${i + 1}${ve.checkpoint ? ` for checkpoint ${ve.checkpoint}` : ""}`}
                      width={ve.width}
                      height={ve.height}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-md border border-line bg-surface-2 object-cover"
                    />
                    <figcaption className="mt-1.5 space-y-0.5 text-xs text-muted">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-ink-2">Frame {i + 1}</span>
                        <Badge tone="neutral">{humanize(ve.triggerType)}</Badge>
                        <Badge tone={ve.processingStatus === "failed" ? "danger" : ve.processingStatus === "analysed" ? "ok" : "neutral"}>{humanize(ve.processingStatus)}</Badge>
                      </div>
                      <div className="tabular">
                        {formatTimeSec(ve.timestamp)} · {ve.width}×{ve.height} · {(ve.bytes / 1024).toFixed(0)} KB
                      </div>
                      <div>
                        {ve.checkpoint ? `Checkpoint ${ve.checkpoint}` : "No checkpoint"}
                        {ve.stepKey && ` · step ${ve.stepKey}`}
                      </div>
                    </figcaption>
                  </figure>
                  <div className="min-w-0">
                    {obs.length === 0 ? (
                      <p className="text-sm text-muted">No observations recorded for this frame.</p>
                    ) : (
                      <Table className="rounded-md border border-line">
                        <thead>
                          <tr>
                            <Th>Observation</Th>
                            <Th>Status</Th>
                            <Th>Confidence</Th>
                            <Th>Value</Th>
                            <Th>Model</Th>
                            <Th>Human review</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {obs.map((o) => (
                            <tr key={o.id}>
                              <Td>
                                <div className="text-ink">{o.observationText}</div>
                                <div className="text-xs text-muted">
                                  {o.observationType}
                                  {o.requiresConfirmation && " · needs confirmation"}
                                  {o.recommendedNextAction && ` · next: ${humanize(o.recommendedNextAction)}`}
                                </div>
                              </Td>
                              <Td>
                                <ObservationStatusBadge status={o.status} />
                              </Td>
                              <Td>
                                <ConfidenceMeter value={o.confidence} threshold={workflow.defaultConfidenceThreshold} compact />
                              </Td>
                              <Td className="font-mono text-xs">{o.value ?? "—"}</Td>
                              <Td className="font-mono text-xs whitespace-nowrap">{o.modelVersion}</Td>
                              <Td>
                                {o.humanReview ? (
                                  <div>
                                    <Badge tone={o.humanReview.verdict === "confirmed" ? "ok" : "danger"}>{o.humanReview.verdict === "confirmed" ? "Confirmed" : "Rejected"}</Badge>
                                    <div className="mt-0.5 text-xs text-muted">
                                      {userName(o.humanReview.userId)} · {formatTimeSec(o.humanReview.at)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted">Not reviewed</span>
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

      <Panel title="Tool actions" description="Business actions with idempotency keys. Duplicates are blocked by key." className="mt-4" bodyClassName="p-0">
        {state.toolActions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No tool actions were requested.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tool</Th>
                <Th>Status</Th>
                <Th>Requested by</Th>
                <Th>Idempotency key</Th>
                <Th>Request</Th>
                <Th>Result</Th>
                <Th>Timing</Th>
              </tr>
            </thead>
            <tbody>
              {state.toolActions.map((a) => (
                <tr key={a.id} className="align-top">
                  <Td>
                    <div className="font-medium text-ink">{humanize(a.toolName)}</div>
                    <div className="text-xs text-muted">{a.stepKey ? `step ${a.stepKey}` : "ad hoc"}</div>
                  </Td>
                  <Td>
                    <Badge tone={TOOL_TONE[a.status]}>{humanize(a.status)}</Badge>
                    {a.error && <div className="mt-1 max-w-[200px] text-xs text-danger">{a.error}</div>}
                    {a.outcome && (
                      <div className="mt-1 text-[11px] text-muted">
                        {a.outcome.mode === "http" ? `Client API ${a.outcome.endpointHost ?? ""}` : a.outcome.mode === "builtin" ? "Built-in record" : "Sandbox"} · {a.outcome.latencyMs.toLocaleString("en-GB")} ms
                        {a.outcome.attempts > 1 ? ` · ${a.outcome.attempts} attempts` : ""}
                        {a.outcome.externalRef && (
                          <div>
                            ref <span className="font-mono">{a.outcome.externalRef}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </Td>
                  <Td>{a.requestedBy === "ai" ? "AI" : "Human"}</Td>
                  <Td className="font-mono text-xs break-all">{a.idempotencyKey}</Td>
                  <Td>
                    <Json value={a.request} />
                  </Td>
                  <Td>
                    <Json value={a.result} />
                  </Td>
                  <Td className="tabular whitespace-nowrap text-xs">
                    {formatTimeSec(a.startedAt)}
                    {a.completedAt && ` → ${formatTimeSec(a.completedAt)}`}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Agent notes" description="Internal — never shown to the customer">
          {state.notes.length === 0 ? (
            <p className="text-sm text-muted">No notes.</p>
          ) : (
            <ul className="space-y-3">
              {state.notes.map((n) => (
                <li key={n.id} className="text-sm">
                  <div className="text-xs text-muted">
                    <span className="font-medium text-ink-2">{n.authorName}</span> · {formatDateTime(n.timestamp)}
                  </div>
                  <p className="mt-0.5 text-ink">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Cost events" description="Provider cost estimates in GBP" bodyClassName="p-0">
          {state.costs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No cost events.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Time</Th>
                    <Th>Category</Th>
                    <Th>Provider</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {state.costs.map((c) => (
                    <tr key={c.id}>
                      <Td className="tabular whitespace-nowrap">{formatTimeSec(c.timestamp)}</Td>
                      <Td>{humanize(c.category)}</Td>
                      <Td className="text-xs">
                        {c.provider}
                        <div className="text-[11px] text-muted">
                          {c.basis === "measured" && c.usage
                            ? `Measured · ${c.usage.inputTokens + c.usage.cacheCreationInputTokens + c.usage.cacheReadInputTokens} in / ${c.usage.outputTokens} out tokens`
                            : "Estimated"}
                        </div>
                      </Td>
                      <Td align="right">
                        {Number.isInteger(c.quantity) ? c.quantity : c.quantity.toFixed(2)} {c.unit}
                      </Td>
                      <Td align="right">{formatGBP(c.estimatedCost, 4)}</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <Td className="font-semibold text-ink" />
                    <Td className="font-semibold text-ink">Total</Td>
                    <Td />
                    <Td />
                    <Td align="right" className="font-semibold text-ink">
                      {formatGBP(costTotal, 4)}
                    </Td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Audit timeline"
        description={`${audit.length} events, oldest first. Version context records what was in force at each event.`}
        className="mt-4"
        bodyClassName="p-0"
        actions={
          <Link href={`/platform/audit?ref=${encodeURIComponent(s.reference)}`} className="text-xs font-medium text-brand hover:underline">
            Open in audit log
          </Link>
        }
      >
        <div className="max-h-[640px] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Event</Th>
                <Th>Actor</Th>
                <Th>Payload</Th>
                <Th>Versions</Th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="align-top">
                  <Td className="tabular whitespace-nowrap">{formatTimeSec(a.timestamp)}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-ink">{a.eventType}</Td>
                  <Td className="whitespace-nowrap">
                    {ACTOR_LABELS[a.actorType]}
                    <div className="text-xs text-muted">{actorName(a.actorType, a.actorId)}</div>
                  </Td>
                  <Td className="min-w-[240px] text-xs">{summarizePayload(a.payload)}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{versionContext(a.context)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Panel>
    </>
  );
}
