"use client";

import { useState } from "react";
import { Table, Td, Th } from "@/components/ui/primitives";

/** Validated categorical slots 1–4 (dataviz reference palette, fixed order). */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;

export interface StackSeries {
  key: string;
  label: string;
}

export interface StackDatum {
  label: string;
  values: Record<string, number>;
}

export function StackedBars({
  data,
  series,
  height = 180,
  ariaLabel,
}: {
  data: StackDatum[];
  series: StackSeries[];
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const totals = data.map((d) => series.reduce((n, s) => n + (d.values[s.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const W = 640;
  const H = height;
  const padL = 28;
  const padB = 22;
  const plotW = W - padL;
  const plotH = H - padB - 6;
  const band = plotW / data.length;
  const barW = Math.min(26, band * 0.62);
  const ticks = [0, niceMax / 2, niceMax];
  const seriesTotals = series.map((s) => data.reduce((n, d) => n + (d.values[s.key] ?? 0), 0));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} aria-hidden />
              {s.label} <span className="tabular text-muted">{seriesTotals[i]}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? (
        <Table>
          <thead>
            <tr>
              <Th>Day</Th>
              {series.map((s) => (
                <Th key={s.key} align="right">
                  {s.label}
                </Th>
              ))}
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.label}>
                <Td>{d.label}</Td>
                {series.map((s) => (
                  <Td key={s.key} align="right">
                    {d.values[s.key] ?? 0}
                  </Td>
                ))}
                <Td align="right">{totals[i]}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => {
              const y = 6 + plotH - (t / niceMax) * plotH;
              return (
                <g key={t}>
                  <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
                  <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill="var(--muted)">
                    {t}
                  </text>
                </g>
              );
            })}
            {data.map((d, i) => {
              const x = padL + band * i + (band - barW) / 2;
              let y = 6 + plotH;
              const segs = series
                .map((s, si) => ({ v: d.values[s.key] ?? 0, color: SERIES_COLORS[si], key: s.key }))
                .filter((s) => s.v > 0);
              return (
                <g key={d.label} onMouseEnter={() => setHover(i)}>
                  <rect x={padL + band * i} y={0} width={band} height={H - padB} fill={hover === i ? "var(--surface-2)" : "transparent"} />
                  {segs.map((s, si) => {
                    const h = (s.v / niceMax) * plotH;
                    y -= h;
                    const top = si === segs.length - 1;
                    const gap = si > 0 ? 2 : 0;
                    return top ? (
                      <path key={s.key} d={roundedTop(x, y, barW, Math.max(0, h - gap), 4)} fill={s.color} />
                    ) : (
                      <rect key={s.key} x={x} y={y} width={barW} height={Math.max(0, h - gap)} fill={s.color} />
                    );
                  })}
                  {(i % Math.ceil(data.length / 7) === 0 || i === data.length - 1) && (
                    <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
              style={{ left: `${Math.min(70, ((padL + band * hover + band) / W) * 100)}%` }}
            >
              <div className="mb-1 font-semibold text-ink">{data[hover].label}</div>
              {series.map((s, i) => (
                <div key={s.key} className="flex items-center justify-between gap-4 text-ink-2">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm" style={{ background: SERIES_COLORS[i] }} aria-hidden />
                    {s.label}
                  </span>
                  <span className="tabular">{data[hover].values[s.key] ?? 0}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium text-ink">
                <span>Total</span>
                <span className="tabular">{totals[hover]}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
