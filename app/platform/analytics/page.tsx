import Link from "next/link";
import { platformRuntime, staticSafeSearchParams } from "@/lib/server/platform-data";
import { getTenant, getWorkflow, tenants } from "@/lib/config/catalog";
import { computeMetrics, dailySeries, escalationReasons, latencyStats, outcomeBreakdown, stepFunnel } from "@/lib/analytics/metrics";
import { ESCALATION_REASON_LABELS, OUTCOME_LABELS, humanize } from "@/lib/domain/labels";
import { formatDay, formatGBP, formatMinutes, pct } from "@/lib/format";
import { Badge, Meter, PageHeader, Panel, Stat, Table, Td, Th, cx } from "@/components/ui/primitives";
import { StackedBars } from "@/components/charts/stacked-bars";
import { BarList } from "@/components/charts/bar-list";
import { CHANNEL_LABELS, orderSteps, withinDays } from "@/components/platform/config-data";
import { FieldLabel, UnmeasuredStat } from "@/components/platform/config-ui";

export const metadata = { title: "Analytics" };

type Props = { searchParams: Promise<{ client?: string | string[] }> };

export default async function AnalyticsPage({ searchParams }: Props) {
  const rt = await platformRuntime();
  const sp = await staticSafeSearchParams(searchParams);
  const requested = typeof sp.client === "string" ? sp.client : undefined;
  const tenant = requested ? getTenant(requested) : undefined;
  const tenantId = tenant?.id;

  const states = withinDays(rt.states({ tenantId }), 14);
  const inWindow = new Set(states.map((s) => s.session.id));
  const summaries = rt.summaries({ tenantId }).filter((s) => inWindow.has(s.id));
  const m = computeMetrics(states);
  const series = dailySeries(states, 14);
  const outcomes = outcomeBreakdown(states);
  const reasons = escalationReasons(states);
  const latency = latencyStats(states);

  const channels = new Map<string, number>();
  for (const s of summaries) channels.set(s.channel, (channels.get(s.channel) ?? 0) + 1);

  const byWorkflow = new Map<string, number>();
  for (const s of states) byWorkflow.set(s.session.workflowId, (byWorkflow.get(s.session.workflowId) ?? 0) + 1);
  const topWorkflowId = [...byWorkflow.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topWorkflow = topWorkflowId ? getWorkflow(topWorkflowId) : undefined;
  const wfStates = topWorkflow ? states.filter((s) => s.session.workflowId === topWorkflow.id) : [];
  const funnel = stepFunnel(wfStates);

  const filterLink = (id: string | undefined, label: string) => (
    <Link
      key={id ?? "all"}
      href={id ? `/platform/analytics?client=${id}` : "/platform/analytics"}
      aria-current={tenantId === id ? "page" : undefined}
      className={cx(
        "rounded-md border px-2 py-0.5 text-xs font-medium",
        tenantId === id ? "border-brand/30 bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Operational KPIs (docs/01 §8.9) and success metrics (§11), computed from session records. Metrics that need data the platform does not yet receive are shown as such rather than estimated."
        meta={
          <>
            <Badge tone="neutral">Last 14 days</Badge>
            <span className="text-xs text-muted">Client:</span>
            {filterLink(undefined, "All clients")}
            {tenants.map((t) => filterLink(t.id, t.brand.displayName))}
          </>
        }
      />

      {requested && !tenant && <p className="mb-4 text-sm text-warn">Unknown client “{requested}” — showing all clients.</p>}

      <h2 className="mb-2 text-[13px] font-semibold text-ink">Operational KPIs</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Session volume" value={m.sessions} hint={`${m.completed} completed`} />
        <Stat label="AI resolution rate" value={m.completed ? pct(m.aiResolutionRate) : "—"} hint={`${m.aiResolved} resolved by AI`} />
        <Stat label="Escalation rate" value={m.sessions ? pct(m.escalationRate) : "—"} hint={`${m.escalated} escalated`} />
        <Stat label="Average duration" value={formatMinutes(m.avgDurationSec)} hint="Completed sessions" />
        <Stat label="Frames per session" value={m.sessions ? m.avgFramesPerSession.toFixed(1) : "—"} hint={`${m.framesTotal.toLocaleString("en-GB")} frames analysed`} />
        <Stat
          label="Visual confidence failures"
          value={m.visualConfidenceEscalations}
          hint={`${pct(m.uncertainObservationRate)} of observations uncertain`}
          tone={m.sessions && m.visualConfidenceEscalations / m.sessions > 0.15 ? "warn" : undefined}
        />
        <Stat label="Workflow completion" value={m.sessions ? pct(m.workflowCompletionRate) : "—"} hint="Reached completion or a defined escalation" />
        <Stat label="Failed sessions" value={m.failed} tone={m.failed ? "danger" : undefined} hint={`${m.abandoned} abandoned by customer`} />
        <Stat label="Cost per interaction" value={m.sessions ? formatGBP(m.costPerSession, 3) : "—"} hint="Estimated unit rates" />
        <Stat label="Human handling time" value={formatMinutes(m.avgHumanHandlingSec)} hint={`Avg queue wait ${formatMinutes(m.avgQueueWaitSec)}`} />
        <UnmeasuredStat label="Repeat-contact rate" requires="Requires CRM integration" note="Needs contact history across channels" />
        <UnmeasuredStat label="Field-visit avoidance" requires="Requires CRM integration" note="Needs engineer-visit outcomes from field service" />
      </div>

      <h2 className="mb-2 mt-5 text-[13px] font-semibold text-ink">Success metrics</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="First-contact resolution"
          value={m.completed ? pct(m.firstContactResolutionRate) : "—"}
          hint="Resolved within the session (AI or human)"
        />
        <Stat label="Business-action success" value={m.businessActions ? pct(m.businessActionSuccessRate) : "—"} hint={`${m.businessActions} actions executed`} />
        <Stat label="Cost per resolution" value={m.aiResolved + m.humanResolved ? formatGBP(m.costPerResolution, 3) : "—"} hint="Estimated" />
        <UnmeasuredStat label="Customer satisfaction (CSAT)" requires="Requires CRM integration" note="Post-session survey not yet collected" />
        <UnmeasuredStat label="Visual interpretation accuracy" requires="Requires QA review" note="Needs human-labelled observation samples" />
        <UnmeasuredStat label="Escalation correctness" requires="Requires QA review" note="Needs reviewer verdicts on escalations" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Daily sessions by outcome" className="xl:col-span-2">
          <StackedBars
            ariaLabel="Daily sessions by outcome over the last 14 days"
            series={[
              { key: "ai", label: "Resolved by AI" },
              { key: "human", label: "Resolved by human" },
              { key: "esc", label: "Escalated, unresolved" },
              { key: "other", label: "Other / abandoned" },
            ]}
            data={series.map((d) => ({ label: formatDay(d.day), values: { ai: d.aiResolved, human: d.humanResolved, esc: d.escalated, other: d.other } }))}
          />
        </Panel>
        <Panel title="Outcomes" description="Completed sessions">
          <BarList rows={outcomes.map((o) => ({ label: OUTCOME_LABELS[o.outcome], value: o.count, hint: pct(o.count / Math.max(1, m.completed)) }))} empty="No completed sessions" />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Escalation reasons">
          <BarList
            rows={reasons.map((r) => ({ label: ESCALATION_REASON_LABELS[r.reason], value: r.count, hint: pct(r.count / Math.max(1, m.escalated)) }))}
            empty="No escalations"
          />
        </Panel>
        <Panel title="Entry channel">
          <BarList
            rows={[...channels.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ label: CHANNEL_LABELS[c] ?? humanize(c), value: n, hint: pct(n / Math.max(1, summaries.length)) }))}
            empty="No sessions"
          />
        </Panel>
        <Panel title="Latency" description="Visual inference, from observation audit events">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Vision p50</FieldLabel>
              <div className="tabular mt-0.5 text-xl font-semibold text-ink">{Number.isFinite(latency.visionP50) ? `${(latency.visionP50 / 1000).toFixed(2)} s` : "—"}</div>
            </div>
            <div>
              <FieldLabel>Vision p95</FieldLabel>
              <div className="tabular mt-0.5 text-xl font-semibold text-ink">{Number.isFinite(latency.visionP95) ? `${(latency.visionP95 / 1000).toFixed(2)} s` : "—"}</div>
            </div>
            <div>
              <FieldLabel>Avg queue wait</FieldLabel>
              <div className="tabular mt-0.5 text-xl font-semibold text-ink">{formatMinutes(m.avgQueueWaitSec)}</div>
            </div>
            <div>
              <FieldLabel>Samples</FieldLabel>
              <div className="tabular mt-0.5 text-xl font-semibold text-ink">{latency.samples}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">Latency comes from the simulated vision provider and does not represent a production model.</p>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Workflow step funnel"
        description={topWorkflow ? `${topWorkflow.name} v${topWorkflow.version} · ${wfStates.length} sessions (busiest workflow in this view). Entered counts sessions; completed and failed count passes.` : "No workflow sessions in this view"}
        actions={
          topWorkflow && (
            <Link href={`/platform/workflows/${topWorkflow.id}`} className="text-xs font-medium text-brand hover:underline">
              Open workflow
            </Link>
          )
        }
        bodyClassName="p-0"
      >
        {!topWorkflow ? (
          <p className="px-4 py-6 text-sm text-muted">No sessions in the last 14 days.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Step</Th>
                <Th className="w-1/3">Reached</Th>
                <Th align="right">Entered</Th>
                <Th align="right">Completed</Th>
                <Th align="right">Failed</Th>
              </tr>
            </thead>
            <tbody>
              {orderSteps(topWorkflow)
                .filter((s) => funnel.has(s.key))
                .map((s) => {
                  const f = funnel.get(s.key)!;
                  const share = f.entered / Math.max(1, wfStates.length);
                  return (
                    <tr key={s.key}>
                      <Td className="font-medium text-ink">{s.title}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Meter value={share} label={`${s.title}: ${pct(share)} of sessions`} />
                          <span className="tabular w-10 text-right text-xs text-ink-2">{pct(share)}</span>
                        </div>
                      </Td>
                      <Td align="right">{f.entered}</Td>
                      <Td align="right">{f.completed}</Td>
                      <Td align="right" className={f.failed ? "text-danger" : undefined}>
                        {f.failed}
                      </Td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
