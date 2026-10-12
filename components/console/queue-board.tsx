"use client";

import Link from "next/link";
import { useNow } from "@/lib/client/use-now";
import { Bot, Headset, Hourglass, Radio } from "lucide-react";
import type { SessionSummaryView } from "@/lib/session/projections";
import { useLiveSessions } from "@/lib/client/use-transport";
import { consolePath } from "@/lib/client/transport";
import { CUSTOMER_STATE_LABELS } from "@/lib/domain/labels";
import { formatDuration, formatMinutes, formatRelative } from "@/lib/format";
import { Badge, Dot, EmptyState, cx } from "@/components/ui/primitives";
import { EscalationReasonBadge, OutcomeBadge, SeverityBadge } from "@/components/domain/badges";

const SLA_SEC = 60;

export function QueueBoard({ initial, serverNow }: { initial: SessionSummaryView[]; serverNow: number }) {
  const { data: sessions, status } = useLiveSessions(initial);
  const now = useNow(serverNow);

  const waiting = sessions.filter((s) => s.status === "escalated").sort((a, b) => a.escalation!.requestedAt.localeCompare(b.escalation!.requestedAt));
  const human = sessions.filter((s) => s.status === "human_active");
  const ai = sessions.filter((s) => s.status === "active" || s.status === "awaiting_consent");
  const ended = sessions.filter((s) => s.status === "completed" || s.status === "failed").slice(0, 8);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Live queue</h1>
          <p className="mt-1 text-sm text-muted">Northline Broadband · Broadband Support L1 &amp; Network Specialists L2</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
          <Dot tone={status === "open" ? "ok" : "warn"} pulse={status !== "open"} /> {status === "open" ? "Live updates" : "Reconnecting…"}
        </span>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Counter icon={<Hourglass className="size-4" />} label="Waiting for a human" value={waiting.length} tone={waiting.some((w) => (now - Date.parse(w.escalation!.requestedAt)) / 1000 > SLA_SEC) ? "warn" : "neutral"} />
        <Counter icon={<Headset className="size-4" />} label="With a human" value={human.length} />
        <Counter icon={<Bot className="size-4" />} label="AI handling" value={ai.length} />
      </div>

      <section aria-labelledby="waiting-h" className="mb-6">
        <h2 id="waiting-h" className="mb-2 text-[13px] font-semibold text-ink">
          Waiting for a human <span className="text-muted">({waiting.length})</span>
        </h2>
        {waiting.length === 0 ? (
          <EmptyState title="Nobody is waiting">Escalations appear here instantly, with the full AI handover.</EmptyState>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {waiting.map((s) => {
              const wait = (now - Date.parse(s.escalation!.requestedAt)) / 1000;
              const breach = wait > SLA_SEC;
              return (
                <li key={s.id}>
                  <Link
                    href={consolePath(s.id)}
                    className={cx("block rounded-lg border bg-surface p-3 hover:border-brand", breach ? "border-warn/60" : "border-line")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink">{s.reference}</span>
                          <span className="text-xs text-muted">{s.customerLabel}</span>
                          <SeverityBadge severity={s.escalation!.severity} />
                          {s.escalation!.mandatoryHuman && <Badge tone="danger">Human must finish</Badge>}
                        </div>
                        <div className="mt-1.5">
                          <EscalationReasonBadge reason={s.escalation!.reason} />
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs text-ink-2">{s.escalation!.reasonDetail}</p>
                        {s.issue && <p className="mt-1 line-clamp-1 text-xs text-muted">“{s.issue}”</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={cx("tabular text-lg font-semibold", breach ? "text-warn" : "text-ink")}>{formatDuration(wait)}</div>
                        <div className="text-[11px] text-muted">{breach ? "Over 60s target" : "waiting"}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 border-t border-line pt-2 text-[11px] text-muted">
                      <span>{s.workflowName} v{s.workflowVersion}</span>
                      <span>{s.completedSteps} steps done</span>
                      <span>{s.frames} frames</span>
                      {s.uncertain > 0 && <span className="font-medium text-warn">{s.uncertain} uncertain</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SessionList title="With a human" sessions={human} now={now} render={(s) => <span className="text-xs text-ink-2">{s.escalation?.assignedUserName ?? "—"}</span>} />
        <SessionList
          title="AI handling (monitor)"
          sessions={ai}
          now={now}
          render={(s) => (
            <span className="text-xs text-ink-2">
              {s.currentStepTitle ?? "—"} · <span className="text-muted">{CUSTOMER_STATE_LABELS[s.customerState]}</span>
            </span>
          )}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Recently ended</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {ended.length === 0 && <li className="px-3 py-3 text-xs text-muted">No sessions ended yet.</li>}
          {ended.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <Link href={consolePath(s.id)} className="flex min-h-10 items-center font-medium text-brand hover:underline sm:min-h-0">
                {s.reference}
              </Link>
              <OutcomeBadge outcome={s.outcome} />
              <span className="text-xs text-muted">{formatRelative(s.endedAt, now)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Counter({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "warn" | "neutral" }) {
  return (
    <div className={cx("flex flex-col items-start gap-2 rounded-lg border bg-surface px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4", tone === "warn" ? "border-warn/50" : "border-line")}>
      <span className={cx("flex size-7 items-center justify-center rounded-md sm:size-8", tone === "warn" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2")} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="tabular text-xl font-semibold text-ink">{value}</div>
        <div className="text-[11px] leading-tight text-muted sm:text-xs">{label}</div>
      </div>
    </div>
  );
}

function SessionList({ title, sessions, now, render }: { title: string; sessions: SessionSummaryView[]; now: number; render: (s: SessionSummaryView) => React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold text-ink">
        {title} <span className="text-muted">({sessions.length})</span>
      </h2>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {sessions.length === 0 && <li className="px-3 py-3 text-xs text-muted">None right now.</li>}
        {sessions.map((s) => (
          <li key={s.id}>
            <Link href={consolePath(s.id)} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-2">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <Radio className="size-3.5 text-ok" aria-hidden />
                  <span className="font-medium text-ink">{s.reference}</span>
                  <span className="text-xs text-muted">{s.customerLabel}</span>
                </span>
                <span className="mt-0.5 block truncate">{render(s)}</span>
              </span>
              <span className="tabular shrink-0 text-xs text-muted">{formatMinutes((now - Date.parse(s.startedAt ?? s.createdAt)) / 1000)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
