"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { ChartBox, axisProps, chartColors, series, tooltipStyle } from "@/components/ui/charts";
import { ChartCard } from "@/components/analytics/ChartCard";
import { categoryDefs, costByClient, costByWorkflow, monthlyTrend, type CostSummary } from "@/lib/data/costs";
import { gbp } from "@/lib/data/sessions";

const grid = <CartesianGrid stroke={chartColors.grid} vertical={false} />;
const colorOf = (i: number) => series[i % series.length];
const m = { top: 6, right: 8, bottom: 0, left: -4 };
const money = (v: number) => gbp(v, 2);

export function CategoryBreakdown({ sum }: { sum: CostSummary }) {
  const data = sum.categories.map((c) => ({ name: c.label, value: c.perSession }));
  return (
    <Panel title="Cost per session by category" subtitle={`Average ${gbp(sum.perSession)} per session (fictional)`}>
      <div className="grid items-center gap-4 sm:grid-cols-2">
        <div style={{ height: 210 }}>
          <PieChart width={210} height={210} style={{ margin: "0 auto" }}>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={1} stroke="none">{data.map((_, i) => <Cell key={i} fill={colorOf(i)} />)}</Pie>
            <Tooltip {...tooltipStyle} formatter={(v: number) => money(v)} />
          </PieChart>
        </div>
        <ul className="space-y-1.5 text-[13px]">
          {sum.categories.map((c, i) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(i) }} />{c.label}</span>
              <span className="num text-ink-soft">{money(c.perSession)} <span className="text-ink-mute">· {Math.round(c.share * 100)}%</span></span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

export function ClientCost() {
  const data = costByClient();
  return (
    <ChartCard title="Cost by client" subtitle="Last 30 days, fictional £" height={210}>
      <BarChart data={data} margin={m}>{grid}<XAxis dataKey="name" interval={0} {...axisProps} tick={{ fontSize: 10, fill: "#7e8a9c" }} /><YAxis {...axisProps} tickFormatter={(v) => `£${v}`} /><Tooltip {...tooltipStyle} formatter={(v: number) => gbp(v, 0)} />
        <Bar name="Spend" dataKey="total" radius={[2, 2, 0, 0]}>{data.map((_, i) => <Cell key={i} fill={colorOf(i)} />)}</Bar></BarChart>
    </ChartCard>
  );
}

export function WorkflowCost() {
  const rows = costByWorkflow();
  return (
    <Panel title="Cost by workflow" subtitle="Last 30 days, fictional" flush>
      <div className="px-2 pt-3">
        <BarChartInline rows={rows} />
      </div>
      <Table>
        <thead><tr><Th>Workflow</Th><Th>Client</Th><Th className="text-right">Sessions</Th><Th className="text-right">Spend</Th><Th className="text-right">Per session</Th></tr></thead>
        <tbody>{rows.map((r) => (
          <Tr key={r.id}><Td className="font-medium">{r.name}</Td><Td className="text-ink-soft">{r.client}</Td><Td className="num text-right">{r.sessions.toLocaleString("en-GB")}</Td><Td className="num text-right">{gbp(r.total, 0)}</Td><Td className="num text-right">{gbp(r.perSession)}</Td></Tr>
        ))}</tbody>
      </Table>
    </Panel>
  );
}
function BarChartInline({ rows }: { rows: ReturnType<typeof costByWorkflow> }) {
  return (
    <ChartBox height={150}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={chartColors.grid} horizontal={false} /><XAxis type="number" {...axisProps} tickFormatter={(v) => `£${v}`} /><YAxis type="category" dataKey="name" width={140} {...axisProps} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => gbp(v, 0)} /><Bar name="Spend" dataKey="total" fill={chartColors.brand} radius={[0, 2, 2, 0]} />
      </BarChart>
    </ChartBox>
  );
}

export function MonthlyTrend() {
  const data = monthlyTrend();
  return (
    <ChartCard title="Monthly trend by category" subtitle="Last 6 months, fictional £ (human share falls as AI resolution improves)" height={260}>
      <BarChart data={data} margin={m}>{grid}<XAxis dataKey="month" {...axisProps} /><YAxis {...axisProps} tickFormatter={(v) => `£${(v / 1000).toFixed(1)}k`} /><Tooltip {...tooltipStyle} formatter={(v: number) => gbp(v, 0)} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
        {categoryDefs.map((c, i) => <Bar key={c.id} name={c.label} dataKey={c.id} stackId="s" fill={colorOf(i)} />)}</BarChart>
    </ChartCard>
  );
}
