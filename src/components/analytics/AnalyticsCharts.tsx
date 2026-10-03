"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, chartColors, series, tooltipStyle } from "@/components/ui/charts";
import { categoryDefs } from "@/lib/data/costs";
import { failureBreakdown } from "@/lib/data/analytics";
import type { DayPoint } from "@/lib/data/metrics";
import { ChartCard } from "./ChartCard";

const grid = <CartesianGrid stroke={chartColors.grid} vertical={false} />;
const legend = <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />;
const m = { top: 6, right: 8, bottom: 0, left: -12 };

export function AnalyticsCharts({ data }: { data: DayPoint[] }) {
  const cum = data.reduce<{ date: string; v: number }[]>((a, d) => [...a, { date: d.date, v: (a.at(-1)?.v ?? 0) + d.visitsAvoided }], []);
  const dur = data.map((d) => ({ ...d, min: +(d.avgDurationSec / 60).toFixed(2) }));
  const costStack = data.map((d) => ({ date: d.date, ...Object.fromEntries(categoryDefs.map((c) => [c.id, +(d.cost * c.share).toFixed(2)])) }));
  const fails = failureBreakdown(data);
  const tick = { ...axisProps, interval: Math.max(0, Math.ceil(data.length / 8) - 1) };

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <ChartCard title="AI resolution vs human escalation" subtitle="% of sessions">
        <LineChart data={data} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} domain={[0, 100]} unit="%" /><Tooltip {...tooltipStyle} />{legend}
          <Line name="AI resolved" dataKey="aiResolved" stroke={chartColors.brand} strokeWidth={2} dot={false} />
          <Line name="Human escalated" dataKey="escalated" stroke={chartColors.violet} strokeWidth={2} dot={false} /></LineChart>
      </ChartCard>
      <ChartCard title="Session volume" subtitle="Sessions per day">
        <BarChart data={data} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} /><Tooltip {...tooltipStyle} /><Bar name="Sessions" dataKey="sessions" fill={chartColors.blue} radius={[2, 2, 0, 0]} /></BarChart>
      </ChartCard>
      <ChartCard title="Average session duration" subtitle="Minutes">
        <AreaChart data={dur} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} domain={["auto", "auto"]} /><Tooltip {...tooltipStyle} />
          <Area name="Minutes" dataKey="min" stroke={chartColors.amber} fill={chartColors.amber} fillOpacity={0.15} strokeWidth={2} /></AreaChart>
      </ChartCard>
      <ChartCard title="Frames analysed per session" subtitle="Average selected frames">
        <LineChart data={data} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} domain={["auto", "auto"]} /><Tooltip {...tooltipStyle} /><Line name="Frames" dataKey="frames" stroke={chartColors.violet} strokeWidth={2} dot={false} /></LineChart>
      </ChartCard>
      <ChartCard title="Visual confidence" subtitle="Average model confidence; dashed line is the 0.70 policy threshold">
        <LineChart data={data} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} domain={[0.6, 1]} /><Tooltip {...tooltipStyle} />
          <ReferenceLine y={0.7} stroke={chartColors.rose} strokeDasharray="4 3" label={{ value: "0.70", fontSize: 10, fill: chartColors.rose, position: "insideBottomRight" }} />
          <Line name="Confidence" dataKey="confidence" stroke={chartColors.brand} strokeWidth={2} dot={false} /></LineChart>
      </ChartCard>
      <ChartCard title="Workflow completion" subtitle="% of sessions completing the workflow">
        <AreaChart data={data} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} domain={[40, 100]} unit="%" /><Tooltip {...tooltipStyle} />
          <Area name="Completion" dataKey="workflowCompletion" stroke={chartColors.green} fill={chartColors.green} fillOpacity={0.15} strokeWidth={2} /></AreaChart>
      </ChartCard>
      <ChartCard title="Failed sessions" subtitle="Count per day">
        <BarChart data={data} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} allowDecimals={false} /><Tooltip {...tooltipStyle} /><Bar name="Failed" dataKey="failed" fill={chartColors.rose} radius={[2, 2, 0, 0]} /></BarChart>
      </ChartCard>
      <ChartCard title="Failure reasons" subtitle="Share of failed sessions in the period">
        <BarChart data={fails} layout="vertical" margin={{ top: 6, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={chartColors.grid} horizontal={false} /><XAxis type="number" {...axisProps} allowDecimals={false} /><YAxis type="category" dataKey="reason" width={150} {...axisProps} />
          <Tooltip {...tooltipStyle} /><Bar name="Failures" dataKey="count" fill={chartColors.slate} radius={[0, 2, 2, 0]} /></BarChart>
      </ChartCard>
      <ChartCard title="Field-visit avoidance (cumulative)" subtitle="Engineer visits avoided">
        <AreaChart data={cum} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} /><Tooltip {...tooltipStyle} />
          <Area name="Visits avoided" dataKey="v" stroke={chartColors.brand} fill={chartColors.brand} fillOpacity={0.15} strokeWidth={2} /></AreaChart>
      </ChartCard>
      <ChartCard title="Cost by category" subtitle="Fictional demo cost, £ per day, stacked" className="lg:col-span-2 xl:col-span-3" height={240}>
        <AreaChart data={costStack} margin={m}>{grid}<XAxis dataKey="date" {...tick} /><YAxis {...axisProps} unit="" tickFormatter={(v) => `£${v}`} /><Tooltip {...tooltipStyle} formatter={(v: number) => `£${v.toFixed(2)}`} />{legend}
          {categoryDefs.map((c, i) => <Area key={c.id} name={c.label} dataKey={c.id} stackId="c" stroke={series[i % series.length]} fill={series[i % series.length]} fillOpacity={0.7} strokeWidth={1} />)}</AreaChart>
      </ChartCard>
    </div>
  );
}
