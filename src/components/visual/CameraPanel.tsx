"use client";
import { cn } from "@/components/ui/cn";
import type { SceneKind } from "@/lib/types";
import { Scene } from "./Scene";

export interface Box { x: number; y: number; w: number; h: number; label: string; tone: "ok" | "warn" | "bad" }
const BOXES: Partial<Record<SceneKind, Box[]>> = {
  router_front: [{ x: 31, y: 52, w: 38, h: 12, label: "Status panel 0.94", tone: "ok" }, { x: 23, y: 27, w: 54, h: 48, label: "Hub 5 · 0.96", tone: "ok" }],
  router_lights: [{ x: 14, y: 40, w: 14, h: 22, label: "PWR 0.94", tone: "ok" }, { x: 34, y: 40, w: 15, h: 22, label: "DSL 0.88", tone: "ok" }, { x: 53, y: 40, w: 15, h: 22, label: "NET 0.58 ?", tone: "warn" }],
  router_blur: [{ x: 45, y: 28, w: 40, h: 28, label: "Glare · unreadable", tone: "bad" }],
  router_rear: [{ x: 62, y: 36, w: 14, h: 15, label: "DSL port 0.90", tone: "ok" }, { x: 62, y: 66, w: 14, h: 9, label: "Filter 0.64 ?", tone: "warn" }],
  boiler_panel: [{ x: 36, y: 25, w: 28, h: 23, label: "Display F.22 0.93", tone: "ok" }],
  boiler_pressure: [{ x: 33, y: 22, w: 34, h: 55, label: "Gauge 1.1 bar 0.79", tone: "warn" }],
  damage_wall: [{ x: 20, y: 5, w: 60, h: 50, label: "Water staining 0.91", tone: "ok" }, { x: 80, y: 62, w: 5, h: 33, label: "Scale ref", tone: "ok" }],
  damage_vehicle: [{ x: 58, y: 52, w: 20, h: 18, label: "Panel dent 0.87", tone: "warn" }],
  meter: [{ x: 28, y: 33, w: 46, h: 20, label: "Digits 0.97", tone: "ok" }],
};
const boxColor = { ok: "border-emerald-400 text-emerald-300 bg-emerald-400/10", warn: "border-amber-400 text-amber-300 bg-amber-400/10", bad: "border-rose-400 text-rose-300 bg-rose-400/10" };

export function CameraPanel({
  scene, overlays = true, analysing, live = true, label, timer, className, caption, children, rounded = true,
}: { scene: SceneKind; overlays?: boolean; analysing?: boolean; live?: boolean; label?: string; timer?: string; className?: string; caption?: string; children?: React.ReactNode; rounded?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden bg-black", rounded && "rounded-lg", className)}>
      <Scene kind={scene} className="absolute inset-0 h-full w-full" />
      {overlays && BOXES[scene]?.map((b, i) => (
        <div key={i} className={cn("absolute border", boxColor[b.tone])} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
          <span className="absolute -top-4 left-0 whitespace-nowrap rounded-sm bg-black/70 px-1 text-[10px] font-semibold">{b.label}</span>
        </div>
      ))}
      {analysing && <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-cyan-300/25 to-transparent" style={{ animation: "scan 1.6s linear infinite" }} />}
      <div className="absolute left-3 top-3 flex items-center gap-2">
        {live && <span className="flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white"><span className="h-1.5 w-1.5 rounded-full bg-rose-500 anim-blink" />LIVE</span>}
        {timer && <span className="num rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{timer}</span>}
        {label && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{label}</span>}
      </div>
      {/* viewfinder corners */}
      {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "left-2 bottom-2 border-l-2 border-b-2", "right-2 bottom-2 border-r-2 border-b-2"].map((c) => (
        <span key={c} className={cn("pointer-events-none absolute h-4 w-4 border-white/50", c)} />
      ))}
      {caption && <div className="absolute inset-x-3 bottom-3 rounded bg-black/65 px-2.5 py-1.5 text-xs text-white">{caption}</div>}
      {children}
    </div>
  );
}
