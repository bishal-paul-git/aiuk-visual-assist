import { clientScope } from "@/lib/server/client-data";
import { staticSafeSearchParams } from "@/lib/server/platform-data";
import { computeMetrics, escalationReasons, outcomeBreakdown } from "@/lib/analytics/metrics";
import { ESCALATION_REASON_LABELS, OUTCOME_LABELS } from "@/lib/domain/labels";
import { formatDuration, pct } from "@/lib/format";
import { Badge, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { PortalShell } from "@/components/client/portal-shell";

export const metadata = { title: "Results" };

const NONE = "—";

export default async function ClientResults({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await staticSafeSearchParams(searchParams);
  const scope = await clientScope("/client/results", org);
  const states = scope.states();
  const live = states.filter((s) => !s.session.scenario);
  const scripted = states.filter((s) => s.session.scenario);
  const m = computeMetrics(live);
  const sm = computeMetrics(scripted);
  const has = (n: number, f: () => string) => (n ? f() : NONE);

  const rows: { label: string; hint: string; live: string; scripted: string }[] = [
    { label: "Sessions started", hint: "Customer opened the link and agreed", live: String(m.sessions), scripted: String(sm.sessions) },
    { label: "Fixed by the AI alone", hint: "Of sessions that finished", live: has(m.completed, () => `${m.aiResolved} (${pct(m.aiResolutionRate)})`), scripted: has(sm.completed, () => `${sm.aiResolved} (${pct(sm.aiResolutionRate)})`) },
    { label: "Needed a person", hint: "Customer asked, or the AI was not sure", live: has(m.sessions, () => `${m.escalated} (${pct(m.escalationRate)})`), scripted: has(sm.sessions, () => `${sm.escalated} (${pct(sm.escalationRate)})`) },
    { label: "Average session time", hint: "Finished sessions", live: has(m.completed, () => formatDuration(m.avgDurationSec)), scripted: has(sm.completed, () => formatDuration(sm.avgDurationSec)) },
    { label: "Wait for a person to answer", hint: "From asking to being picked up", live: has(m.avgQueueWaitSec, () => formatDuration(m.avgQueueWaitSec)), scripted: has(sm.avgQueueWaitSec, () => formatDuration(sm.avgQueueWaitSec)) },
    { label: "Photos checked", hint: "Photos the AI looked at", live: String(m.framesTotal), scripted: String(sm.framesTotal) },
    { label: "Readings the AI was unsure about", hint: "Share of all readings", live: has(m.framesTotal, () => pct(m.uncertainObservationRate)), scripted: has(sm.framesTotal, () => pct(sm.uncertainObservationRate)) },
    { label: "Business actions that worked", hint: "Tickets, bookings, line tests and so on", live: has(m.businessActions, () => `${m.businessActions} (${pct(m.businessActionSuccessRate)})`), scripted: has(sm.businessActions, () => `${sm.businessActions} (${pct(sm.businessActionSuccessRate)})`) },
  ];

  const outcomes = outcomeBreakdown(live);
  const reasons = escalationReasons(live);

  return (
    <PortalShell scope={scope} active="results">
      <PageHeader
        title="Results"
        description={`How ${scope.tenant.name}'s sessions went. Real AI sessions show how the product really performs; guided examples always follow their script.`}
        meta={<Badge tone="neutral">{live.length} real AI · {scripted.length} guided</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Real AI sessions" value={m.sessions} hint={has(m.completed, () => `${m.completed} finished`)} />
        <Stat label="Fixed by the AI" value={has(m.completed, () => pct(m.aiResolutionRate))} hint={has(m.completed, () => `${m.aiResolved} of ${m.completed}`)} />
        <Stat label="Needed a person" value={has(m.sessions, () => pct(m.escalationRate))} hint={has(m.sessions, () => `${m.escalated} of ${m.sessions}`)} />
        <Stat label="Average time" value={has(m.completed, () => formatDuration(m.avgDurationSec))} />
      </div>

      <Panel title="Real AI compared with guided examples" className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Measure</Th>
              <Th align="right">Real AI</Th>
              <Th align="right">Guided</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <Td>
                  <div className="font-medium text-ink">{r.label}</div>
                  <div className="text-xs text-muted">{r.hint}</div>
                </Td>
                <Td align="right" className="tabular">
                  {r.live}
                </Td>
                <Td align="right" className="tabular text-muted">
                  {r.scripted}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="How real AI sessions ended" bodyClassName="p-0">
          {outcomes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No finished real AI sessions yet.</p>
          ) : (
            <Table>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.outcome}>
                    <Td>{OUTCOME_LABELS[o.outcome]}</Td>
                    <Td align="right" className="tabular">
                      {o.count}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <Panel title="Why a person took over" bodyClassName="p-0">
          {reasons.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No real AI session has needed a person yet.</p>
          ) : (
            <Table>
              <tbody>
                {reasons.map((r) => (
                  <tr key={r.reason}>
                    <Td>{ESCALATION_REASON_LABELS[r.reason]}</Td>
                    <Td align="right" className="tabular">
                      {r.count}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>

      <p className="mt-4 text-xs text-muted">
        These numbers come from the sessions listed on the Sessions page. A handful of test sessions is a first impression, not proof: look at a few sessions in detail before drawing a
        conclusion.
      </p>
    </PortalShell>
  );
}
