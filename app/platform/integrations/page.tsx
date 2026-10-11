import { ArrowRight, Info } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { integrations, tenantName } from "@/lib/config/catalog";
import { formatDateTime, formatRelative, pct } from "@/lib/format";
import { humanize } from "@/lib/domain/labels";
import { Badge, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { withinDays } from "@/components/platform/config-data";
import { Chips, IntegrationStatusBadge, Note } from "@/components/platform/config-ui";
import { LinkDeliveryPanel } from "@/components/platform/link-delivery-panel";
import { getNotifications } from "@/lib/server/notifications";
import { STATIC_EXPORT } from "@/lib/server/platform-data";

export const metadata = { title: "Integrations" };

function Lane({ title, tone, steps, note }: { title: string; tone: "media" | "business"; steps: string[]; note: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <Badge tone={tone === "media" ? "brand" : "neutral"}>{tone === "media" ? "Real-time, latency-critical" : "Asynchronous, idempotent"}</Badge>
      </div>
      <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="rounded border border-line bg-surface px-1.5 py-0.5">{s}</span>
            {i < steps.length - 1 && <ArrowRight className="size-3 text-muted" aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </div>
  );
}

export default async function IntegrationsPage() {
  const rt = await platformRuntime();
  const tenantIds = [...new Set(integrations.map((i) => i.tenantId))];

  const rows = integrations.map((i) => {
    const actions = withinDays(rt.states({ tenantId: i.tenantId }), 14).flatMap((s) => s.toolActions.filter((a) => i.tools.includes(a.toolName)));
    const executed = actions.filter((a) => a.status === "completed" || a.status === "failed");
    return {
      integration: i,
      calls: executed.length,
      success: executed.length ? executed.filter((a) => a.status === "completed").length / executed.length : NaN,
      blocked: actions.filter((a) => a.status === "duplicate_blocked").length,
      denied: actions.filter((a) => a.status === "denied").length,
    };
  });

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Client business systems the platform can act on through governed tools: CRM and case updates, diagnostics, field-service booking, notifications and claims."
        meta={<Badge tone="neutral">{integrations.length} integrations · {tenantIds.length} tenants</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Connected (production)" value={integrations.filter((i) => i.status === "connected").length} hint="No live client systems in the POC" />
        <Stat label="Sandbox" value={integrations.filter((i) => i.status === "sandbox").length} />
        <Stat label="Not configured" value={integrations.filter((i) => i.status === "not_configured").length} />
        <Stat label="Tool calls (14 d)" value={rows.reduce((n, r) => n + r.calls, 0)} hint={`${rows.reduce((n, r) => n + r.blocked, 0)} duplicates blocked`} />
      </div>

      <Panel
        className="mt-4"
        title="Business automation sits outside the real-time media loop"
        description="docs/02 §4 — rules 1, 6, 7 and 8"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Lane
            title="Media & conversation loop"
            tone="media"
            steps={["Customer camera & voice", "Media gateway", "Frame selection", "Reasoning", "Orchestrator"]}
            note="Never waits on a client system. Selected frames only — full video is not streamed to the model."
          />
          <Lane
            title="Business action path"
            tone="business"
            steps={["Workflow step", "Policy check", "Tool executor", "Client system", "Result to orchestrator"]}
            note="Runs out of band with an idempotency key. A slow or failed integration degrades to a failure path or a human escalation; the session keeps running."
          />
        </div>
      </Panel>

      <div className="mt-4 space-y-4">
        {tenantIds.map((tid) => (
          <Panel key={tid} title={tenantName(tid)} bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Integration</Th>
                  <Th>Status</Th>
                  <Th>Tools exposed</Th>
                  <Th align="right">p95 latency</Th>
                  <Th align="right">Error rate 24 h</Th>
                  <Th>Last sync</Th>
                  <Th align="right">Observed calls (14 d)</Th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.integration.tenantId === tid)
                  .map(({ integration: i, calls, success, blocked, denied }) => (
                    <tr key={i.id}>
                      <Td>
                        <div className="font-medium text-ink">{i.name}</div>
                        <div className="text-xs text-muted">
                          {i.provider} · {humanize(i.category)}
                        </div>
                      </Td>
                      <Td>
                        <IntegrationStatusBadge status={i.status} />
                      </Td>
                      <Td>
                        <Chips items={i.tools} mono empty="None" />
                      </Td>
                      <Td align="right">{i.p95LatencyMs !== undefined ? `${i.p95LatencyMs.toLocaleString("en-GB")} ms` : "—"}</Td>
                      <Td align="right" className={i.errorRate24h !== undefined && i.errorRate24h >= 0.01 ? "text-warn" : undefined}>
                        {i.errorRate24h !== undefined ? pct(i.errorRate24h, 1) : "—"}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {i.lastSyncAt ? (
                          <>
                            {formatRelative(i.lastSyncAt)}
                            <div className="text-muted">{formatDateTime(i.lastSyncAt)}</div>
                          </>
                        ) : (
                          <span className="text-muted">Never</span>
                        )}
                      </Td>
                      <Td align="right">
                        {calls ? (
                          <>
                            {calls}
                            <div className="text-[11px] text-muted">
                              {pct(success)} succeeded
                              {blocked ? ` · ${blocked} dup. blocked` : ""}
                              {denied ? ` · ${denied} denied` : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </Panel>
        ))}
      </div>

      <LinkDeliveryPanel states={rt.states()} notifications={getNotifications()} staticDemo={STATIC_EXPORT} />

      <Note className="mt-4" icon={<Info className="size-3.5" />}>
        p95 latency, error rate and last sync are catalogue values for sandbox connections, not live monitoring. Observed calls are computed from session records,
        where tools run on the simulated sandbox executor. No integration holds client credentials in this POC.
      </Note>
    </>
  );
}
