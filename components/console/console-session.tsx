"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Camera,
  CheckCircle2,
  ChevronDown,
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
import { useAgentStream } from "@/lib/client/use-transport";
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
  const { data: view, status, transport } = useAgentStream(id, initial);
  const frameSrc = (f: { id: string; frameReference: string }) => transport?.frameUrl(id, f) ?? "";
  const s = view.state;
  const agentId = useAgentId();
  const cmd = useAgentCommands(id, transport);
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
    <div className={cx("mx-auto max-w-[1600px] px-3 py-3 sm:px-5", !ended && "pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-3")}>
      {/* Session header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-start gap-x-2 sm:items-center sm:gap-x-4">
          <Link href="/console" className={cx(buttonClass("ghost", "sm"), "size-11 shrink-0 px-0 lg:size-auto lg:h-7 lg:px-2.5")} aria-label="Back to queue">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-1.5 sm:pt-0">
              <h1 className="text-base font-semibold tracking-tight text-ink sm:text-lg">Session {s.session.reference}</h1>
              <SessionStatusBadge status={s.session.status} />
              <OwnerBadge owner={s.session.ownerType} />
              {ended && <OutcomeBadge outcome={s.session.outcome} />}
              {view.simulatedProvider && <SimulatedTag />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted sm:mt-0.5">
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
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
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

      {!ended && (
        <MobileActionBar
          joined={Boolean(me)}
          humanOwner={humanOwner}
          escalated={Boolean(s.escalation)}
          pending={!!cmd.pending}
          returnAllowed={view.returnToAiAllowed.allowed}
          onRun={(command) => cmd.run(command)}
        />
      )}
      {s.escalation && !ended && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] xl:hidden">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-ink">{ESCALATION_REASON_LABELS[s.escalation.reason]}</p>
            <p className="text-[12px] text-ink-2">
              {s.escalation.acceptedAt ? `Accepted by ${s.escalation.assignedUserName}` : `Waiting ${formatDuration(secondsBetween(s.escalation.requestedAt, now))} for an agent`}
            </p>
          </div>
        </div>
      )}
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
          <Fold
            title="Customer camera"
            bodyClassName="p-3"
            actions={
              <span className="text-[11px] text-muted">
                {s.media.camera ? "Camera on" : "Camera off"} · {s.media.microphone ? "Mic on" : "Mic muted"} · {humanize(s.media.quality)} connection
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <LiveVideo sessionId={id} transport={transport} active={previewActive} latestFrame={frames.at(-1)} cameraOn={s.media.camera} frameSrc={frameSrc} />
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
          </Fold>

          <Fold
            title="Selected evidence"
            description={`${frames.length} frame(s) — only frames requested by the workflow or an agent are captured`}
            bodyClassName="p-3"
            defaultOpen={false}
            badge={frames.length || undefined}
          >
            <Filmstrip frames={frames} selected={inspected?.id} onSelect={setSelectedFrame} frameSrc={frameSrc} />
            {inspected && (
              <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-[200px_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frameSrc(inspected)} alt="Inspected frame" className="aspect-[4/3] w-full rounded-md bg-surface-2 object-cover" />
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
          </Fold>
        </div>

        {/* Right: transcript / handover / audit */}
        <div className="min-w-0 xl:col-span-5">
          <FoldShell
            title="Conversation"
            hideTitleOnDesktop
            badge={s.transcript.length || undefined}
            className="flex flex-col lg:h-full lg:max-h-[calc(100vh-150px)] lg:min-h-[520px]"
          >
            <div className="flex h-[min(70dvh,560px)] flex-col lg:h-auto lg:min-h-0 lg:flex-1">
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
            </div>
          </FoldShell>
        </div>
      </div>

      {/* Lower panels: summary, observations, steps, escalation, next action */}
      <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        <Fold title={<span className="flex items-center gap-1.5"><Bot className="size-4 text-brand" aria-hidden /> AI summary</span>}>
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
        </Fold>

        <Fold title="Visual observations" description="Latest per item, from selected frames" defaultOpen={false} badge={latest.length || undefined}>
          <ObservationList
            observations={latest}
            frames={frames}
            threshold={threshold}
            canReview={!ended && Boolean(me)}
            onReview={(observationId, verdict) => cmd.run({ type: "human.review_observation", observationId, verdict })}
            onInspect={setSelectedFrame}
          />
        </Fold>

        <Fold title="Workflow progress" description={`${view.workflow.name} v${view.workflow.version}`} defaultOpen={false} badge={step?.title}>
          <WorkflowProgress view={view} />
        </Fold>

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
        <Fold
          title="Business actions"
          description="Policy-checked and idempotent; executed outside the live media loop"
          defaultOpen={false}
          badge={s.toolActions.length || undefined}
        >
          <BusinessActions view={view} disabled={ended || !humanOwner} onRun={(tool) => cmd.run({ type: "human.run_action", tool, params: {} })} />
        </Fold>
        <Fold
          title={<span className="flex items-center gap-1.5"><StickyNote className="size-4" aria-hidden /> Agent notes</span>}
          description="Internal — never shown to the customer"
          defaultOpen={false}
          badge={s.notes.length || undefined}
        >
          <Notes view={view} onAdd={(text) => cmd.run({ type: "human.note", text })} />
        </Fold>
      </div>
    </div>
  );
}

function EndMenu({ onEnd, disabled, up, className }: { onEnd: (o: SessionOutcome) => void; disabled: boolean; up?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const options: [SessionOutcome, string][] = [
    ["resolved_by_human", "Resolved"],
    ["escalated_unresolved", "Unresolved — follow-up needed"],
    ["out_of_scope", "Out of scope"],
  ];
  return (
    <div className={cx("relative", className)}>
      <button type="button" className={cx(buttonClass("danger"), up && "h-11 w-full")} disabled={disabled} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <PhoneOff className="size-4" aria-hidden /> End
      </button>
      {open && (
        <div className={cx("absolute right-0 z-30 w-60 rounded-md border border-line bg-surface p-1 shadow-xl", up ? "bottom-full mb-2" : "mt-1")} role="menu">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Record outcome and end</div>
          {options.map(([o, label]) => (
            <button
              key={o}
              type="button"
              role="menuitem"
              className={cx("block w-full rounded px-2 text-left text-[13px] text-ink hover:bg-surface-2", up ? "py-3" : "py-1.5")}
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
        className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-1.5 text-[13px] lg:h-auto lg:py-1 lg:text-[12px]"
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
          className="h-10 min-w-0 flex-1 rounded-md border border-line-strong px-2 text-[13px] lg:h-7 lg:text-[12px]"
        />
        <button type="submit" disabled={disabled || !text.trim()} className={cx(buttonClass("secondary", "sm"), "size-10 lg:h-7 lg:w-auto")} aria-label="Send capture request">
          <Camera className="size-3.5" />
        </button>
      </div>
    </form>
  );
}

function Transcript({ view }: { view: AgentView }) {
  const listRef = useRef<HTMLOListElement>(null);
  const count = view.state.transcript.length;
  // Scroll only the transcript itself: scrollIntoView would also scroll the
  // page (and any page embedding the console).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <ol ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
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
          className="h-11 min-w-0 flex-1 rounded-md border border-line-strong px-3 text-[14px] disabled:bg-surface-2 lg:h-9 lg:text-[13px]"
        />
        <button type="submit" disabled={disabled || !text.trim()} className={cx(buttonClass("primary"), "h-11 lg:h-9")}>
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
                {a.outcome?.mode === "http" && (
                  <span className="block text-[11px] text-muted">
                    Client system · {a.outcome.latencyMs.toLocaleString("en-GB")} ms{a.outcome.externalRef ? ` · ref ${a.outcome.externalRef}` : ""}
                  </span>
                )}
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

/**
 * A console panel that folds away on phones and tablets (< lg) and is always
 * open on desktop, where it looks like a regular Panel. On small screens the
 * heading doubles as the toggle.
 */
function FoldShell({
  title,
  description,
  actions,
  badge,
  defaultOpen = true,
  hideTitleOnDesktop,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  hideTitleOnDesktop?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx("min-w-0 rounded-lg border border-line bg-surface", className)}>
      <header className={cx("flex items-stretch justify-between gap-3 border-line", open ? "border-b" : "lg:border-b", hideTitleOnDesktop && "lg:hidden")}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-4 py-2.5 text-left lg:pointer-events-none lg:min-h-0 lg:items-start"
        >
          <span className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
            {description && <span className="mt-0.5 hidden text-xs text-muted lg:block">{description}</span>}
          </span>
          {badge !== undefined && (
            <span className="max-w-[50%] shrink-0 truncate rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2 ring-1 ring-line lg:hidden">{badge}</span>
          )}
          <ChevronDown className={cx("size-4 shrink-0 text-muted transition-transform lg:hidden", open && "rotate-180")} aria-hidden />
        </button>
        {actions && <div className="hidden shrink-0 items-center gap-2 pr-4 lg:flex">{actions}</div>}
      </header>
      <div className={open ? "contents" : "hidden lg:contents"}>{children}</div>
    </section>
  );
}

function Fold({ bodyClassName, children, ...props }: Omit<React.ComponentProps<typeof FoldShell>, "className" | "hideTitleOnDesktop"> & { bodyClassName?: string }) {
  return (
    <FoldShell {...props}>
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </FoldShell>
  );
}

/** Phones and tablets: the session's main controls stay at the bottom of the screen. */
function MobileActionBar({
  joined,
  humanOwner,
  escalated,
  pending,
  returnAllowed,
  onRun,
}: {
  joined: boolean;
  humanOwner: boolean;
  escalated: boolean;
  pending: boolean;
  returnAllowed: boolean;
  onRun: (command: Record<string, unknown>) => void;
}) {
  return (
    <nav
      aria-label="Session actions"
      className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-surface/95 px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_-12px_rgba(11,27,51,0.35)] backdrop-blur lg:hidden"
    >
      {!joined && (
        <button type="button" className={cx(buttonClass(escalated && !humanOwner ? "primary" : "secondary"), "h-11 flex-1 px-2")} disabled={pending} onClick={() => onRun({ type: "human.join" })}>
          <LogIn className="size-4" aria-hidden /> Join
        </button>
      )}
      {!humanOwner && (
        <button type="button" className={cx(buttonClass(joined ? "primary" : "secondary"), "h-11 flex-1 px-2")} disabled={pending} onClick={() => onRun({ type: "human.take_over" })}>
          <UserCheck className="size-4" aria-hidden /> Take over
        </button>
      )}
      {humanOwner && (
        <button type="button" className={cx(buttonClass("secondary"), "h-11 flex-1 px-2")} disabled={pending || !returnAllowed} onClick={() => onRun({ type: "human.return_to_ai" })}>
          <RotateCcw className="size-4" aria-hidden /> Return to AI
        </button>
      )}
      <EndMenu up className="flex-1" disabled={pending} onEnd={(outcome) => onRun({ type: "session.end", outcome })} />
    </nav>
  );
}
