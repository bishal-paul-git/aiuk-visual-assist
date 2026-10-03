import { Chip, type Tone } from "@/components/ui/primitives";
import type { ServiceStatus } from "@/lib/types/health";
import type { Incident } from "@/lib/types";
import { cn } from "@/components/ui/cn";

export const statusTone: Record<ServiceStatus, Tone> = { Operational: "ok", Degraded: "warn", Incident: "bad", Maintenance: "info" };
export const StatusChip = ({ status }: { status: ServiceStatus }) => <Chip tone={statusTone[status]} dot pulse={status === "Degraded" || status === "Incident"}>{status}</Chip>;

export const sevTone = { sev1: "bad", sev2: "warn", sev3: "neutral" } as const;
export const stateTone = { investigating: "bad", monitoring: "warn", resolved: "ok" } as const;
export const SeverityChip = ({ sev }: { sev: Incident["severity"] }) => <Chip tone={sevTone[sev]}>{sev.toUpperCase()}</Chip>;
export const IncidentStateChip = ({ state }: { state: Incident["state"] }) => <Chip tone={stateTone[state]} dot>{state[0].toUpperCase() + state.slice(1)}</Chip>;

/** 30-day uptime strip: one bar per day. */
export function UptimeStrip({ days, className }: { days: number[]; className?: string }) {
  return (
    <div className={cn("flex h-6 items-end gap-px", className)} role="img" aria-label="30 day uptime">
      {days.map((d, i) => (
        <span key={i} title={`Day ${i + 1}: ${d.toFixed(2)}%`} className={cn("flex-1 rounded-[1px]", d >= 99.8 ? "bg-ok" : d >= 99.5 ? "bg-warn" : "bg-bad")} style={{ height: `${Math.max(30, (d - 98) / 2 * 100)}%` }} />
      ))}
    </div>
  );
}
