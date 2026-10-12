import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { agents, getTenant, integrations, policies, teams, tenants, users, workflows } from "@/lib/config/catalog";
import { computeMetrics, dailySeries } from "@/lib/analytics/metrics";
import { ESCALATION_REASON_LABELS, humanize } from "@/lib/domain/labels";
import { formatDateTime, formatDay, formatGBP, formatMinutes, pct } from "@/lib/format";
import { Badge, KeyValue, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { SimulatedTag, WorkflowStatusBadge } from "@/components/domain/badges";
import { StackedBars } from "@/components/charts/stacked-bars";
import { REGION_LABELS, ROLE_LABELS, SECTOR_LABELS, withinDays } from "@/components/platform/config-data";
import {
  Chips,
  ConfigStatusBadge,
  FlagBadge,
  ImplStateBadge,
  IntegrationStatusBadge,
  Mono,
  Note,
  TenantStatusBadge,
  type ImplState,
} from "@/components/platform/config-ui";
import { ConnectorTable } from "@/components/platform/connector-status";
import { getConnectorRegistry } from "@/lib/integrations/config";
import { connectorStatuses } from "@/lib/integrations/status";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const scope = await platformScope("platform.access", `/platform/clients/${id}`);
  return { title: (scope.includes(id) && getTenant(id)?.name) || "Client" };
}

export async function generateStaticParams() {
  return tenants.map((t) => ({ id: t.id }));
}

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const scope = await platformScope("platform.access", `/platform/clients/${id}`);
  const rt = scope.rt;
  const tenant = getTenant(id);
  // Client admins only ever see their own client; anything else is "not found".
  if (!tenant || !scope.includes(tenant.id)) notFound();

  const allStates = rt.states({ tenantId: tenant.id });
  const states = withinDays(allStates, 14);
  const m = computeMetrics(states);
  const series = dailySeries(states, 14);
  const live = rt.summaries({ tenantId: tenant.id }).filter((s) => s.live && s.status !== "completed" && s.status !== "failed");

  const tUsers = users.filter((u) => u.tenantId === tenant.id);
  const tAgents = agents.filter((a) => a.tenantId === tenant.id);
  const tWorkflows = workflows.filter((w) => w.tenantId === tenant.id).sort((a, b) => a.key.localeCompare(b.key) || b.version - a.version);
  const tPolicies = policies.filter((p) => p.tenantId === tenant.id);
  const tTeams = teams.filter((t) => t.tenantId === tenant.id);
  const tIntegrations = integrations.filter((i) => i.tenantId === tenant.id);
  const r = tenant.retention;
  const connectors = connectorStatuses(tenant.id, getConnectorRegistry(), allStates);
  const httpConnectors = connectors.filter((c) => c.mode === "http");

  const boundary: { area: string; scope: ReactNode; state: ImplState; how: string }[] = [
    { area: "Data", scope: `${allStates.length} session records`, state: "implemented", how: "Runtime queries filtered by tenant ID" },
    { area: "Workflows", scope: `${tWorkflows.length} versions`, state: "implemented", how: "Definitions carry tenantId" },
    { area: "Policies", scope: `${tPolicies.length} polic${tPolicies.length === 1 ? "y" : "ies"}`, state: "implemented", how: "Policy resolved from the tenant's workflow" },
    { area: "Users", scope: `${tUsers.length} users`, state: "implemented", how: "Sign-in with role-based access; client roles only see their own tenant" },
    {
      area: "Credentials",
      scope: httpConnectors.length ? `Signing secret ${httpConnectors[0].secretRef}` : "No client credentials stored",
      state: "partial",
      how: "Per-tenant HMAC secret read from the environment by reference; secrets manager planned",
    },
    { area: "Branding", scope: tenant.brand.displayName, state: "implemented", how: "Customer view resolves brand from session tenant" },
    { area: "Retention", scope: r.evidenceMode === "live_only" ? "Live only" : `${r.evidenceRetentionDays} d evidence`, state: "partial", how: "Configured per tenant; automated deletion planned" },
    {
      area: "Integrations",
      scope: `${tIntegrations.length} configured · ${httpConnectors.length} on client API`,
      state: "implemented",
      how: "Tool calls carry the session's tenantId and use only this client's connectors",
    },
    { area: "Regional settings", scope: REGION_LABELS[tenant.region], state: "partial", how: "Recorded per tenant; POC runs as one deployment" },
    { area: "Analytics access", scope: "Tenant-filtered metrics", state: "implemented", how: "Management platform and audit export are scoped to the viewer's tenant" },
  ];

  return (
    <>
      <Link href="/platform/clients" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
        <ArrowLeft className="size-3" aria-hidden /> {scope.allClients ? "All clients" : "Clients"}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-sm" style={{ background: tenant.brand.primaryColor }} />
            {tenant.name}
          </span>
        }
        description={`${SECTOR_LABELS[tenant.sector]} · ${REGION_LABELS[tenant.region]} · tenant since ${formatDateTime(tenant.createdAt)}`}
        meta={
          <>
            <TenantStatusBadge status={tenant.status} />
            <Badge tone="neutral">
              <span className="font-mono">{tenant.id}</span>
            </Badge>
            <Badge tone="neutral">Last 14 days</Badge>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sessions" value={m.sessions} hint={`${live.length} live now`} />
        <Stat label="AI resolution rate" value={m.completed ? pct(m.aiResolutionRate) : "—"} hint={`${m.aiResolved} of ${m.completed} completed`} />
        <Stat label="Escalation rate" value={m.sessions ? pct(m.escalationRate) : "—"} hint={`Avg wait ${formatMinutes(m.avgQueueWaitSec)}`} />
        <Stat label="Average duration" value={formatMinutes(m.avgDurationSec)} hint={`${m.avgFramesPerSession.toFixed(1)} frames / session`} />
        <Stat label="Cost per session" value={m.sessions ? formatGBP(m.costPerSession, 3) : "—"} hint={`${formatGBP(m.costTotal)} total (estimated)`} />
        <Stat label="Workflow completion" value={m.sessions ? pct(m.workflowCompletionRate) : "—"} hint={`${m.failed} failed sessions`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Session outcomes" description="Daily sessions for this tenant only" className="xl:col-span-2">
          {m.sessions === 0 ? (
            <p className="text-sm text-muted">No sessions in the last 14 days. Tenants in onboarding have no published workflow yet.</p>
          ) : (
            <StackedBars
              ariaLabel={`Daily sessions by outcome for ${tenant.name}, last 14 days`}
              series={[
                { key: "ai", label: "Resolved by AI" },
                { key: "human", label: "Resolved by human" },
                { key: "esc", label: "Escalated, unresolved" },
                { key: "other", label: "Other / abandoned" },
              ]}
              data={series.map((d) => ({ label: formatDay(d.day), values: { ai: d.aiResolved, human: d.humanResolved, esc: d.escalated, other: d.other } }))}
            />
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5 text-muted" aria-hidden /> Tenant boundary
            </span>
          }
          description="What is isolated to this tenant (docs/02 §5)"
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line text-[13px]">
            {boundary.map((b) => (
              <li key={b.area} className="px-4 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{b.area}</span>
                  <ImplStateBadge state={b.state} />
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {b.scope} · {b.how}
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">No tenant can read or act on another tenant&apos;s data.</p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Profile & brand">
          <KeyValue
            items={[
              ["Display name", tenant.brand.displayName],
              [
                "Brand colour",
                <span key="c" className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-3 rounded-sm ring-1 ring-line" style={{ background: tenant.brand.primaryColor }} />
                  <Mono>{tenant.brand.primaryColor}</Mono>
                </span>,
              ],
              ["Support line", tenant.brand.supportLine ?? <span className="text-muted">Not set</span>],
              ["Privacy notice", tenant.brand.privacyNoticeUrl ?? <span className="text-muted">Platform default notice</span>],
              ["Sector", SECTOR_LABELS[tenant.sector]],
              ["Region", REGION_LABELS[tenant.region]],
              ["Last updated", formatDateTime(tenant.updatedAt)],
            ]}
          />
        </Panel>

        <Panel title="Retention policy" description="Per-tenant retention (docs/06 §3)">
          <KeyValue
            items={[
              [
                "Evidence mode",
                r.evidenceMode === "retained_evidence" ? <Badge tone="brand">Retained evidence</Badge> : <Badge tone="ok">Live only</Badge>,
              ],
              ["Evidence frames", r.evidenceMode === "live_only" ? "Not retained after session" : `${r.evidenceRetentionDays} days`],
              ["Transcripts", `${r.transcriptRetentionDays} days`],
              ["Audit trail", `${r.auditRetentionDays} days (${(r.auditRetentionDays / 365).toFixed(1)} y)`],
              ["Full video", "Never recorded"],
            ]}
          />
          <Note className="mt-3">
            Only selected frames are captured as evidence; continuous video is not stored. Automated deletion against these periods is planned — the POC store is
            in-memory and cleared on restart.
          </Note>
        </Panel>

        <Panel title="Feature flags" bodyClassName="p-0">
          <ul className="divide-y divide-line text-[13px]">
            {Object.entries(tenant.featureFlags).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="text-ink-2">{humanize(k)}</span>
                <FlagBadge on={v} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title={
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-muted" aria-hidden /> Data residency
          </span>
        }
        description={`Per-deployment processing locations (docs/06 §6). Configured region: ${REGION_LABELS[tenant.region]}.`}
        bodyClassName="p-0"
      >
        <Table>
          <thead>
            <tr>
              <Th>Processing</Th>
              <Th>Target (configured)</Th>
              <Th>POC actual</Th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Media", tenant.region, "Low-rate preview relay in the platform process; WebRTC SFU planned"],
              ["Speech", tenant.region, "Browser-native speech; processing location depends on the customer's browser vendor"],
              ["Multimodal model", tenant.region, "Simulated provider in-process — no frames leave the platform"],
              ["Workflow / business actions", tenant.region, "Sandbox tool executor in-process"],
              ["Database", tenant.region, "In-memory store (not durable)"],
              ["Evidence storage", tenant.region, "In-memory frame store (not durable)"],
              ["Subprocessors", "To be listed per contract", "None contracted for this POC"],
              ["International transfers", "None intended", "None by design; browser speech vendor to be assessed in the DPIA"],
            ].map(([k, target, actual]) => (
              <tr key={k}>
                <Td className="font-medium text-ink">{k}</Td>
                <Td>{target in REGION_LABELS ? REGION_LABELS[target as keyof typeof REGION_LABELS] : target}</Td>
                <Td className="text-xs">{actual}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Users & roles" description={`${tUsers.length} users in this tenant`} bodyClassName="p-0">
          {tUsers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No users yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Team</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {tUsers.map((u) => (
                  <tr key={u.id}>
                    <Td>
                      <div className="font-medium text-ink">{u.name}</div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </Td>
                    <Td>{ROLE_LABELS[u.role] ?? u.role}</Td>
                    <Td>{tTeams.find((t) => t.id === u.teamId)?.name ?? <span className="text-muted">—</span>}</Td>
                    <Td>
                      <Badge tone={u.status === "active" ? "ok" : u.status === "invited" ? "brand" : "neutral"}>{humanize(u.status)}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel title="AI agents" bodyClassName="p-0" actions={<Link href="/platform/agents" className="text-xs font-medium text-brand hover:underline">Manage</Link>}>
          {tAgents.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No agents configured.</p>
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {tAgents.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div>
                    <div className="font-medium text-ink">{a.name}</div>
                    <div className="text-xs text-muted">
                      v{a.version} · {a.promptVersion} · {a.language.supported.join(", ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {a.model.provider === "mock" && <SimulatedTag label="Simulated model" />}
                    <ConfigStatusBadge status={a.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Workflows" bodyClassName="p-0" actions={<Link href="/platform/workflows" className="text-xs font-medium text-brand hover:underline">All workflows</Link>}>
          {tWorkflows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No workflows.</p>
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {tWorkflows.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/platform/workflows/${w.id}`} className="font-medium text-brand hover:underline">
                      {w.name} v{w.version}
                    </Link>
                    <div className="truncate text-xs text-muted">{w.changeNote}</div>
                  </div>
                  <WorkflowStatusBadge status={w.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Policies" bodyClassName="p-0" actions={<Link href="/platform/policies" className="text-xs font-medium text-brand hover:underline">All policies</Link>}>
          {tPolicies.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No policies.</p>
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {tPolicies.map((p) => (
                <li key={p.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {p.name} v{p.version}
                    </span>
                    <ConfigStatusBadge status={p.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Min confidence {pct(p.minObservationConfidence)} · {p.tools.length} tools · return to AI {p.allowReturnToAi ? "allowed" : "not allowed"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Human teams" bodyClassName="p-0" actions={<Link href="/platform/teams" className="text-xs font-medium text-brand hover:underline">All teams</Link>}>
          {tTeams.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No teams.</p>
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {tTeams.map((t) => (
                <li key={t.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{t.name}</span>
                    <span className="text-xs text-muted">
                      {t.hours} · target {formatMinutes(t.targetAnswerSec)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Chips items={t.escalationReasons.map((x) => ESCALATION_REASON_LABELS[x as keyof typeof ESCALATION_REASON_LABELS] ?? humanize(x))} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Integrations"
          bodyClassName="p-0"
          actions={<Link href="/platform/integrations" className="text-xs font-medium text-brand hover:underline">All integrations</Link>}
        >
          {tIntegrations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No integrations.</p>
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {tIntegrations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div>
                    <div className="font-medium text-ink">{i.name}</div>
                    <div className="text-xs text-muted">
                      {i.provider} · tools: {i.tools.length ? i.tools.join(", ") : "none"}
                    </div>
                  </div>
                  <IntegrationStatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Business action connectors"
        description="Where each tool runs for this client: simulated sandbox or the client's signed HTTPS endpoint"
        bodyClassName="p-0"
      >
        <ConnectorTable connectors={connectors} />
      </Panel>
    </>
  );
}
