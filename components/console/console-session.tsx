"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Camera,
  CheckCircle2,
  Circle,
  CircleDot,
  FileText,
  Headset,
  Lightbulb,
  LogIn,
  PhoneOff,
  Play,
  RotateCcw,
  Send,
  StickyNote,
  UserCheck,
  XCircle,
} from "lucide-react";
import type { AgentView } from "@/lib/session/projections";
import type { SessionOutcome, WorkflowStep } from "@/lib/domain/types";
import { useEventStream } from "@/lib/client/use-event-stream";
import { CUSTOMER_STATE_LABELS, ESCALATION_REASON_LABELS, humanize } from "@/lib/domain/labels";
import { latestObservations, actionSummary } from "@/lib/session/handover";
import { formatDuration, formatTime, formatTimeSec, formatGBP, secondsBetween } from "@/lib/format";
import { Badge, buttonClass, cx, Dot, KeyValue, Panel } from "@/components/ui/primitives";
import { OwnerBadge, SessionStatusBadge, SeverityBadge, SimulatedTag, OutcomeBadge } from "@/components/domain/badges";
import { LiveVideo } from "./live-video";
import { Filmstrip, ObservationList } from "./evidence";
import { useAgentCommands } from "./use-agent-commands";
import { useAgentId } from "./agent-identity";
import { useNow } from "@/lib/client/use-now";

const CAPTURE_PRESETS = [
  "Please show me the front of the router, nice and close.",
  "Could you show me the cables at the back of the router?",
  "Could you tilt the phone slightly so there's no glare on the lights?",
  "Please show me the wall socket the router is plugged into.",
];

type Tab = "transcript" | "handover" | "audit";

export function ConsoleSession({ id, initial, serverNow }: { id: string; initial: AgentView; serverNow: number }) {
  const { data: view, status } = useEventStream<AgentView>(`/api/sessions/${id}/events`, initial);
  const s = view.state;
  const agentId = useAgentId();
  const cmd = useAgentCommands(id);
  const [tab, setTab] = useState<Tab>("transcript");
  const [selectedFrame, setSelectedFrame] = useState<string>();
  const now = useNow(serverNow);

  const ended = s.session.status === "completed" || s.session.status === "failed";
  const me = s.participants.find((p) => p.userId === agentId && !p.leftAt);
  const humanOwner = s.session.ownerType === "human";
  const iOwn = humanOwner && s.escalation?.assignedUserId === agentId;
  const threshold = 0.75;
  const latest = useMemo(() => latestObservations(s), [s]);
  const frames = s.visualEvents;
  const inspected = frames.find((f) => f.id === selectedFrame) ?? frames.at(-1);
  const step = s.workflow.currentStep ? view.workflow.steps.find((x) => x.key === s.workflow.currentStep) : undefined;
  const duration = s.session.startedAt ? secondsBetween(s.session.startedAt, s.session.endedAt ?? now) : 0;
  const previewActive = !ended && (Boolean(me) || Boolean(s.escalation));

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-3 sm:px-5">
      {/* Session header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/console" className={buttonClass("ghost", "sm")} aria-label="Back to queue">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-ink">Session {s.session.reference}</h1>
              <SessionStatusBadge status={s.session.status} />
              <OwnerBadge owner={s.session.ownerType} />
              {ended && <OutcomeBadge outcome={s.session.outcome} />}
              {view.simulatedProvider && <SimulatedTag />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
              <span>{view.tenantName}</span>
              <span>{s.session.customerLabel}</span>
              <span>
                {view.workflow.name} v{view.workflow.version}
              </span>
              <span>Started {formatTime(s.session.startedAt ?? s.session.createdAt)}</span>
              <span className="tabular flex items-center gap-1">
                <Dot tone={ended ? "neutral" : "ok"} pulse={!ended} /> {formatDuration(duration)}
              </span>
              <span>Customer: {CUSTOMER_STATE_LABELS[s.customerState]}</span>
              <span className="flex items-center gap-1">
                <Dot tone={status === "open" ? "ok" : "warn"} /> {status === "open" ? "Live" : "Reconnecting"}
              </span>
            </div>
          </div>
        </div>
        {!ended && (
          <div className="flex flex-wrap items-center gap-2">
            {!me && (
              <button type="button" className={buttonClass(s.escalation && !humanOwner ? "primary" : "secondary")} disabled={!!cmd.pending} onClick={() => cmd.run({ type: "human.join" })}>
                <LogIn className="size-4" aria-hidden /> Join session
              </button>
            )}
            {!humanOwner && (
              <button type="button" className={buttonClass(me ? "primary" : "secondary")} disabled={!!cmd.pending} onClick={() => cmd.run({ type: "human.take_over" })}>
                <UserCheck className="size-4" aria-hidden /> Take over
              </button>
            )}
            {humanOwner && (
              <button
                type="button"
                className={buttonClass("secondary")}
                disabled={!!cmd.pending || !view.returnToAiAllowed.allowed}
                title={view.returnToAiAllowed.allowed ? "Hand the customer back to the AI workflow" : view.returnToAiAllowed.reason}
                onClick={() => cmd.run({ type: "human.return_to_ai" })}
              >
                <RotateCcw className="size-4" aria-hidden /> Return to AI
              </button>
            )}
            <EndMenu disabled={!!cmd.pending} onEnd={(outcome) => cmd.run({ type: "session.end", outcome })} />
          </div>
        )}
      </div>

      {cmd.error && (
        <div role="alert" className="mb-3 flex items-center justify-between rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {cmd.error}
          <button type="button" className="text-xs font-medium underline" onClick={cmd.clearError}>
            Dismiss
          </button>
        </div>
      )}
      {humanOwner && !ended && !view.returnToAiAllowed.allowed && (
        <p className="mb-3 text-xs text-muted">
          <AlertTriangle className="mr-1 inline size-3.5 text-warn" aria-hidden />
          Return to AI unavailable: {view.returnToAiAllowed.reason}.
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-12">
        {/* Left: video + evidence */}
        <div className="min-w-0 space-y-3 xl:col-span-7">
          <Panel
            title="Customer camera"
            bodyClassName="p-3"
            actions={
              <span className="text-[11px] text-muted">
                {s.media.camera ? "Camera on" : "Camera off"} · {s.media.microphone ? "Mic on" : "Mic muted"} · {humanize(s.media.quality)} connection
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <LiveVideo sessionId={id} active={previewActive} latestFrame={frames.at(-1)} cameraOn={s.media.camera} />
              <div className="flex flex-col gap-2">
                <div className="rounded-md border border-line bg-surface-2 p-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Customer sees</div>
                  <p className="mt-1 text-[13px] text-ink">{s.instruction.text}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    From {s.instruction.from === "human" ? "agent" : s.instruction.from} · {formatTimeSec(s.instruction.at)}
                  </p>
                </div>
                {s.evidenceRequest && (
                  <div className="rounded-md border border-brand/30 bg-brand-soft p-2.5 text-[12px] text-brand-ink">
                    <Camera className="mr-1 inline size-3.5" aria-hidden />
                    Waiting for evidence: <strong>{s.evidenceRequest.checkpoint.replace(/_/g, " ")}</strong> (attempt {s.evidenceRequest.attempt}/{s.evidenceRequest.maxAttempts})
                  </div>
                )}
                <CaptureRequest disabled={ended || !humanOwner} onRequest={(prompt) => cmd.run({ type: "human.request_capture", prompt })} />
              </div>
            </div>
          </Panel>

          <Panel title="Selected evidence" description={`${frames.length} frame(s) — only frames requested by the workflow or an agent are captured`} bodyClassName="p-3">
            <Filmstrip sessionId={id} frames={frames} selected={inspected?.id} onSelect={setSelectedFrame} />
            {inspected && (
              <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-[200px_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/sessions/${id}/frames/${inspected.id}`} alt="Inspected frame" className="aspect-[4/3] w-full rounded-md bg-surface-2 object-cover" />
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-muted">
                    <Badge tone="neutral">{humanize(inspected.triggerType)}</Badge>
                    {inspected.checkpoint && <Badge tone="brand">{inspected.checkpoint.replace(/_/g, " ")}</Badge>}
                    <span>{formatTimeSec(inspected.timestamp)}</span>
                    <span>
                      {inspected.width}×{inspected.height} · {Math.round(inspected.bytes / 1024)} KB
                    </span>
                    <span>{humanize(inspected.processingStatus)}</span>
                  </div>
                  <ObservationList
                    observations={s.observations.filter((o) => o.visualEventId === inspected.id)}
                    frames={frames}
                    threshold={threshold}
                    canReview={!ended && Boolean(me)}
                    onReview={(observationId, verdict) => cmd.run({ type: "human.review_observation", observationId, verdict })}
                    onInspect={setSelectedFrame}
                    emptyText={inspected.processingStatus === "pending" ? "Not analysed (no evidence request was open)" : "Analysing…"}
                  />
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* Right: transcript / handover / audit */}
        <div className="min-w-0 xl:col-span-5">
          <section className="flex h-full max-h-[calc(100vh-150px)] min-h-[520px] flex-col rounded-lg border border-line bg-surface">
            <div role="tablist" aria-label="Session context" className="flex gap-1 border-b border-line px-2 pt-2">
              {(
                [
                  ["transcript", "Transcript"],
                  ["handover", "Handover"],
                  ["audit", `Audit (${s.audit.length})`],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cx("rounded-t-md px-3 py-2 text-[13px] font-medium", tab === key ? "border-b-2 border-brand text-brand" : "text-muted hover:text-ink")}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "transcript" && <Transcript view={view} />}
            {tab === "handover" && <Handover view={view} />}
            {tab === "audit" && <AuditTrail view={view} />}
            {tab === "transcript" && <Composer disabled={ended || !humanOwner} owned={iOwn} onSend={(text) => cmd.run({ type: "human.message", text })} />}
          </section>
        </div>
      </div>

      {/* Lower panels: summary, observations, steps, escalation, next action */}
      <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        <Panel title={<span className="flex items-center gap-1.5"><Bot className="size-4 text-brand" aria-hidden /> AI summary</span>}>
          <p className="text-[13px] leading-relaxed text-ink-2">{view.summary}</p>
          <div className="mt-3">
            <KeyValue
              className="text-[12px]"
              items={[
                ["Customer issue", view.handover.customerIssue],
                ["Current step", step ? `${step.title}` : "—"],
                ["Model", s.session.modelVersion],
                ["Policy", `${s.session.policyId} v${s.session.policyVersion}`],
              ]}
            />
          </div>
        </Panel>

        <Panel title="Visual observations" description="Latest per item, from selected frames">
          <ObservationList
            observations={latest}
            frames={frames}
            threshold={threshold}
            canReview={!ended && Boolean(me)}
            onReview={(observationId, verdict) => cmd.run({ type: "human.review_observation", observationId, verdict })}
            onInspect={setSelectedFrame}
          />
        </Panel>

        <Panel title="Workflow progress" description={`${view.workflow.name} v${view.workflow.version}`}>
          <WorkflowProgress view={view} />
        </Panel>

        <div className="min-w-0 space-y-3">
          {s.escalation ? (
            <section className="rounded-lg border border-danger/30 bg-danger-soft p-4">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
                <AlertTriangle className="size-4" aria-hidden /> Escalation reason
              </h2>
              <p className="mt-1 text-[13px] font-medium text-ink">{ESCALATION_REASON_LABELS[s.escalation.reason]}</p>
              <p className="mt-0.5 text-[12px] text-ink-2">{s.escalation.reasonDetail}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-2">
                <SeverityBadge severity={s.escalation.severity} />
                {s.escalation.mandatoryHuman && <Badge tone="danger">Human must finish</Badge>}
                <span>Requested {formatTime(s.escalation.requestedAt)}</span>
                {s.escalation.acceptedAt ? (
                  <span>
                    Accepted by {s.escalation.assignedUserName} after {formatDuration(secondsBetween(s.escalation.requestedAt, s.escalation.acceptedAt))}
                  </span>
                ) : (
                  <span className="font-semibold text-danger">Waiting {formatDuration(secondsBetween(s.escalation.requestedAt, now))}</span>
                )}
              </div>
            </section>
          ) : (
            <Panel title="Escalation">
              <p className="text-[13px] text-muted">Not escalated. You can still join to monitor or take over.</p>
            </Panel>
          )}
          <section className="rounded-lg border border-brand/30 bg-brand-soft p-4">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink">
              <Lightbulb className="size-4" aria-hidden /> Suggested next action
            </h2>
            <p className="mt-1 text-[13px] text-ink">{view.handover.recommendedNextStep}</p>
            {!ended && !me && (
              <button type="button" className={cx(buttonClass("primary", "sm"), "mt-3")} onClick={() => cmd.run({ type: "human.join" })}>
                Join session
              </button>
            )}
          </section>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel title="Business actions" description="Policy-checked and idempotent; executed outside the live media loop">
          <BusinessActions view={view} disabled={ended || !humanOwner} onRun={(tool) => cmd.run({ type: "human.run_action", tool, params: {} })} />
        </Panel>
        <Panel title={<span className="flex items-center gap-1.5"><StickyNote className="size-4" aria-hidden /> Agent notes</span>} description="Internal — never shown to the customer">
          <Notes view={view} onAdd={(text) => cmd.run({ type: "human.note", text })} />
        </Panel>
      </div>
    </div>
  );
}

function EndMenu({ onEnd, disabled }: { onEnd: (o: SessionOutcome) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const options: [SessionOutcome, string][] = [
    ["resolved_by_human", "Resolved"],
    ["escalated_unresolved", "Unresolved — follow-up needed"],
    ["out_of_scope", "Out of scope"],
  ];
  return (
    <div className="relative">
      <button type="button" className={buttonClass("danger")} disabled={disabled} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <PhoneOff className="size-4" aria-hidden /> End
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 rounded-md border border-line bg-surface p-1 shadow-xl" role="menu">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Record outcome and end</div>
          {options.map(([o, label]) => (
            <button
              key={o}
              type="button"
              role="menuitem"
              className="block w-full rounded px-2 py-1.5 text-left text-[13px] text-ink hover:bg-surface-2"
              onClick={() => {
                setOpen(false);
                onEnd(o);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CaptureRequest({ disabled, onRequest }: { disabled: boolean; onRequest: (p: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="rounded-md border border-line p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onRequest(text.trim());
        setText("");
      }}
    >
      <label htmlFor="capture-prompt" className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Request a view
      </label>
      <select
        className="mt-1 w-full rounded-md border border-line-strong bg-surface px-1.5 py-1 text-[12px]"
        disabled={disabled}
        value=""
        onChange={(e) => e.target.value && onRequest(e.target.value)}
        aria-label="Preset capture requests"
      >
        <option value="">Preset…</option>
        {CAPTURE_PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <div className="mt-1.5 flex gap-1">
        <input
          id="capture-prompt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Take over to request" : "Custom request…"}
          className="h-7 min-w-0 flex-1 rounded-md border border-line-strong px-2 text-[12px]"
        />
        <button type="submit" disabled={disabled || !text.trim()} className={buttonClass("secondary", "sm")} aria-label="Send capture request">
          <Camera className="size-3.5" />
        </button>
      </div>
    </form>
  );
}

function Transcript({ view }: { view: AgentView }) {
  const endRef = useRef<HTMLLIElement>(null);
  const count = view.state.transcript.length;
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [count]);
  return (
    <ol className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
      {view.state.transcript.map((t) => (
        <li key={t.id} className={cx("flex gap-2.5", t.speaker === "system" && "justify-center")}>
          {t.speaker === "system" ? (
            <span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] text-muted">
              {t.text} · {formatTime(t.timestamp)}
            </span>
          ) : (
            <>
              <span
                className={cx(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  t.speaker === "customer" ? "bg-surface-2 text-ink-2" : t.speaker === "ai" ? "bg-brand text-white" : "bg-violet text-white",
                )}
                aria-hidden
              >
                {t.speaker === "customer" ? "C" : t.speaker === "ai" ? "AI" : <Headset className="size-3.5" />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="font-semibold text-ink-2">{t.speaker === "customer" ? "Customer" : t.speakerName}</span>
                  <span>{formatTimeSec(t.timestamp)}</span>
                  {t.intent && <Badge tone="neutral">intent: {t.intent.replace(/_/g, " ")}</Badge>}
                  {t.speaker === "customer" && t.confidence < 0.8 && <Badge tone="warn">low ASR confidence</Badge>}
                </div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink">{t.text}</p>
              </div>
            </>
          )}
        </li>
      ))}
      <li ref={endRef} aria-hidden />
    </ol>
  );
}

function Composer({ disabled, owned, onSend }: { disabled: boolean; owned: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="border-t border-line p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSend(text.trim());
        setText("");
      }}
    >
      <div className="flex gap-2">
        <label htmlFor="agent-message" className="sr-only">
          Message the customer
        </label>
        <input
          id="agent-message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Take over the session to speak to the customer" : "Say something to the customer (shown and spoken on their screen)"}
          className="h-9 min-w-0 flex-1 rounded-md border border-line-strong px-3 text-[13px] disabled:bg-surface-2"
        />
        <button type="submit" disabled={disabled || !text.trim()} className={buttonClass("primary")}>
          <Send className="size-4" aria-hidden /> Send
        </button>
      </div>
      {!disabled && !owned && <p className="mt-1 text-[11px] text-muted">Another agent owns this session.</p>}
    </form>
  );
}

function Handover({ view }: { view: AgentView }) {
  const h = view.handover;
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
      <p className="text-[11px] text-muted">Structured handover package (docs/05 §6) — generated from authoritative session state.</p>
      <KeyValue
        items={[
          ["Customer issue", h.customerIssue],
          ["Workflow", h.workflow],
          ["Escalation", h.reasonForEscalation],
          ["Recommended", h.recommendedNextStep],
        ]}
      />
      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Summary</h3>
        <p className="text-ink-2">{h.sessionSummary}</p>
      </div>
      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Completed steps ({h.completedSteps.length})</h3>
        <ol className="list-decimal space-y-0.5 pl-5 text-ink-2">
          {h.completedSteps.map((c, i) => (
            <li key={`${c.key}-${i}`}>
              {c.title} {c.outcome && <span className="text-muted">— {c.outcome}</span>}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Uncertain items ({h.uncertainItems.length})</h3>
        {h.uncertainItems.length === 0 ? (
          <p className="text-muted">None</p>
        ) : (
          <ul className="space-y-0.5 text-ink-2">
            {h.uncertainItems.map((u) => (
              <li key={u.id}>
                {u.observationText} <span className="text-muted">({u.status.replace(/_/g, " ")}, {Math.round(u.confidence * 100)}%)</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Actions taken ({h.actionsTaken.length})</h3>
        {h.actionsTaken.length === 0 ? (
          <p className="text-muted">None</p>
        ) : (
          <ul className="space-y-0.5 text-ink-2">
            {h.actionsTaken.map((a, i) => (
              <li key={i}>
                {a.summary} <span className="text-muted">({a.status})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="rounded-md border border-line bg-surface-2 p-2">
        <summary className="cursor-pointer text-[12px] font-medium text-ink-2">Raw handover payload (JSON)</summary>
        <pre className="mt-2 overflow-x-auto text-[11px] text-ink-2">{JSON.stringify(h, null, 2)}</pre>
      </details>
    </div>
  );
}

function AuditTrail({ view }: { view: AgentView }) {
  const events = [...view.state.audit].reverse();
  return (
    <ol className="flex-1 divide-y divide-line overflow-y-auto">
      {events.map((e) => (
        <li key={e.id} className="px-3 py-2 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <code className="font-mono text-[11px] font-semibold text-ink">{e.eventType}</code>
            <span className="tabular text-[11px] text-muted">{formatTimeSec(e.timestamp)}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {e.actorType} · {e.actorId}
          </div>
          {Object.keys(e.payload).length > 0 && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-ink-2" title={JSON.stringify(e.payload)}>
              {JSON.stringify(e.payload)}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function WorkflowProgress({ view }: { view: AgentView }) {
  const s = view.state;
  const statusOf = (key: string) => {
    const recs = s.workflow.history.filter((h) => h.stepKey === key);
    return recs.at(-1);
  };
  const visited = new Set(s.workflow.history.map((h) => h.stepKey));
  const steps = view.workflow.steps.filter((st) => visited.has(st.key) || isMainPath(st));
  return (
    <ol className="space-y-1.5">
      {steps.map((st) => {
        const rec = statusOf(st.key);
        const current = s.workflow.currentStep === st.key && rec?.status === "active";
        const icon =
          rec?.status === "completed" ? (
            <CheckCircle2 className="size-4 text-ok" aria-label="Completed" />
          ) : rec?.status === "failed" ? (
            <XCircle className="size-4 text-danger" aria-label="Failed" />
          ) : current || rec?.status === "active" ? (
            <CircleDot className="size-4 text-brand" aria-label="Current" />
          ) : (
            <Circle className="size-4 text-line-strong" aria-label="Not reached" />
          );
        return (
          <li key={st.key} className={cx("flex items-start gap-2 text-[13px]", !rec && "text-muted")}>
            <span className="mt-0.5">{icon}</span>
            <span className="min-w-0">
              <span className={cx(current ? "font-semibold text-ink" : rec ? "text-ink-2" : "")}>{st.title}</span>
              {rec?.outcome && <span className="block text-[11px] text-muted">{rec.outcome}</span>}
              {s.workflow.attempts[st.key] > 1 && <span className="block text-[11px] text-warn">{s.workflow.attempts[st.key]} capture attempts</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function isMainPath(st: WorkflowStep): boolean {
  return st.type !== "human_escalation" && !st.key.startsWith("guide_power_supply") && !st.key.startsWith("guide_reseat");
}

function BusinessActions({ view, disabled, onRun }: { view: AgentView; disabled: boolean; onRun: (tool: string) => void }) {
  const [tool, setTool] = useState("");
  const actions = view.state.toolActions;
  return (
    <div className="space-y-3">
      {actions.length === 0 ? (
        <p className="text-[13px] text-muted">No actions yet.</p>
      ) : (
        <ul className="divide-y divide-line text-[13px]">
          {actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-medium text-ink">{a.toolName.replace(/_/g, " ")}</span>{" "}
                <span className="text-muted">by {a.requestedBy === "ai" ? "AI" : "agent"}</span>
                <span className="block text-[12px] text-ink-2">{a.status === "completed" ? actionSummary(a.toolName, a.result) : a.error ?? "In progress…"}</span>
                <span className="block truncate font-mono text-[10px] text-muted" title={a.idempotencyKey}>
                  key {a.idempotencyKey}
                </span>
              </span>
              <Badge tone={a.status === "completed" ? "ok" : a.status === "running" || a.status === "requested" ? "brand" : a.status === "denied" ? "neutral" : "danger"}>
                {a.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (tool) onRun(tool);
          setTool("");
        }}
      >
        <label htmlFor="run-action" className="sr-only">
          Business action
        </label>
        <select id="run-action" value={tool} onChange={(e) => setTool(e.target.value)} disabled={disabled} className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-[13px]">
          <option value="">{disabled ? "Take over to run actions" : "Choose an action…"}</option>
          {view.allowedHumanTools.map((t) => (
            <option key={t.tool} value={t.tool}>
              {t.tool.replace(/_/g, " ")} · {t.risk} risk{t.mode === "human_only" ? " · human-only" : ""}
            </option>
          ))}
        </select>
        <button type="submit" disabled={disabled || !tool} className={buttonClass("secondary")}>
          <Play className="size-4" aria-hidden /> Run
        </button>
      </form>
      <p className="text-[11px] text-muted">
        <FileText className="mr-1 inline size-3" aria-hidden />
        Session cost so far {formatGBP(view.state.session.costTotal, 3)} (estimated)
      </p>
    </div>
  );
}

function Notes({ view, onAdd }: { view: AgentView; onAdd: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div>
      <ul className="mb-3 space-y-2">
        {view.state.notes.length === 0 && <li className="text-[13px] text-muted">No notes yet.</li>}
        {view.state.notes.map((n) => (
          <li key={n.id} className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
            <div className="text-[11px] text-muted">
              {n.authorName} · {formatTime(n.timestamp)}
            </div>
            <p className="text-ink">{n.text}</p>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onAdd(text.trim());
          setText("");
        }}
      >
        <label htmlFor="note" className="sr-only">
          Add note
        </label>
        <input id="note" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an internal note…" className="h-9 min-w-0 flex-1 rounded-md border border-line-strong px-3 text-[13px]" />
        <button type="submit" disabled={!text.trim()} className={buttonClass("secondary")}>
          Add
        </button>
      </form>
    </div>
  );
}
