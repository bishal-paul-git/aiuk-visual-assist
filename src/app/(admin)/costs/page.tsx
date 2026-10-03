"use client";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { Kpi } from "@/components/ui/Kpi";
import { costSummary } from "@/lib/data/costs";
import { gbp } from "@/lib/data/sessions";
import { CategoryBreakdown, ClientCost, MonthlyTrend, WorkflowCost } from "@/components/costs/CostCharts";
import { FormulaPanel, ProviderTable, ValueVsCost, WhatIf } from "@/components/costs/CostPanels";

export default function CostsPage() {
  const sum = useMemo(() => costSummary(), []);
  return (
    <div>
      <PageHeader title="Cost centre" description="Unit economics for visual interactions. Illustrative only: no provider billing is connected." />
      <div role="note" className="mb-4 flex items-center gap-2 rounded border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] font-semibold text-warn">
        <AlertTriangle size={15} className="shrink-0" />FICTIONAL DEMO DATA — every figure on this page is invented for demonstration and does not reflect real provider charges.
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Total spend (30 days)" value={gbp(sum.totalSpend, 0)} delta={4.2} goodWhenUp={false} hint="vs prior 30d · demo" />
        <Kpi label="Cost per session" value={gbp(sum.perSession)} delta={-2.1} goodWhenUp={false} hint="demo" />
        <Kpi label="Cost per resolved" value={gbp(sum.perResolved)} delta={-3.4} goodWhenUp={false} hint="demo" />
        <Kpi label="Human handling share" value={`${Math.round(sum.humanShare * 100)}%`} delta={-1.5} goodWhenUp={false} hint="of cost" />
        <Kpi label="Projected next 30 days" value={gbp(sum.projected, 0)} delta={4.5} goodWhenUp={false} hint="demo projection" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><CategoryBreakdown sum={sum} /></div>
        <ClientCost />
        <div className="xl:col-span-2"><MonthlyTrend /></div>
        <ValueVsCost sum={sum} />
        <div className="xl:col-span-2"><WorkflowCost /></div>
        <WhatIf />
        <div className="xl:col-span-2"><ProviderTable /></div>
        <FormulaPanel />
      </div>
    </div>
  );
}
