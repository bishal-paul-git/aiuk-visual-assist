import { Camera, Check, MousePointerClick, X } from "lucide-react";
import { Chip, ConfidenceBar, KeyValue, Panel } from "@/components/ui/primitives";
import type { Workflow, WfNode } from "@/lib/data/workflows";
import { kindLabel } from "./FlowCanvas";

function List({ title, items, good }: { title: string; items?: string[]; good: boolean }) {
  return (
    <div>
      <p className="label mb-1">{title}</p>
      {items?.length ? (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i} className={`flex items-start gap-1.5 rounded px-2 py-1 text-xs ${good ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
              {good ? <Check size={12} className="mt-0.5 shrink-0" /> : <X size={12} className="mt-0.5 shrink-0" />}<span>{i}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-ink-mute">None defined</p>}
    </div>
  );
}

export function NodeInspector({ node, workflow }: { node: WfNode | null; workflow: Workflow }) {
  if (!node) {
    return (
      <Panel title="Node inspector" className="h-full">
        <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-mute"><MousePointerClick size={22} /><p className="text-[13px]">Select a node on the canvas to inspect its rules, visual checkpoint and guidance.</p></div>
      </Panel>
    );
  }
  const incoming = workflow.edges.filter((e) => e.to === node.id).length;
  const outgoing = workflow.edges.filter((e) => e.from === node.id);
  return (
    <Panel title={node.label} subtitle={<span className="font-mono">{node.id}</span>} actions={<Chip tone={node.kind === "escalate" ? "human" : node.kind === "capture" ? "brand" : node.kind === "decision" ? "warn" : "neutral"}>{kindLabel[node.kind]}</Chip>} className="h-full">
      <div className="space-y-4">
        <p className="text-[13px] text-ink-soft">{node.description}</p>
        <KeyValue cols={2} items={[
          { k: "Visual checkpoint", v: node.checkpoint ? <Chip tone="brand"><Camera size={11} />Required</Chip> : <span className="text-ink-mute">No</span> },
          { k: "Min. confidence", v: node.minConfidence !== undefined ? <ConfidenceBar value={node.minConfidence} threshold={node.minConfidence} /> : <span className="text-ink-mute">Workflow default ({workflow.confidenceThreshold.toFixed(2)})</span> },
          { k: "Incoming", v: incoming }, { k: "Outgoing", v: outgoing.length ? outgoing.map((e) => e.label ?? "next").join(" · ") : "—" },
        ]} />
        <List title="Allowed guidance" items={node.allowed} good />
        <List title="Prohibited actions" items={node.prohibited} good={false} />
        <div>
          <p className="label mb-1">On fail</p>
          <p className="rounded border border-line bg-subtle px-2.5 py-1.5 text-xs text-ink-soft">{node.onFail ?? (node.checkpoint ? "Request a better view; escalate after two failed attempts" : "Continue to next step; follow workflow escalation rules")}</p>
        </div>
      </div>
    </Panel>
  );
}
