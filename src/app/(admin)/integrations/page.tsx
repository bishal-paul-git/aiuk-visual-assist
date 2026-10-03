"use client";
import { useMemo, useState } from "react";
import { PageHeader, Select, EmptyState } from "@/components/ui/primitives";
import { useAppState } from "@/lib/store";
import { integrations, statusLabel, statusOrder } from "@/lib/data/integrations";
import type { IntegrationCategory, IntegrationStatus } from "@/lib/types/integrations";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { IntegrationDrawer } from "@/components/integrations/IntegrationDrawer";
import { ArchitectureDiagram } from "@/components/integrations/ArchitectureDiagram";
import { useToast } from "@/components/analytics/Toast";

const categories: IntegrationCategory[] = ["Real-time media", "Voice", "AI model", "Orchestration", "Business systems"];

export default function IntegrationsPage() {
  const overrides = useAppState((s) => s.integrationStatus);
  const [cat, setCat] = useState("all");
  const [st, setSt] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const { toast, node } = useToast();

  const statusOf = (id: string): IntegrationStatus => (overrides[id] as IntegrationStatus) ?? integrations.find((i) => i.id === id)!.defaultStatus;
  const statuses = useMemo(() => Object.fromEntries(integrations.map((i) => [i.id, (overrides[i.id] as IntegrationStatus) ?? i.defaultStatus])) as Record<string, IntegrationStatus>, [overrides]);
  const counts = statusOrder.map((s) => ({ s, n: integrations.filter((i) => statuses[i.id] === s).length }));
  const list = integrations.filter((i) => (cat === "all" || i.category === cat) && (st === "all" || statuses[i.id] === st));
  const open = integrations.find((i) => i.id === openId) ?? null;

  return (
    <div>
      <PageHeader title="Integrations" description="Catalogue of providers and client systems in the target architecture. Visual only: nothing here connects to a real service." />
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
        <div className="bg-surface px-4 py-3"><p className="label">Total</p><p className="num text-lg font-semibold">{integrations.length}</p></div>
        {counts.map(({ s, n }) => (
          <button key={s} onClick={() => setSt(st === s ? "all" : s)} className={`bg-surface px-4 py-3 text-left hover:bg-subtle ${st === s ? "ring-2 ring-inset ring-brand" : ""}`}>
            <p className="label">{statusLabel[s]}</p><p className="num text-lg font-semibold">{n}</p>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select label="Category" value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
        <Select label="Status" value={st} onChange={setSt} options={[{ value: "all", label: "All statuses" }, ...statusOrder.map((s) => ({ value: s, label: statusLabel[s] }))]} />
        <span className="text-xs text-ink-mute">{list.length} of {integrations.length} shown</span>
      </div>
      {list.length === 0 ? <EmptyState title="No integrations match these filters" /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((i) => <IntegrationCard key={i.id} item={i} status={statusOf(i.id)} onOpen={() => setOpenId(i.id)} />)}
        </div>
      )}
      <div className="mt-6"><ArchitectureDiagram statuses={statuses} /></div>
      <IntegrationDrawer item={open} status={open ? statusOf(open.id) : "demo"} onClose={() => setOpenId(null)} toast={toast} />
      {node}
    </div>
  );
}
