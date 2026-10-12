import Link from "next/link";
import { consolePath } from "@/lib/paths";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { computeMetrics, dailySeries, escalationReasons } from "@/lib/analytics/metrics";
import { ESCALATION_REASON_LABELS } from "@/lib/domain/labels";
import { INCIDENTS } from "@/lib/config/operations";
import { effectiveServices } from "@/lib/server/ops-status";
import { formatDay, formatGBP, formatMinutes, pct, secondsBetween } from "@/lib/format";
import { Badge, Dot, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { EscalationReasonBadge, SeverityBadge } from "@/components/domain/badges";
import { StackedBars } from "@/components/charts/stacked-bars";
import { BarList } from "@/components/charts/bar-list";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const scope = await platformScope();
  const states = scope.states();
  const SERVICES = effectiveServices();
  const summaries = scope.summaries();
  const live = summaries.filter((s) => s.live && s.status !== "completed" && s.status !== "failed");
  const waiting = live.filter((s) => s.status === "escalated").sort((a, b) => a.escalation!.requestedAt.localeCompare(b.escalation!.requestedAt));
  const m = computeMetrics(states);
  const series = dailySeries(states, 14);
  const reasons = escalationReasons(states);
  // Internal incidents are platform-staff information; client admins see service status only.
  const openIncidents = scope.allClients ? INCIDENTS.filter((i) => i.status !== "resolved") : [];
  const degraded = SERVICES.filter((s) => s.status === "degraded" || s.status === "outage");

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description={`What is happening now, whether sessions are resolving, and whether the platform is healthy. All figures are computed from ${scope.allClients ? "session records" : `${scope.label} session records only`}.`}
        meta={<Badge tone="neutral">{scope.label} · last 14 days</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Live sessions"
          value={live.length}
          hint={`${live.filter((s) => s.status === "active").length} AI · ${waiting.length} waiting · ${live.filter((s) => s.status === "human_active").length} human`}
        />
        <Stat label="Waiting for a human" value={waiting.length} tone={waiting.length > 2 ? "warn" : undefined} hint={waiting[0] ? `Longest ${formatMinutes(secondsBetween(waiting[0].escalation!.requestedAt))}` : "Queue clear"} />
        <Stat label="AI resolution rate" value={pct(m.aiResolutionRate)} hint={`${m.aiResolved} of ${m.completed} completed`} />
        <Stat label="Escalation rate" value={pct(m.escalationRate)} hint={`Avg wait ${formatMinutes(m.avgQueueWaitSec)}`} />
        <Stat label="Cost per session" value={formatGBP(m.costPerSession, 3)} hint={`${formatGBP(m.costTotal)} total (estimated)`} />
        <Stat
          label="Platform health"
          value={openIncidents.length ? `${openIncidents.length} open` : "Healthy"}
          tone={openIncidents.some((i) => i.severity === "P0" || i.severity === "P1") ? "danger" : openIncidents.length ? "warn" : "ok"}
          hint={`${degraded.length} service(s) degraded`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Session outcomes" description="Daily sessions by outcome" className="xl:col-span-2">
          <StackedBars
            ariaLabel="Daily sessions by outcome over the last 14 days"
            series={[
              { key: "ai", label: "Resolved by AI" },
              { key: "human", label: "Resolved by human" },
              { key: "esc", label: "Escalated, unresolved" },
              { key: "other", label: "Other / abandoned" },
            ]}
            data={series.map((d) => ({
              label: formatDay(d.day),
              values: { ai: d.aiResolved, human: d.humanResolved, esc: d.escalated, other: d.other },
            }))}
          />
        </Panel>
        <Panel title="Escalation reasons" description="Why the AI handed over">
          <BarList
            rows={reasons.map((r) => ({ label: ESCALATION_REASON_LABELS[r.reason], value: r.count, hint: pct(r.count / Math.max(1, m.escalated)) }))}
            empty="No escalations"
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          title="Escalation queue"
          description="Sessions waiting for a human, oldest first"
          className="xl:col-span-2"
          bodyClassName="p-0"
          actions={
            <Link href="/console" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              Open console <ArrowRight className="size-3" aria-hidden />
            </Link>
          }
        >
          {waiting.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No customers are waiting.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Session</Th>
                  <Th>Reason</Th>
                  <Th>Severity</Th>
                  <Th>Last step</Th>
                  <Th align="right">Waiting</Th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={consolePath(s.id)} className="font-medium text-brand hover:underline">
                        {s.reference}
                      </Link>
                      <div className="text-xs text-muted">{s.customerLabel}</div>
                    </Td>
                    <Td>
                      <EscalationReasonBadge reason={s.escalation!.reason} />
                    </Td>
                    <Td>
                      <SeverityBadge severity={s.escalation!.severity} />
                    </Td>
                    <Td>{s.currentStepTitle ?? "—"}</Td>
                    <Td align="right">{formatMinutes(secondsBetween(s.escalation!.requestedAt))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <Panel
          title="Platform status"
          actions={
            <Link href="/platform/health" className="text-xs font-medium text-brand hover:underline">
              Details
            </Link>
          }
        >
          <ul className="space-y-2 text-[13px]">
            {openIncidents.map((i) => (
              <li key={i.id} className="flex items-start gap-2 rounded-md bg-warn-soft px-2.5 py-2 text-warn">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">
                    {i.severity} · {i.id}
                  </span>{" "}
                  {i.title}
                </span>
              </li>
            ))}
            {SERVICES.slice(0, 8).map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-2">
                  <Dot tone={s.status === "operational" ? "ok" : s.status === "degraded" ? "warn" : s.status === "outage" ? "danger" : "neutral"} />
                  {s.name}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {s.status === "operational" ? <CheckCircle2 className="size-3 text-ok" aria-hidden /> : <CircleDot className="size-3" aria-hidden />}
                  {s.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
