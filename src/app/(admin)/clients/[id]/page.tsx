"use client";
import { use, useState } from "react";
import { notFound } from "next/navigation";
import { Panel, PageHeader, Tabs } from "@/components/ui/primitives";
import { agents } from "@/lib/data/agents";
import { workflows } from "@/lib/data/workflows";
import { clientById } from "@/lib/data/clients";
import { policies } from "@/lib/data/policies";
import { clientUsers } from "@/lib/data/admin-extras";
import { BrandPreview } from "@/components/clients/BrandPreview";
import { ClientStatusChip, InitialsBlock } from "@/components/clients/shared";
import { AgentsTab, IntegrationsTab, OverviewTab, PoliciesTab, SettingsTab, UsersTab, WorkflowsTab } from "@/components/clients/ClientTabs";

type Tab = "overview" | "users" | "agents" | "workflows" | "policies" | "integrations" | "settings";

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = clientById(id);
  const [tab, setTab] = useState<Tab>("overview");
  const [accent, setAccent] = useState(client?.accent ?? "#0d7e8f");
  const [displayName, setDisplayName] = useState(client?.name ?? "");
  if (!client) notFound();

  const na = agents.filter((a) => a.clientId === client.id).length;
  const nw = workflows.filter((w) => w.clientId === client.id).length;
  const np = policies.filter((p) => p.clientIds.includes(client.id)).length;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: client.name }]}
        title={<span className="flex items-center gap-3"><InitialsBlock initials={client.initials} color={accent} size={34} />{displayName}<ClientStatusChip status={client.status} /></span>}
        description={`${client.industry} · ${client.region} · ${client.contractTier} tier`}
      />
      <Panel className="mb-4" title="Branding preview" subtitle="Customer-facing session header as rendered for this tenant">
        <div className="grid items-center gap-5 md:grid-cols-[1fr_minmax(0,420px)]">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <InitialsBlock initials={client.initials} color={accent} size={56} />
              <div><p className="label">Accent</p><p className="font-mono text-[13px]">{accent.toUpperCase()}</p><span className="mt-1 block h-2 w-24 rounded" style={{ background: accent }} /></div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-[13px]">
              <dt className="label">Retention</dt><dd>{client.retentionDays} days</dd>
              <dt className="label">Users</dt><dd>{clientUsers[client.id]?.length ?? 0}</dd>
            </dl>
          </div>
          <BrandPreview name={displayName} initials={client.initials} accent={accent} />
        </div>
      </Panel>
      <Tabs<Tab> className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: "overview", label: "Overview" }, { id: "users", label: "Users", count: clientUsers[client.id]?.length }, { id: "agents", label: "AI agents", count: na },
        { id: "workflows", label: "Workflows", count: nw }, { id: "policies", label: "Policies", count: np }, { id: "integrations", label: "Integrations" }, { id: "settings", label: "Settings" },
      ]} />
      <div hidden={tab !== "overview"}><OverviewTab client={client} /></div>
      <div hidden={tab !== "users"}><UsersTab client={client} /></div>
      <div hidden={tab !== "agents"}><AgentsTab client={client} /></div>
      <div hidden={tab !== "workflows"}><WorkflowsTab client={client} /></div>
      <div hidden={tab !== "policies"}><PoliciesTab client={client} /></div>
      <div hidden={tab !== "integrations"}><IntegrationsTab client={client} /></div>
      <div hidden={tab !== "settings"}><SettingsTab client={client} accent={accent} onAccent={setAccent} displayName={displayName} onDisplayName={setDisplayName} /></div>
    </>
  );
}
