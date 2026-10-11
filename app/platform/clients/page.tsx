import Link from "next/link";
import { Lock } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { agents, integrations, tenants, users, workflows } from "@/lib/config/catalog";
import { computeMetrics } from "@/lib/analytics/metrics";
import { formatDateTime, formatGBP, pct } from "@/lib/format";
import { Badge, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { REGION_LABELS, SECTOR_LABELS, withinDays } from "@/components/platform/config-data";
import { Note, TenantStatusBadge } from "@/components/platform/config-ui";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const rt = await platformRuntime();
  const rows = tenants.map((t) => {
    const states = withinDays(rt.states({ tenantId: t.id }), 14);
    const live = rt.summaries({ tenantId: t.id }).filter((s) => s.live && s.status !== "completed" && s.status !== "failed").length;
    return {
      tenant: t,
      metrics: computeMetrics(states),
      live,
      workflows: workflows.filter((w) => w.tenantId === t.id),
      agents: agents.filter((a) => a.tenantId === t.id).length,
      users: users.filter((u) => u.tenantId === t.id).length,
      integrations: integrations.filter((i) => i.tenantId === t.id),
    };
  });
  const totalSessions = rows.reduce((n, r) => n + r.metrics.sessions, 0);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Tenants configured on the platform. Each client's data, workflows, policies, users, credentials, branding, retention, integrations, regional settings and analytics are isolated to its tenant."
        meta={<Badge tone="neutral">{tenants.length} tenants · session figures last 14 days</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active clients" value={tenants.filter((t) => t.status === "active").length} hint={`${tenants.filter((t) => t.status === "onboarding").length} onboarding`} />
        <Stat label="Sessions (14 days)" value={totalSessions} hint="Across all tenants" />
        <Stat label="Published workflows" value={workflows.filter((w) => w.status === "published").length} hint={`${workflows.length} versions in total`} />
        <Stat
          label="Retained-evidence tenants"
          value={tenants.filter((t) => t.retention.evidenceMode === "retained_evidence").length}
          hint={`${tenants.filter((t) => t.retention.evidenceMode === "live_only").length} live-only`}
        />
      </div>

      <Panel title="Tenants" className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Client</Th>
              <Th>Status</Th>
              <Th>Sector</Th>
              <Th>Region</Th>
              <Th>Evidence mode</Th>
              <Th align="right">Sessions</Th>
              <Th align="right">AI resolution</Th>
              <Th align="right">Cost / session</Th>
              <Th>Configuration</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ tenant: t, metrics: m, live, workflows: wf, agents: ag, users: us, integrations: ints }) => (
              <tr key={t.id} className="hover:bg-surface-2">
                <Td>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: t.brand.primaryColor }} />
                    <Link href={`/platform/clients/${t.id}`} className="font-medium text-brand hover:underline">
                      {t.name}
                    </Link>
                  </div>
                  <div className="font-mono text-[11px] text-muted">{t.id}</div>
                </Td>
                <Td>
                  <TenantStatusBadge status={t.status} />
                </Td>
                <Td>{SECTOR_LABELS[t.sector]}</Td>
                <Td>{REGION_LABELS[t.region]}</Td>
                <Td>
                  {t.retention.evidenceMode === "retained_evidence" ? (
                    <span>
                      Retained evidence <span className="text-muted">· {t.retention.evidenceRetentionDays} d</span>
                    </span>
                  ) : (
                    "Live only"
                  )}
                </Td>
                <Td align="right">
                  {m.sessions}
                  {live > 0 && <div className="text-[11px] text-muted">{live} live now</div>}
                </Td>
                <Td align="right">{m.completed ? pct(m.aiResolutionRate) : "—"}</Td>
                <Td align="right">{m.sessions ? formatGBP(m.costPerSession, 3) : "—"}</Td>
                <Td className="text-xs">
                  {wf.length} workflow version{wf.length === 1 ? "" : "s"} · {ag} agent{ag === 1 ? "" : "s"} · {us} user{us === 1 ? "" : "s"} · {ints.length} integration
                  {ints.length === 1 ? "" : "s"}
                </Td>
                <Td className="text-xs">{formatDateTime(t.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Note className="mt-4" icon={<Lock className="size-3.5" />}>
        Platform staff (the internal <span className="font-mono">aiuk</span> tenant) are not listed as a client. In this POC, tenant isolation is enforced by
        tenant-scoped queries in the session runtime; database-level row security and per-tenant encryption keys are planned for production (docs/06 §2).
      </Note>
    </>
  );
}
