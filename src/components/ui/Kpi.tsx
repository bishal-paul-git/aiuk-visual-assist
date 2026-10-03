import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "./charts";
import { cn } from "./cn";

export function Kpi({ label, value, delta, goodWhenUp = true, spark, hint, icon }: { label: string; value: ReactNode; delta?: number; goodWhenUp?: boolean; spark?: number[]; hint?: string; icon?: ReactNode }) {
  const good = delta === undefined ? true : goodWhenUp ? delta >= 0 : delta <= 0;
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="label">{label}</p>
        {icon && <span className="text-ink-mute">{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="num text-[22px] font-semibold leading-none tracking-tight">{value}</p>
        {spark && <Sparkline data={spark} color={good ? "#0d7e8f" : "#d2375a"} />}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-2xs">
        {delta !== undefined && (
          <span className={cn("inline-flex items-center font-semibold", good ? "text-ok" : "text-bad")}>
            {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-ink-mute">{hint}</span>}
      </div>
    </div>
  );
}
