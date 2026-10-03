"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Flag, GitBranch, Maximize2, MessageSquare, Minus, Plus, UserRound, Wrench } from "lucide-react";
import type { NodeKind, Workflow } from "@/lib/data/workflows";
import { cn } from "@/components/ui/cn";
import { computeLayout, labelPoint, pathD, routeEdge, type Box } from "./flow-layout";

export interface SimState { path: string[]; idx: number } // idx = index of the current node; -1 = idle

const kindStyle: Record<NodeKind, { card: string; icon: string; Icon?: typeof Camera }> = {
  start: { card: "border-ok bg-ok-soft text-ok", icon: "" },
  end: { card: "border-ink bg-ink text-white", icon: "" },
  ask: { card: "border-line border-l-[3px] border-l-info bg-surface", icon: "text-info", Icon: MessageSquare },
  capture: { card: "border-line border-l-[3px] border-l-brand bg-surface", icon: "text-brand", Icon: Camera },
  decision: { card: "", icon: "", Icon: GitBranch },
  tool: { card: "border-line border-l-[3px] border-l-ink-soft bg-subtle", icon: "text-ink-soft", Icon: Wrench },
  escalate: { card: "border-human bg-human-soft text-human", icon: "text-human", Icon: UserRound },
};
export const kindLabel: Record<NodeKind, string> = { start: "Start", ask: "Ask / guide", capture: "Capture", decision: "Decision", tool: "Tool action", end: "End", escalate: "Escalate" };

function NodeView({ box, selected, visited, current, onSelect }: { box: Box; selected: boolean; visited: boolean; current: boolean; onSelect: () => void }) {
  const n = box.node;
  const st = kindStyle[n.kind];
  const ring = selected ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas" : current ? "ring-2 ring-ok ring-offset-2 ring-offset-canvas" : "";
  const pos = { left: box.cx - box.w / 2, top: box.cy - box.h / 2, width: box.w, height: box.h };
  const common = "absolute text-left outline-none focus-visible:ring-2 focus-visible:ring-brand";

  if (n.kind === "decision") {
    const w = box.w, h = box.h;
    return (
      <button data-node style={pos} onClick={onSelect} aria-pressed={selected} aria-label={`Decision: ${n.label}`} className={cn(common, "flex items-center justify-center")}>
        <svg width={w} height={h} className="absolute inset-0 overflow-visible" aria-hidden>
          <polygon points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`} className={cn(visited ? "fill-warn-soft" : "fill-surface", current ? "stroke-ok" : selected ? "stroke-brand" : "stroke-warn")} strokeWidth={selected || current ? 2.5 : 1.5} />
        </svg>
        <span className="relative z-10 line-clamp-2 w-[128px] text-center text-[11px] font-semibold leading-tight text-ink">{n.label}</span>
      </button>
    );
  }
  if (n.kind === "start" || n.kind === "end") {
    return (
      <button data-node style={pos} onClick={onSelect} aria-pressed={selected} className={cn(common, "flex items-center justify-center gap-1.5 rounded-full border text-[12px] font-semibold", n.kind === "end" && visited ? "border-ok bg-ok text-white" : st.card, ring)}>
        <Flag size={12} />{n.label}
      </button>
    );
  }
  const Icon = st.Icon!;
  return (
    <button data-node style={pos} onClick={onSelect} aria-pressed={selected} className={cn(common, "flex flex-col justify-center gap-1 rounded border px-2.5 py-1.5 shadow-card", visited && n.kind !== "escalate" ? st.card.replace(/bg-(surface|subtle)/, "bg-ok-soft") : st.card, ring)}>
      <span className="flex items-start gap-1.5">
        <Icon size={14} className={cn("mt-px shrink-0", st.icon)} />
        <span className={cn("line-clamp-2 text-[12px] font-semibold leading-tight", n.kind === "escalate" ? "text-human" : "text-ink")}>{n.label}</span>
      </span>
      {n.kind === "capture" && n.checkpoint && (
        <span className="inline-flex w-fit items-center gap-1 rounded bg-brand-soft px-1.5 py-px text-[10px] font-semibold text-brand-strong"><Camera size={10} />Checkpoint{n.minConfidence !== undefined && ` ≥ ${n.minConfidence.toFixed(2)}`}</span>
      )}
    </button>
  );
}

const edgeColor = { base: "rgb(var(--ink-mute))", active: "rgb(var(--brand))", esc: "rgb(var(--human))" };

export function FlowCanvas({ workflow, selectedId, onSelect, sim }: { workflow: Workflow; selectedId: string | null; onSelect: (id: string | null) => void; sim: SimState }) {
  const layout = useMemo(() => computeLayout(workflow.nodes), [workflow.nodes]);
  const [zoom, setZoom] = useState(0.8);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);

  const fit = useCallback(() => {
    const el = wrap.current; if (!el) return;
    const z = Math.min(1, (el.clientWidth - 24) / layout.width, (el.clientHeight - 24) / layout.height);
    setZoom(Math.max(0.35, +z.toFixed(2)));
    el.scrollTo({ left: 0, top: 0 });
  }, [layout.width, layout.height]);
  useEffect(() => { fit(); }, [fit]);

  const visited = new Set(sim.idx >= 0 ? sim.path.slice(0, sim.idx + 1) : []);
  const activeEdges = new Set<string>();
  for (let i = 0; i < sim.idx; i++) activeEdges.add(`${sim.path[i]}>${sim.path[i + 1]}`);
  const current = sim.idx >= 0 ? sim.path[sim.idx] : null;

  const edges = workflow.edges.map((e) => {
    const a = layout.boxes.get(e.from), b = layout.boxes.get(e.to);
    if (!a || !b) return null;
    const pts = routeEdge(a, b);
    return { e, pts, d: pathD(pts), lp: labelPoint(pts), toEsc: b.node.kind === "escalate", active: activeEdges.has(`${e.from}>${e.to}`) };
  }).filter(Boolean) as { e: Workflow["edges"][number]; pts: ReturnType<typeof routeEdge>; d: string; lp: { x: number; y: number }; toEsc: boolean; active: boolean }[];

  const zoomBy = (f: number) => setZoom((z) => Math.min(1.6, Math.max(0.35, +(z * f).toFixed(2))));

  return (
    <div className="relative rounded-lg border border-line bg-canvas">
      <div className="absolute right-3 top-3 z-20 flex items-center overflow-hidden rounded border border-line bg-surface shadow-card">
        <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)} className="p-1.5 text-ink-soft hover:bg-subtle"><Minus size={14} /></button>
        <span className="num w-11 border-x border-line text-center text-xs text-ink-soft">{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => zoomBy(1.2)} className="p-1.5 text-ink-soft hover:bg-subtle"><Plus size={14} /></button>
        <button aria-label="Fit to screen" title="Fit to screen" onClick={fit} className="border-l border-line p-1.5 text-ink-soft hover:bg-subtle"><Maximize2 size={14} /></button>
      </div>
      <div
        ref={wrap}
        className={cn("h-[660px] overflow-auto rounded-lg", panning ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-node]")) return;
          const el = wrap.current!; drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false }; setPanning(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          wrap.current!.scrollLeft = d.sl - dx; wrap.current!.scrollTop = d.st - dy;
        }}
        onPointerUp={() => { if (drag.current && !drag.current.moved) onSelect(null); drag.current = null; setPanning(false); }}
        onPointerLeave={() => { drag.current = null; setPanning(false); }}
      >
        <div className="grid min-h-full w-max min-w-full place-items-center p-3" style={{ backgroundImage: "radial-gradient(rgb(var(--line)) 1px, transparent 1px)", backgroundSize: `${20 * zoom}px ${20 * zoom}px` }}>
          <div style={{ width: layout.width * zoom, height: layout.height * zoom }}>
            <div className="relative origin-top-left" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
              <svg width={layout.width} height={layout.height} className="absolute inset-0" aria-hidden>
                <defs>
                  {(["base", "active", "esc"] as const).map((k) => (
                    <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={edgeColor[k]} /></marker>
                  ))}
                </defs>
                {edges.map(({ e, d, toEsc, active }) => {
                  const k = active ? "active" : toEsc ? "esc" : "base";
                  return <path key={`${e.from}>${e.to}`} d={d} fill="none" stroke={edgeColor[k]} strokeWidth={active ? 2.5 : 1.5} strokeDasharray={toEsc && !active ? "5 4" : undefined} markerEnd={`url(#arrow-${k})`} />;
                })}
                {edges.map(({ e, lp }) => e.label && (
                  <g key={`l-${e.from}>${e.to}`} transform={`translate(${lp.x},${lp.y})`}>
                    <rect x={-(e.label.length * 3.4 + 7)} y={-9} width={e.label.length * 6.8 + 14} height={18} rx={3} fill="rgb(var(--surface))" stroke="rgb(var(--line))" />
                    <text textAnchor="middle" dy="3.5" fontSize="10.5" fontWeight="600" fill="rgb(var(--ink-soft))">{e.label}</text>
                  </g>
                ))}
              </svg>
              {workflow.nodes.map((n) => {
                const box = layout.boxes.get(n.id)!;
                return <NodeView key={n.id} box={box} selected={selectedId === n.id} visited={visited.has(n.id)} current={current === n.id} onSelect={() => onSelect(n.id)} />;
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface px-3 py-2 text-2xs text-ink-mute">
        {(Object.keys(kindLabel) as NodeKind[]).map((k) => <span key={k}>{kindLabel[k]}</span>)}
        <span className="ml-auto">Drag to pan · scroll to move · click a node to inspect</span>
      </div>
    </div>
  );
}
