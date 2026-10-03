"use client";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui/primitives";
import { ChartBox } from "@/components/ui/charts";

/** Standard chart container used across Analytics and Costs. */
export function ChartCard({ title, subtitle, height = 220, actions, children, className, footer }: { title: string; subtitle?: string; height?: number; actions?: ReactNode; children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <Panel title={title} subtitle={subtitle} actions={actions} className={className}>
      <ChartBox height={height}>{children}</ChartBox>
      {footer && <div className="mt-2 text-2xs text-ink-mute">{footer}</div>}
    </Panel>
  );
}
