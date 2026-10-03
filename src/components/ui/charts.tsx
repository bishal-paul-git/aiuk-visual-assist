"use client";
import { ResponsiveContainer } from "recharts";
import type { ReactNode } from "react";

/** Chart palette: restrained, colour-blind-aware, shared across every chart. */
export const chartColors = { brand: "#0d7e8f", blue: "#2f6bd7", violet: "#7c4dcf", amber: "#d98a1c", rose: "#d2375a", green: "#2a9d5c", slate: "#8592a6", grid: "#e3e8ee" };
export const series = [chartColors.brand, chartColors.blue, chartColors.amber, chartColors.violet, chartColors.rose, chartColors.green];
export const axisProps = { tick: { fontSize: 11, fill: "#7e8a9c" }, tickLine: false, axisLine: { stroke: "#e3e8ee" } } as const;
export const tooltipStyle = { contentStyle: { fontSize: 12, borderRadius: 6, border: "1px solid #dfe4eb", boxShadow: "0 8px 24px -8px rgba(15,23,42,.2)", padding: "6px 10px" }, labelStyle: { fontWeight: 600, marginBottom: 2 } } as const;

export function ChartBox({ height = 240, children }: { height?: number; children: ReactNode }) {
  return <div style={{ height }} className="w-full"><ResponsiveContainer width="100%" height="100%">{children as never}</ResponsiveContainer></div>;
}

export function Sparkline({ data, color = chartColors.brand, w = 84, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((d - min) / span) * (h - 6)}`).join(" ");
  return <svg width={w} height={h} aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}
