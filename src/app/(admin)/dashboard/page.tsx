"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Area, CartesianGrid, ComposedChart, Legend, Line, Bar, Tooltip, XAxis, YAxis, Pie, PieChart, Cell } from "recharts";
import { Activity, AlertTriangle, Camera, CarFront, Clock, Coins, PhoneCall, Radio } from "lucide-react";
import { Chip, PageHeader, Panel, Segmented, type Tone } from "@/components/ui/primitives";
import { Kpi } from "@/components/ui/Kpi";
import { ChartBox, axisProps, chartColors, series, tooltipStyle } from "@/components/ui/charts";
import { SessionTable } from "@/components/sessions/SessionTable";
import { OwnerChip, StatusChip } from "@/components/ui/domain";
import { useSessions } from "@/lib/services/sessions";
import { useAppState } from "@/lib/store";
import { allClientIds, combinedSeries, incidents } from "@/lib/data/metrics";
import { clientById } from "@/lib/data/clients";
import { fmtDuration, gbp, isLiveStatus } from "@/lib/data/sessions";
import { serviceSummary } from "@/lib/data/dashboard";

const costMix = [["Multimodal model", 0.23], ["Voice AI", 0.25], ["Human handling", 0.29], ["Video transport", 0.14], ["Compute & orchestration", 0.08], ["Storage", 0.01]] as const;
const svcTone: Record<string, Tone> = { Operational: "ok", Degraded: "warn", Incident: "bad", Maintenance: "info" };

export default function DashboardPage() {
  const filter = useAppState((s) => s.clientFilter);
  const sessions = useSessions();
  const [range, setRange] = useState<"7" | "14" | "30">("14");
  const ids = filter === "all" ? allClientIds : [filter];
  const full = useMemo(() => combinedSeries(ids, 30), [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = full.slice(-Number(range));
  const prev = full.slice(-Number(range) * 2, -Number(range));
  const avg = (a: typeof data, f: (p: (typeof data)[number]) => number) => a.reduce((x, p) => x + f(p), 0) / Math.max(1, a.length);
  const delta = (f: (p: (typeof data)[number]) => number) => (prev.length ? ((avg(data, f) - avg(prev, f)) / avg(prev, f)) * 100 : 0);

  const live = sessions.filter((s) => isLiveStatus(s.status));
  const today = full.at(-1)!;
  const esc = sessions.filter((s) => isLiveStatus(s.status) && (s.status === "escalating" || s.owner === "Human" || s.escalated)).concat(sessions.filter((s) => s.escalated && !isLiveStatus(s.status))).slice(0, 5);
  const lowConf = live.filter((s) => s.aiConfidence < 0.7).length + 38;
  const costToday = today.cost;

  return (
    <>
      <PageHeader title="Overview" description={`Operational picture for ${filter === "all" ? "all clients" : clientById(filter)?.name} · Human + AI visual assistance`}
        actions={<Segmented value={range} onChange={setRange} options={[{ id: "7", label: "7 days" }, { id: "14", label: "14 days" }, { id: "30", label: "30 days" }]} />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active sessions" value={live.length} hint="right now" icon={<Radio size={14} />} spark={[9, 11, 14, 12, 10, 12, 15, live.length]} />
        <Kpi label="Sessions today" value={today.sessions} delta={delta((p) => p.sessions)} hint={`vs prev ${range}d avg`} icon={<Activity size={14} />} spark={data.map((p) => p.sessions)} />
        <Kpi label="AI resolution rate" value={`${avg(data, (p) => p.aiResolved).toFixed(1)}%`} delta={delta((p) => p.aiResolved)} icon={<Camera size={14} />} spark={data.map((p) => p.aiResolved)} />
        <Kpi label="Human escalation rate" value={`${avg(data, (p) => p.escalated).toFixed(1)}%`} delta={delta((p) => p.escalated)} goodWhenUp={false} icon={<PhoneCall size={14} />} spark={data.map((p) => p.escalated)} />
        <Kpi label="Avg session duration" value={fmtDuration(Math.round(avg(data, (p) => p.avgDurationSec)))} delta={delta((p) => p.avgDurationSec)} goodWhenUp={false} icon={<Clock size={14} />} spark={data.map((p) => p.avgDurationSec)} />
        <Kpi label="Visual-confidence issues" value={lowConf} delta={-6.4} goodWhenUp={false} hint="below 0.70 threshold" icon={<AlertTriangle size={14} />} spark={[44, 52, 48, 41, 46, 39, lowConf]} />
        <Kpi label="Avg cost / interaction" value={gbp(costToday / today.sessions)} delta={-2.1} goodWhenUp={false} hint="demo data" icon={<Coins size={14} />} spark={data.map((p) => p.cost / p.sessions)} />
        <Kpi label="Engineer visits avoided" value={data.reduce((a, p) => a + p.visitsAvoided, 0).toLocaleString("en-GB")} delta={delta((p) => p.visitsAvoided)} hint={`last ${range} days`} icon={<CarFront size={14} />} spark={data.map((p) => p.visitsAvoided)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Session volume & resolution" subtitle="Bars: sessions · lines: AI resolution vs human escalation (%)">
          <ChartBox height={270}>
            <ComposedChart data={data} margin={{ left: -12, right: 4, top: 8 }}>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" /><YAxis yAxisId="l" {...axisProps} /><YAxis yAxisId="r" orientation="right" domain={[0, 100]} {...axisProps} />
              <Tooltip {...tooltipStyle} /><Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
              <Bar isAnimationActive={false} yAxisId="l" dataKey="sessions" name="Sessions" fill={chartColors.brand} fillOpacity={0.25} radius={[2, 2, 0, 0]} />
              <Line isAnimationActive={false} yAxisId="r" dataKey="aiResolved" name="AI resolution %" stroke={chartColors.brand} strokeWidth={2} dot={false} />
              <Line isAnimationActive={false} yAxisId="r" dataKey="escalated" name="Escalation %" stroke={chartColors.amber} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ChartBox>
        </Panel>

        <Panel title="System health" subtitle="Platform status: partial degradation" actions={<Link href="/health" className="text-2xs font-medium text-brand-strong hover:underline">Open</Link>}>
          <ul className="space-y-1.5">
            {serviceSummary.map((sv) => (
              <li key={sv.name} className="flex items-center justify-between text-[13px]">
                <span>{sv.name}</span>
                <span className="flex items-center gap-2"><span className="num text-2xs text-ink-mute">{sv.latency}</span><Chip tone={svcTone[sv.status]} dot>{sv.status}</Chip></span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Recent live sessions" flush actions={<Link href="/live" className="text-2xs font-medium text-brand-strong hover:underline">View all live</Link>}>
          <SessionTable rows={live.slice(0, 6)} cols={["id", "client", "status", "owner", "duration", "confidence"]} />
        </Panel>
        <Panel title="Recent escalations" subtitle="Human + AI handovers" flush>
          <ul className="divide-y divide-line/70">
            {esc.map((s) => (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-subtle/60">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2"><span className="font-mono text-xs font-semibold">{s.id}</span><StatusChip status={s.status} /></p>
                    <p className="mt-0.5 truncate text-xs text-ink-soft">{s.escalationReason} · {clientById(s.clientId)?.name}</p>
                  </div>
                  <OwnerChip owner={s.owner} name={s.humanAgent} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Recent incidents" flush actions={<Link href="/health" className="text-2xs font-medium text-brand-strong hover:underline">All incidents</Link>}>
          <ul className="divide-y divide-line/70">
            {incidents.map((i) => (
              <li key={i.id}>
                <Link href="/health" className="flex items-start gap-3 px-4 py-2.5 hover:bg-subtle/60">
                  <Chip tone={i.severity === "sev1" ? "bad" : i.severity === "sev2" ? "warn" : "neutral"}>{i.severity.toUpperCase()}</Chip>
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{i.title}</p><p className="text-2xs text-ink-mute">{i.id} · {i.service} · {i.startedAt}</p></div>
                  <Chip tone={i.state === "resolved" ? "ok" : i.state === "monitoring" ? "info" : "warn"} dot>{i.state}</Chip>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Cost snapshot" subtitle="Fictional demo data · today" actions={<Link href="/costs" className="text-2xs font-medium text-brand-strong hover:underline">Cost centre</Link>}>
          <div className="flex items-center gap-4">
            <div className="h-36 w-36 shrink-0">
              <ChartBox height={144}>
                <PieChart><Pie isAnimationActive={false} data={costMix.map(([name, v]) => ({ name, value: v }))} dataKey="value" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">{costMix.map((_, i) => <Cell key={i} fill={series[i % series.length]} />)}</Pie><Tooltip {...tooltipStyle} formatter={(v: number) => `${Math.round(v * 100)}%`} /></PieChart>
              </ChartBox>
            </div>
            <div className="min-w-0 flex-1">
              <p className="label">Spend today</p><p className="num text-xl font-semibold">{gbp(costToday, 0)}</p>
              <ul className="mt-2 space-y-1">{costMix.map(([n, v], i) => <li key={n} className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-sm" style={{ background: series[i % series.length] }} /><span className="flex-1 truncate text-ink-soft">{n}</span><span className="num">{Math.round(v * 100)}%</span></li>)}</ul>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
