"use client";

import Link from "next/link";
import { consolePath, getTransport, STATIC_DEMO } from "@/lib/client/transport";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, CheckCircle2, Clock, Headset, Radio, ShieldAlert, WifiOff } from "lucide-react";
import type { SessionSummaryView } from "@/lib/session/projections";
import { CUSTOMER_STATE_LABELS, humanize } from "@/lib/domain/labels";
import { formatDuration, formatGBP, formatTime, formatTimeSec } from "@/lib/format";
import { Badge, Dot, Panel, Stat, Table, Td, Th, type Tone } from "@/components/ui/primitives";
import { EscalationReasonBadge, OutcomeBadge, SessionStatusBadge, SeverityBadge, SimulatedTag } from "@/components/domain/badges";

type Conn = "connecting" | "live" | "reconnecting";

const ENDED = new Set(["completed", "failed"]);
const AI_GROUP = new Set(["active", "created", "awaiting_consent"]);

/** Queue wait thresholds (seconds) aligned with the L1 target answer time. */
const WAIT_WARN = 60;
const WAIT_BREACH = 180;

function secs(fromIso: string | undefined, now: number): number {
  return fromIso ? Math.max(0, (now - Date.parse(fromIso)) / 1000) : NaN;
}

function SessionLinks({ id }: { id: string }) {
  return (
    <div className="flex items-center justify-end gap-3 whitespace-nowrap text-xs font-medium">
      <Link href={consolePath(id)} className="text-brand hover:underline">
        Console
      </Link>
      {/* The static demo prerenders detail pages only for build-time sessions. */}
      {!STATIC_DEMO && (
        <Link href={`/platform/sessions/${id}`} className="text-brand hover:underline">
          Detail
        </Link>
      )}
    </div>
  );
}

function SessionCell({ s, tenants }: { s: SessionSummaryView; tenants: Record<string, string> }) {
  return (
    <>
      <Link href={STATIC_DEMO ? consolePath(s.id) : `/platform/sessions/${s.id}`} className="font-medium text-brand hover:underline">
        {s.reference}
      </Link>
      <div className="text-xs text-muted">
        {s.customerLabel} · {tenants[s.tenantId] ?? s.tenantId}
      </div>
    </>
  );
}

function WaitTime({ seconds }: { seconds: number }) {
  const tone: Tone = seconds >= WAIT_BREACH ? "danger" : seconds >= WAIT_WARN ? "warn" : "neutral";
  const label = seconds >= WAIT_BREACH ? "Over target" : seconds >= WAIT_WARN ? "Near target" : undefined;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={tone === "danger" ? "tabular font-semibold text-danger" : tone === "warn" ? "tabular font-semibold text-warn" : "tabular font-medium text-ink"}>
        {formatDuration(seconds)}
      </span>
      {label && (
        <Badge tone={tone} icon={<Clock className="size-3" aria-hidden />}>
          {label}
        </Badge>
      )}
    </div>
  );
}

function GroupPanel({
  title,
  description,
  count,
  icon,
  empty,
  children,
}: {
  title: string;
  description: string;
  count: number;
  icon: ReactNode;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {icon}
          {title}
          <Badge tone="neutral" className="tabular">
            {count}
          </Badge>
        </span>
      }
      description={description}
      bodyClassName="p-0"
    >
      {count === 0 ? <p className="px-4 py-6 text-sm text-muted">{empty}</p> : children}
    </Panel>
  );
}

export function LiveSessionsBoard({
  initial,
  recentEnded,
  serverNow,
  tenants,
}: {
  /** Live sessions at render time (same shape the SSE stream sends). */
  initial: SessionSummaryView[];
  /** Recently ended historical sessions from the server, merged with live ones that end. */
  recentEnded: SessionSummaryView[];
  serverNow: number;
  tenants: Record<string, string>;
}) {
  const [sessions, setSessions] = useState(initial);
  const [now, setNow] = useState(serverNow);
  const [conn, setConn] = useState<Conn>("connecting");
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    let unsub = () => {};
    let alive = true;
    void getTransport().then((t) => {
      if (!alive) return;
      unsub = t.subscribeLive(
        (next) => {
          setSessions(next);
          setUpdatedAt(new Date().toISOString());
        },
        // The server stream reconnects automatically; surface the state to the operator.
        (st) => setConn(st === "open" ? "live" : st === "connecting" ? "connecting" : "reconnecting"),
      );
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const groups = useMemo(() => {
    const waiting = sessions
      .filter((s) => s.status === "escalated")
      .sort((a, b) => (a.escalation?.requestedAt ?? a.createdAt).localeCompare(b.escalation?.requestedAt ?? b.createdAt));
    const human = sessions.filter((s) => s.status === "human_active").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const ai = sessions.filter((s) => AI_GROUP.has(s.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const seen = new Set<string>();
    const ended = [...sessions.filter((s) => ENDED.has(s.status)), ...recentEnded]
      .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .sort((a, b) => (b.endedAt ?? b.lastActivityAt).localeCompare(a.endedAt ?? a.lastActivityAt))
      .slice(0, 10);
    return { waiting, human, ai, ended };
  }, [sessions, recentEnded]);

  const longestWait = groups.waiting[0] ? secs(groups.waiting[0].escalation?.requestedAt, now) : NaN;
  const breaching = groups.waiting.filter((s) => secs(s.escalation?.requestedAt, now) >= WAIT_BREACH).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted" aria-live="polite">
        {conn === "live" ? (
          <Badge tone="ok" icon={<Radio className="size-3" aria-hidden />}>
            Live
          </Badge>
        ) : conn === "connecting" ? (
          <Badge tone="neutral" icon={<Radio className="size-3" aria-hidden />}>
            Connecting…
          </Badge>
        ) : (
          <Badge tone="warn" icon={<WifiOff className="size-3" aria-hidden />}>
            Reconnecting — showing last known state
          </Badge>
        )}
        <span>{updatedAt ? `Updated ${formatTimeSec(updatedAt)}` : "Snapshot from page load"}</span>
        <SimulatedTag label="Simulated AI providers" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Waiting for a human"
          value={groups.waiting.length}
          tone={breaching ? "danger" : groups.waiting.length ? "warn" : undefined}
          hint={groups.waiting.length ? `Longest ${formatDuration(longestWait)}${breaching ? ` · ${breaching} over target` : ""}` : "Queue clear"}
        />
        <Stat label="Human active" value={groups.human.length} hint="Human owns the session" />
        <Stat label="AI active" value={groups.ai.length} hint="AI owns the session" />
        <Stat label="Recently ended" value={groups.ended.length} hint="Last 10 shown" />
      </div>

      <div className="mt-4 space-y-4">
        <GroupPanel
          title="Waiting for human"
          description="Escalated sessions in the queue, oldest first. Target answer: 60 s (L1)."
          count={groups.waiting.length}
          icon={<ShieldAlert className="size-4 text-warn" aria-hidden />}
          empty="No customers are waiting for a human."
        >
          <Table>
            <thead>
              <tr>
                <Th>Session</Th>
                <Th>Reason</Th>
                <Th>Severity</Th>
                <Th>Last step</Th>
                <Th align="right">Waiting</Th>
                <Th align="right">
                  <span className="sr-only">Links</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {groups.waiting.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2">
                  <Td>
                    <SessionCell s={s} tenants={tenants} />
                  </Td>
                  <Td>
                    {s.escalation ? (
                      <div className="space-y-1">
                        <EscalationReasonBadge reason={s.escalation.reason} />
                        <div className="max-w-xs text-xs text-muted">{s.escalation.reasonDetail}</div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.escalation && <SeverityBadge severity={s.escalation.severity} />}
                      {s.escalation?.mandatoryHuman && <Badge tone="navy">Human only</Badge>}
                    </div>
                  </Td>
                  <Td>{s.currentStepTitle ?? "—"}</Td>
                  <Td align="right">
                    <WaitTime seconds={secs(s.escalation?.requestedAt, now)} />
                  </Td>
                  <Td align="right">
                    <SessionLinks id={s.id} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </GroupPanel>

        <div className="grid gap-4 xl:grid-cols-2">
          <GroupPanel
            title="Human active"
            description="A human agent owns these sessions."
            count={groups.human.length}
            icon={<Headset className="size-4 text-violet" aria-hidden />}
            empty="No sessions are being handled by a human."
          >
            <Table>
              <thead>
                <tr>
                  <Th>Session</Th>
                  <Th>Agent</Th>
                  <Th>Escalated for</Th>
                  <Th align="right">Handling</Th>
                  <Th align="right">
                    <span className="sr-only">Links</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {groups.human.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-2">
                    <Td>
                      <SessionCell s={s} tenants={tenants} />
                    </Td>
                    <Td>{s.escalation?.assignedUserName ?? "—"}</Td>
                    <Td>{s.escalation ? <EscalationReasonBadge reason={s.escalation.reason} /> : "—"}</Td>
                    <Td align="right">{formatDuration(secs(s.escalation?.acceptedAt ?? s.lastActivityAt, now))}</Td>
                    <Td align="right">
                      <SessionLinks id={s.id} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </GroupPanel>

          <GroupPanel
            title="AI active"
            description="The AI owns these sessions. Current workflow step and what the customer sees."
            count={groups.ai.length}
            icon={<Bot className="size-4 text-brand" aria-hidden />}
            empty="No sessions are currently AI-led."
          >
            <Table>
              <thead>
                <tr>
                  <Th>Session</Th>
                  <Th>Current step</Th>
                  <Th>Customer sees</Th>
                  <Th align="right">Uncertain</Th>
                  <Th align="right">Duration</Th>
                  <Th align="right">
                    <span className="sr-only">Links</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {groups.ai.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-2">
                    <Td>
                      <SessionCell s={s} tenants={tenants} />
                    </Td>
                    <Td>
                      {s.status === "active" ? (
                        <span>{s.currentStepTitle ?? "—"}</span>
                      ) : (
                        <SessionStatusBadge status={s.status} />
                      )}
                      <div className="text-xs text-muted">{s.completedSteps} step(s) completed</div>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <Dot tone={s.customerState === "need_closer_view" || s.customerState === "need_another_angle" ? "warn" : "brand"} pulse />
                        {CUSTOMER_STATE_LABELS[s.customerState]}
                      </span>
                    </Td>
                    <Td align="right">
                      {s.uncertain > 0 ? (
                        <Badge tone="warn">{s.uncertain} uncertain</Badge>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </Td>
                    <Td align="right">{formatDuration(secs(s.startedAt ?? s.createdAt, now))}</Td>
                    <Td align="right">
                      <SessionLinks id={s.id} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </GroupPanel>
        </div>

        <GroupPanel
          title="Recently ended"
          description="Most recent completed or failed sessions."
          count={groups.ended.length}
          icon={<CheckCircle2 className="size-4 text-muted" aria-hidden />}
          empty="No sessions have ended recently."
        >
          <Table>
            <thead>
              <tr>
                <Th>Session</Th>
                <Th>Workflow</Th>
                <Th>Channel</Th>
                <Th>Outcome</Th>
                <Th>Ended</Th>
                <Th align="right">Duration</Th>
                <Th align="right">Cost</Th>
                <Th align="right">
                  <span className="sr-only">Links</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {groups.ended.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2">
                  <Td>
                    <SessionCell s={s} tenants={tenants} />
                  </Td>
                  <Td>
                    {s.workflowName} <span className="text-muted">v{s.workflowVersion}</span>
                  </Td>
                  <Td>{humanize(s.channel)}</Td>
                  <Td>
                    <OutcomeBadge outcome={s.outcome} />
                  </Td>
                  <Td>{formatTime(s.endedAt)}</Td>
                  <Td align="right">
                    {s.startedAt && s.endedAt ? formatDuration((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000) : "—"}
                  </Td>
                  <Td align="right">{formatGBP(s.costTotal, 3)}</Td>
                  <Td align="right">
                    <SessionLinks id={s.id} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </GroupPanel>
      </div>
    </>
  );
}
