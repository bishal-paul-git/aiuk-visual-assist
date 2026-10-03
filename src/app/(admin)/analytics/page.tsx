"use client";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, Chip, PageHeader, Panel, Segmented, Select, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { Kpi } from "@/components/ui/Kpi";
import { useAppState } from "@/lib/store";
import { clients } from "@/lib/data/clients";
import { agents } from "@/lib/data/agents";
import { workflows } from "@/lib/data/workflows";
import { analyticsData, deltaPct, summarise, workflowTable, type Filters, type RangeId } from "@/lib/data/analytics";
import { fmtDuration, gbp } from "@/lib/data/sessions";
import { AnalyticsCharts } from "@/components/analytics/AnalyticsCharts";
import { useToast } from "@/components/analytics/Toast";

const fmt = (v: number, k: string) => k === "int" ? Math.round(v).toLocaleString("en-GB") : k === "pct" ? `${v.toFixed(1)}%` : k === "dur" ? fmtDuration(Math.round(v)) : k === "conf" ? v.toFixed(2) : gbp(v);

export default function AnalyticsPage() {
  const globalClient = useAppState((s) => s.clientFilter);
  const [client, setClient] = useState<string>("global");
  const [workflow, setWorkflow] = useState("all");
  const [agent, setAgent] = useState("all");
  const [range, setRange] = useState<RangeId>("30d");
  const { toast, node } = useToast();

  const clientSel = client === "global" ? globalClient : (client as Filters["client"]);
  // Keep workflow/agent selections consistent with the client scope.
  const wfOpts = workflows.filter((w) => clientSel === "all" || w.clientId === clientSel);
  const agOpts = agents.filter((a) => clientSel === "all" || a.clientId === clientSel);
  useEffect(() => {
    if (workflow !== "all" && !wfOpts.some((w) => w.id === workflow)) setWorkflow("all");
    if (agent !== "all" && !agOpts.some((a) => a.id === agent)) setAgent("all");
  }, [clientSel]); // eslint-disable-line react-hooks/exhaustive-deps

  const f: Filters = { client: clientSel, workflow, agent, range };
  const { cur, prev, share } = useMemo(() => analyticsData(f), [clientSel, workflow, agent, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const kpis = summarise(cur, prev);
  const rows = useMemo(() => workflowTable(f, range), [clientSel, workflow, agent, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const rangeLabel = `${cur[0].date} – ${cur.at(-1)!.date} 2026`;

  return (
    <div>
      <PageHeader title="Analytics" description="Resolution, escalation, visual quality and cost trends. Demo data; deltas compare with the previous period of equal length."
        actions={<Button onClick={() => toast("Export CSV (demo): no file was created or downloaded.", "info")}><Download size={14} />Export CSV (demo)</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select label="Client" value={client} onChange={setClient} options={[{ value: "global", label: `Top-bar scope (${globalClient === "all" ? "all clients" : clients.find((c) => c.id === globalClient)?.name})` }, { value: "all", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />
        <Select label="Workflow" value={workflow} onChange={setWorkflow} options={[{ value: "all", label: "All workflows" }, ...wfOpts.map((w) => ({ value: w.id, label: w.name }))]} />
        <Select label="AI agent" value={agent} onChange={setAgent} options={[{ value: "all", label: "All agents" }, ...agOpts.map((a) => ({ value: a.id, label: a.name }))]} />
        <Segmented value={range} onChange={setRange} options={[{ id: "7d", label: "7 days" }, { id: "14d", label: "14 days" }, { id: "30d", label: "30 days" }]} />
        <Chip tone="neutral">{rangeLabel}</Chip>
        {share < 1 && <Chip tone="info">{Math.round(share * 100)}% of client traffic</Chip>}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((k) => <Kpi key={k.label} label={k.label} value={fmt(k.value, k.fmt)} delta={deltaPct(k.value, k.prev)} goodWhenUp={k.goodWhenUp} spark={k.spark.length > 1 ? k.spark : undefined} hint="vs prior" />)}
      </div>

      <AnalyticsCharts data={cur} />

      <Panel title="By workflow" subtitle={`Summary for ${rangeLabel}`} flush className="mt-4">
        <Table>
          <thead><tr><Th>Workflow</Th><Th>Client</Th><Th className="text-right">Sessions</Th><Th className="text-right">AI resolved</Th><Th className="text-right">Completion</Th><Th className="text-right">Confidence</Th><Th className="text-right">Visits avoided</Th><Th className="text-right">Cost (fictional)</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <Tr><Td colSpan={8} className="py-6 text-center text-ink-mute">No workflows match these filters</Td></Tr>}
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.name} {r.status !== "published" && <Chip tone="neutral" className="ml-1">{r.status.replace("_", " ")}</Chip>}</Td>
                <Td className="text-ink-soft">{r.client}</Td>
                <Td className="num text-right">{r.sessions.toLocaleString("en-GB")}</Td>
                <Td className="num text-right">{r.ai.toFixed(1)}%</Td>
                <Td className="num text-right">{r.completion.toFixed(1)}%</Td>
                <Td className="num text-right">{r.confidence.toFixed(2)}</Td>
                <Td className="num text-right">{Math.round(r.avoided).toLocaleString("en-GB")}</Td>
                <Td className="num text-right">{gbp(r.cost, 0)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      {node}
    </div>
  );
}
