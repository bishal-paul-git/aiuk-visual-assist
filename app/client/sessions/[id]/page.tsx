import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Headset, ImageOff, Info, User as UserIcon } from "lucide-react";
import { clientScope, DEFAULT_CLIENT } from "@/lib/server/client-data";
import { staticSafeSearchParams } from "@/lib/server/platform-data";
import { getRuntime } from "@/lib/server/runtime";
import { frameSrc } from "@/lib/media/frame-src";
import type { Speaker } from "@/lib/domain/types";
import { humanize } from "@/lib/domain/labels";
import { actionSummary, buildHandover, buildSummary } from "@/lib/session/handover";
import { formatDateTime, formatDuration, formatTimeSec } from "@/lib/format";
import { Badge, EmptyState, KeyValue, PageHeader, Panel, Stat, Table, Td, Th, buttonClass, type Tone } from "@/components/ui/primitives";
import { ConfidenceMeter, EscalationReasonBadge, ObservationStatusBadge, OutcomeBadge, OwnerBadge, SessionStatusBadge } from "@/components/domain/badges";
import { PortalShell, portalHref } from "@/components/client/portal-shell";
import { consolePath } from "@/lib/paths";

const LIVE_STATUSES = new Set(["created", "awaiting_consent", "active", "escalated", "human_active"]);
const SPEAKER_LABEL: Record<Speaker, string> = { customer: "Customer", ai: "AI", human_agent: "Agent", system: "System" };
const SPEAKER_TONE: Record<Speaker, Tone> = { customer: "neutral", ai: "brand", human_agent: "violet", system: "neutral" };
const SPEAKER_ICON: Record<Speaker, React.ReactNode> = {
  customer: <UserIcon className="size-3.5" aria-hidden />,
  ai: <Bot className="size-3.5" aria-hidden />,
  human_agent: <Headset className="size-3.5" aria-hidden />,
  system: <Info className="size-3.5" aria-hidden />,
};
const HOW_RAN = { builtin: "Recorded by Visual Assist", http: "Sent to your system", simulated: "Simulated" } as const;
const STATUS_TONE: Record<string, Tone> = { completed: "ok", failed: "danger", denied: "danger", running: "brand", requested: "neutral", duplicate_blocked: "warn" };

/** Static demo: prerender the default client's seeded sessions. */
export async function generateStaticParams() {
  return getRuntime()
    .summaries({ tenantId: DEFAULT_CLIENT })
    .map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Session ${id.replace(/^ses_/, "")}` };
}

export default async function ClientSessionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const { id } = await params;
  const { org } = await staticSafeSearchParams(searchParams);
  const scope = await clientScope(`/client/sessions/${id}`, org);
  const entry = scope.rt.get(id);
  // Another client's session is reported as not found, not forbidden, so its existence does not leak.
  if (!entry || entry.state.session.tenantId !== scope.tenant.id) notFound();

  const { state, workflow } = entry;
  const s = state.session;
  const summary = buildSummary(state);
  const handover = buildHandover(state, workflow);
  const isLive = entry.live && LIVE_STATUSES.has(s.status);
  const start = s.startedAt ? Date.parse(s.startedAt) : undefined;
  const durationSec = start ? ((s.endedAt ? Date.parse(s.endedAt) : Date.parse(state.audit.at(-1)?.timestamp ?? s.startedAt!)) - start) / 1000 : NaN;
  const done = state.toolActions.filter((a) => a.status === "completed").length;
  const scripted = Boolean(s.scenario);
  const evidencePurged = Boolean(state.retention?.evidencePurgedAt);

  return (
    <PortalShell scope={scope} active="sessions">
      <div className="mb-3">
        <Link href={portalHref(scope, "/client/sessions")} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
          <ArrowLeft className="size-3" aria-hidden /> All sessions
        </Link>
      </div>
      <PageHeader
        title={s.reference}
        description={`${s.workflowName} · ${humanize(s.channel)} · ${scripted ? `Scripted scenario (${s.scenario})` : "Live AI"}`}
        meta={
          <>
            <SessionStatusBadge status={s.status} />
            <OutcomeBadge outcome={s.outcome} />
            <OwnerBadge owner={s.ownerType} />
            {s.escalationReason && <EscalationReasonBadge reason={s.escalationReason} />}
          </>
        }
        actions={
          isLive && scope.allows("session.join") ? (
            <Link href={consolePath(s.id)} className={buttonClass("primary", "sm")}>
              Open in the agent console
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Started" value={<span className="text-lg">{formatDateTime(s.startedAt ?? s.createdAt)}</span>} hint={s.endedAt ? `Ended ${formatDateTime(s.endedAt)}` : isLive ? "Still running" : undefined} />
        <Stat label="Time" value={Number.isFinite(durationSec) ? formatDuration(durationSec) : "—"} />
        <Stat label="Photos checked" value={state.visualEvents.length} hint={`${state.observations.length} readings`} />
        <Stat label="Not sure about" value={handover.uncertainItems.length} tone={handover.uncertainItems.length ? "warn" : undefined} hint="Readings below the confidence needed" />
        <Stat label="Business actions" value={state.toolActions.length} hint={`${done} completed`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="What happened" className="xl:col-span-2">
          <p className="text-sm text-ink">{summary}</p>
          <KeyValue
            className="mt-4"
            items={[
              ["Customer's problem", handover.customerIssue],
              [
                "Steps completed",
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
                  "None yet"
                ),
              ],
              ["If a person was needed", handover.reasonForEscalation],
              ["Suggested next step", handover.recommendedNextStep],
            ]}
          />
        </Panel>
        <Panel title="How this was run">
          <KeyValue
            items={[
              ["AI", scripted ? "Scripted scenario: the readings below are pre-set, not from a real photo." : "Live AI read the photos the customer showed."],
              ["Workflow", `${s.workflowName} version ${s.workflowVersion}`],
              ["Customer", s.customerLabel],
              ["Consent", state.consent ? `Agreed ${formatDateTime(state.consent.acceptedAt)}` : "Not yet agreed"],
            ]}
          />
        </Panel>
      </div>

      <Panel title="Conversation" description={`${state.transcript.length} message${state.transcript.length === 1 ? "" : "s"}`} className="mt-4" bodyClassName="max-h-[520px] overflow-y-auto p-0">
        {state.transcript.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Nothing said yet.</p>
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
                </div>
                <p className="mt-1 text-sm text-ink">{t.text}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel
        title="What the AI saw"
        description={scripted ? "Pre-set readings for this scripted scenario" : "Each reading comes with how sure the AI was"}
        className="mt-4"
      >
        {state.visualEvents.length === 0 ? (
          <EmptyState title={evidencePurged ? "Photos deleted" : "No photos yet"} icon={<ImageOff className="size-5" aria-hidden />}>
            {evidencePurged ? "The photos from this session were deleted after your retention period. The readings are kept." : "The AI keeps a photo only when it needs one to answer a question."}
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {state.visualEvents.map((ve, i) => {
              const obs = state.observations.filter((o) => o.visualEventId === ve.id);
              return (
                <li key={ve.id} className="grid gap-4 border-b border-line pb-4 last:border-b-0 last:pb-0 md:grid-cols-[220px_1fr]">
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={frameSrc(s.id, ve)}
                      alt={`Photo ${i + 1}${ve.checkpoint ? ` for ${ve.checkpoint}` : ""}`}
                      width={ve.width}
                      height={ve.height}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-md border border-line bg-surface-2 object-cover"
                    />
                    <figcaption className="mt-1 text-xs text-muted">
                      Photo {i + 1} · {formatTimeSec(ve.timestamp)}
                      {ve.checkpoint ? ` · ${humanize(ve.checkpoint)}` : ""}
                    </figcaption>
                  </figure>
                  <div className="min-w-0">
                    {obs.length === 0 ? (
                      <p className="text-sm text-muted">No readings from this photo.</p>
                    ) : (
                      <Table className="rounded-md border border-line">
                        <thead>
                          <tr>
                            <Th>What the AI read</Th>
                            <Th>How sure</Th>
                            <Th>Checked by a person</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {obs.map((o) => (
                            <tr key={o.id}>
                              <Td>
                                <div className="text-ink">{o.observationText}</div>
                                <div className="mt-0.5">
                                  <ObservationStatusBadge status={o.status} />
                                </div>
                              </Td>
                              <Td>
                                <ConfidenceMeter value={o.confidence} threshold={workflow.defaultConfidenceThreshold} compact />
                              </Td>
                              <Td className="text-xs">
                                {o.humanReview ? <Badge tone={o.humanReview.verdict === "confirmed" ? "ok" : "danger"}>{o.humanReview.verdict === "confirmed" ? "Confirmed" : "Rejected"}</Badge> : <span className="text-muted">Not reviewed</span>}
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

      <Panel title="Business actions" description="What the AI or the agent did in your systems during this session" className="mt-4" bodyClassName="p-0">
        {state.toolActions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{isLive ? "None yet." : "No business actions were needed."}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Action</Th>
                <Th>Result</Th>
                <Th>How it ran</Th>
                <Th>Reference</Th>
                <Th>By</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {state.toolActions.map((a) => (
                <tr key={a.id} className="align-top">
                  <Td>
                    <div className="font-medium text-ink">{humanize(a.toolName)}</div>
                    <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{humanize(a.status)}</Badge>
                  </Td>
                  <Td className="max-w-72 text-xs text-ink-2">{a.status === "completed" ? actionSummary(a.toolName, a.result) : (a.error ?? "—")}</Td>
                  <Td className="text-xs">{a.outcome ? HOW_RAN[a.outcome.mode] : "Simulated"}</Td>
                  <Td className="font-mono text-xs">{a.outcome?.externalRef ?? "—"}</Td>
                  <Td className="text-xs">{a.requestedBy === "ai" ? "AI" : "Agent"}</Td>
                  <Td className="tabular whitespace-nowrap text-xs">{formatTimeSec(a.completedAt ?? a.startedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </PortalShell>
  );
}
