"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpen, Check } from "lucide-react";
import { Button, Chip, Drawer, KeyValue, TextArea } from "@/components/ui/primitives";
import { ChartBox, axisProps, chartColors, tooltipStyle } from "@/components/ui/charts";
import { incidents } from "@/lib/data/metrics";
import type { ServiceHealth, ServiceStatus } from "@/lib/types/health";
import { IncidentStateChip, StatusChip, UptimeStrip } from "./HealthChips";

export function ServiceDrawer({ service, status, acknowledged, notes, resolvedIncidents, onClose, onAck, onNote, onOpenIncident, onOpenService }: {
  service: ServiceHealth | null; status: ServiceStatus; acknowledged: boolean; notes: string[]; resolvedIncidents: Record<string, boolean>;
  onClose: () => void; onAck: () => void; onNote: (t: string) => void; onOpenIncident: (id: string) => void; onOpenService: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inc = service?.incidentId ? incidents.find((i) => i.id === service.incidentId) : undefined;
  const incState = inc ? (resolvedIncidents[inc.id] ? "resolved" : inc.state) : undefined;
  return (
    <Drawer open={!!service} onClose={onClose} width="max-w-2xl" title={service ? <span className="flex items-center gap-2">{service.name} <StatusChip status={status} /></span> : ""} subtitle={service?.description}
      footer={service && status !== "Operational" ? <Button variant={acknowledged ? "secondary" : "primary"} disabled={acknowledged} onClick={onAck}>{acknowledged ? <><Check size={14} />Acknowledged</> : "Acknowledge"}</Button> : undefined}>
      {service && (
        <div className="space-y-5">
          <KeyValue cols={3} items={[
            { k: "p50 / p95", v: <span className="num">{service.p50.toLocaleString("en-GB")} / {service.p95.toLocaleString("en-GB")} ms</span> },
            { k: "Uptime 30d", v: <span className="num">{service.uptime30.toFixed(2)}%</span> },
            { k: "Errors 24h", v: <span className="num">{service.errors24h}</span> },
            { k: "Region", v: service.region },
            { k: "Provider", v: <>{service.provider}</> },
            { k: "Runbook", v: <span className="inline-flex items-center gap-1 text-brand"><BookOpen size={12} />{service.runbook}</span> },
          ]} />

          {service.maintenance && (
            <div className="rounded border border-info/40 bg-info-soft px-3 py-2.5 text-[13px]">
              <p className="font-semibold text-info">Scheduled maintenance: {service.maintenance.window}</p>
              <p className="mt-0.5 text-ink-soft">{service.maintenance.note}</p>
            </div>
          )}
          {inc && incState && (
            <div className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2.5">
              <div className="min-w-0"><p className="label">Active incident</p><p className="truncate text-[13px] font-medium">{inc.id} · {inc.title}</p></div>
              <div className="flex shrink-0 items-center gap-2"><IncidentStateChip state={incState} /><Button size="sm" onClick={() => onOpenIncident(inc.id)}>View</Button></div>
            </div>
          )}

          <div>
            <p className="label mb-1.5">Latency, last 24h (ms)</p>
            <ChartBox height={200}>
              <LineChart data={service.latency24h} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="t" {...axisProps} interval={3} />
                <YAxis {...axisProps} width={44} />
                <Tooltip {...tooltipStyle} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="p50" name="p50" stroke={chartColors.brand} strokeWidth={1.75} dot={false} />
                <Line type="monotone" dataKey="p95" name="p95" stroke={chartColors.amber} strokeWidth={1.75} dot={false} />
              </LineChart>
            </ChartBox>
          </div>
          <div>
            <p className="label mb-1.5">Errors per hour</p>
            <ChartBox height={130}>
              <BarChart data={service.latency24h} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="t" {...axisProps} interval={3} />
                <YAxis {...axisProps} width={44} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="errors" name="Errors" fill={chartColors.rose} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartBox>
          </div>
          <div>
            <p className="label mb-1.5">Uptime, last 30 days</p>
            <UptimeStrip days={service.uptimeDays} className="h-8" />
            <div className="mt-1 flex justify-between text-2xs text-ink-mute"><span>30 days ago</span><span>Today</span></div>
          </div>

          <div>
            <p className="label mb-1.5">Dependencies</p>
            {service.dependencies.length === 0 ? <p className="text-[13px] text-ink-mute">No upstream dependencies.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {service.dependencies.map((d) => (
                  <button key={d} onClick={() => onOpenService(d)} className="rounded border border-line px-2 py-1 text-xs hover:bg-subtle">{d}</button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="label mb-1.5">Recent events</p>
            <ul className="space-y-1.5">
              {service.events.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px]"><Chip tone={e.tone}>{e.at}</Chip><span className="text-ink-soft">{e.text}</span></li>
              ))}
              {notes.map((n, i) => (
                <li key={`n${i}`} className="flex items-start gap-2 text-[13px]"><Chip tone="brand">Note</Chip><span className="text-ink-soft">{n}</span></li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label mb-1.5">Add maintenance note</p>
            <TextArea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Visible to operators on this service (local demo state)" />
            <div className="mt-2 flex justify-end"><Button size="sm" disabled={!draft.trim()} onClick={() => { onNote(draft.trim()); setDraft(""); }}>Add note</Button></div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
