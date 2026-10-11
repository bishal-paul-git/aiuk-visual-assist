import type { ReactNode } from "react";

/** Single-series horizontal bars with direct labels (one hue — magnitude only). */
export function BarList({ rows, format = (n) => String(n), empty = "No data" }: { rows: { label: ReactNode; value: number; hint?: ReactNode }[]; format?: (n: number) => string; empty?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink-2">{r.label}</span>
            <span className="tabular shrink-0 font-medium text-ink">
              {format(r.value)}
              {r.hint && <span className="ml-1.5 font-normal text-muted">{r.hint}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-line">
            <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
