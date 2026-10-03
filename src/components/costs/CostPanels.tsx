"use client";
import { useState } from "react";
import { Chip, Panel, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { ASSUMED_VISIT_COST, BASELINE, formulaTerms, providerBreakdown, whatIf, type CostSummary } from "@/lib/data/costs";
import { gbp } from "@/lib/data/sessions";

export function ProviderTable() {
  const rows = providerBreakdown();
  return (
    <Panel title="Provider breakdown" subtitle="Last 30 days · all figures are fictional demo data" flush actions={<Chip tone="warn">Demo</Chip>}>
      <Table>
        <thead><tr><Th>Provider</Th><Th>Billing basis</Th><Th className="text-right">Volume</Th><Th className="text-right">Unit cost</Th><Th className="text-right">Spend</Th><Th className="text-right">Share</Th></tr></thead>
        <tbody>{rows.map((r) => (
          <Tr key={r.name}>
            <Td className="font-medium">{r.name} <span className="text-2xs font-normal text-ink-mute">(demo)</span></Td><Td className="text-ink-soft">{r.basis}</Td>
            <Td className="num text-right">{r.volume.toLocaleString("en-GB")}</Td><Td className="num text-right">{gbp(r.unitCost, 4)}</Td><Td className="num text-right">{gbp(r.spend, 0)}</Td><Td className="num text-right">{Math.round(r.share * 100)}%</Td>
          </Tr>
        ))}</tbody>
      </Table>
    </Panel>
  );
}

export function FormulaPanel() {
  return (
    <Panel title="Unit economics" subtitle="Indicative model (spec section 18)">
      <pre className="overflow-x-auto rounded border border-line bg-subtle p-3 font-mono text-xs leading-relaxed text-ink">
        <span className="text-ink-mute">interaction_cost =</span>{"\n"}
        {formulaTerms.map((t, i) => <span key={t}>{i === 0 ? "  " : "+ "}{t}{"\n"}</span>)}
      </pre>
      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-ink-soft">
        <li>Multimodal calls are event-driven: frames are sent at checkpoints, not continuously.</li>
        <li><code className="font-mono">human_agent_cost_if_escalated</code> only applies to the escalated share of sessions.</li>
        <li>Demo prices only. No live provider billing is read.</li>
      </ul>
    </Panel>
  );
}

function Slider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs font-medium text-ink-soft"><span>{label}</span><span className="num text-ink">{unit === "£" ? `£${value}` : `${value}${unit}`}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-brand" />
    </label>
  );
}

export function WhatIf() {
  const [frames, setFrames] = useState(BASELINE.frames);
  const [esc, setEsc] = useState(BASELINE.escalation);
  const [visit, setVisit] = useState(ASSUMED_VISIT_COST);
  const w = whatIf(frames, esc, visit);
  const base = whatIf(BASELINE.frames, BASELINE.escalation, visit);
  const d = w.cost - base.cost;
  return (
    <Panel title="What-if calculator" subtitle="Computed locally from the fictional baseline" actions={<button className="text-xs text-brand-strong hover:underline" onClick={() => { setFrames(BASELINE.frames); setEsc(BASELINE.escalation); setVisit(ASSUMED_VISIT_COST); }}>Reset</button>}>
      <div className="space-y-3">
        <Slider label="Frames analysed per session" value={frames} min={4} max={30} onChange={setFrames} />
        <Slider label="Escalation rate" value={esc} min={5} max={60} unit="%" onChange={setEsc} />
        <Slider label="Assumed cost per engineer visit" value={visit} min={60} max={250} step={5} unit="£" onChange={setVisit} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
        <div><dt className="label">Est. cost per interaction</dt><dd className="num text-lg font-semibold">{gbp(w.cost)}</dd><dd className={cn("text-2xs", d > 0 ? "text-bad" : d < 0 ? "text-ok" : "text-ink-mute")}>{d === 0 ? "at baseline" : `${d > 0 ? "+" : "-"}${gbp(Math.abs(d))} vs baseline`}</dd></div>
        <div><dt className="label">Visits avoided / session</dt><dd className="num text-lg font-semibold">{w.avoidedPerSession.toFixed(2)}</dd></div>
        <div><dt className="label">Value of visits avoided</dt><dd className="num text-lg font-semibold">{gbp(w.value)}</dd></div>
        <div><dt className="label">Value : cost</dt><dd className="num text-lg font-semibold">{w.ratio}x</dd></div>
      </dl>
    </Panel>
  );
}

export function ValueVsCost({ sum }: { sum: CostSummary }) {
  const value = sum.visitsAvoided * ASSUMED_VISIT_COST;
  const net = value - sum.totalSpend;
  const pctCost = (sum.totalSpend / value) * 100;
  return (
    <Panel title="Value vs cost" subtitle="Last 30 days · assumptions are fictional">
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="label">Visits avoided</dt><dd className="num text-lg font-semibold">{sum.visitsAvoided.toLocaleString("en-GB")}</dd></div>
        <div><dt className="label">Assumed cost per visit</dt><dd className="num text-lg font-semibold">{gbp(ASSUMED_VISIT_COST, 0)}</dd></div>
        <div><dt className="label">Value delivered</dt><dd className="num text-lg font-semibold">{gbp(value, 0)}</dd></div>
        <div><dt className="label">Platform cost</dt><dd className="num text-lg font-semibold">{gbp(sum.totalSpend, 0)}</dd></div>
      </dl>
      <div className="mt-3" aria-label="Cost as share of value">
        <div className="h-2 overflow-hidden rounded-full bg-ok-soft"><div className="h-full bg-brand" style={{ width: `${Math.max(2, pctCost)}%` }} /></div>
        <p className="mt-1 text-2xs text-ink-mute">Cost equals {pctCost.toFixed(1)}% of assumed value · net {gbp(net, 0)}</p>
      </div>
      <p className="mt-2 text-2xs text-ink-mute">Excludes licence, implementation and change-management cost. Not a forecast.</p>
    </Panel>
  );
}
