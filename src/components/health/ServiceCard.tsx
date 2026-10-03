"use client";
import { Sparkline, chartColors } from "@/components/ui/charts";
import { cn } from "@/components/ui/cn";
import type { ServiceHealth, ServiceStatus } from "@/lib/types/health";
import { StatusChip, UptimeStrip } from "./HealthChips";

const accent: Record<ServiceStatus, string> = { Operational: chartColors.brand, Degraded: chartColors.amber, Incident: chartColors.rose, Maintenance: chartColors.blue };

export function ServiceCard({ service, status, acknowledged, onOpen }: { service: ServiceHealth; status: ServiceStatus; acknowledged: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className={cn("rounded-lg border bg-surface p-3.5 text-left shadow-card transition-colors hover:bg-subtle/50", status === "Operational" ? "border-line" : status === "Maintenance" ? "border-info/40" : "border-warn/50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{service.name}</p>
          <p className="truncate text-2xs text-ink-mute">{service.region.split(" · ")[0]}</p>
        </div>
        <StatusChip status={status} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="label">p95 latency</p>
          <p className="num text-lg font-semibold leading-tight">{service.p95.toLocaleString("en-GB")}<span className="ml-0.5 text-xs font-normal text-ink-mute">ms</span></p>
          <p className="num text-2xs text-ink-mute">p50 {service.p50.toLocaleString("en-GB")} ms</p>
        </div>
        <Sparkline data={service.latency24h.map((p) => p.p95)} color={accent[status]} w={96} h={32} />
      </div>
      <UptimeStrip days={service.uptimeDays} className="mt-3 h-4" />
      <div className="mt-2 flex items-center justify-between text-2xs text-ink-mute">
        <span className="num">{service.uptime30.toFixed(2)}% uptime 30d</span>
        <span className="num">{service.errors24h} errors 24h</span>
      </div>
      {acknowledged && <p className="mt-1.5 text-2xs font-medium text-info">Acknowledged</p>}
    </button>
  );
}
