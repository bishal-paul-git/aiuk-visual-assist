"use client";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { Button, Chip, Panel } from "@/components/ui/primitives";
import { ConnectionIndicator } from "@/components/ui/domain";
import { cn } from "@/components/ui/cn";
import { ASSIST_STATES } from "./states";

export function SimulationPanel({ index, onIndexChange, auto, onAutoChange }: { index: number; onIndexChange: (i: number) => void; auto: boolean; onAutoChange: (v: boolean) => void }) {
  const s = ASSIST_STATES[index];
  const last = ASSIST_STATES.length - 1;
  return (
    <aside className="w-full space-y-4 md:w-72" aria-label="Simulation controls">
      <Panel title="Simulated state" subtitle={`Step ${index + 1} of ${ASSIST_STATES.length}`}>
        <p className="text-sm font-semibold text-ink">{s.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{s.description}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div><dt className="label">Voice</dt><dd className="mt-0.5"><Chip tone={s.voiceTone}>{s.voice}</Chip></dd></div>
          <div><dt className="label">Connection</dt><dd className="mt-0.5"><ConnectionIndicator q={s.connection} /></dd></div>
          <div className="col-span-2"><dt className="label">Camera overlay</dt><dd className="mt-0.5 capitalize text-ink">{s.overlay.replace("_", " ")}</dd></div>
        </dl>
      </Panel>

      <Panel title="Simulation controls">
        <ol className="mb-3 space-y-0.5">
          {ASSIST_STATES.map((st, i) => (
            <li key={st.id}>
              <button onClick={() => onIndexChange(i)} aria-current={i === index ? "step" : undefined}
                className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs", i === index ? "bg-brand-soft font-semibold text-brand-strong" : "text-ink-soft hover:bg-subtle")}>
                <span className="num w-4 text-ink-mute">{i + 1}</span>{st.title}
              </button>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onIndexChange(Math.max(0, index - 1))} disabled={index === 0}><ChevronLeft size={14} />Prev</Button>
          <Button onClick={() => onIndexChange(Math.min(last, index + 1))} disabled={index === last}>Next<ChevronRight size={14} /></Button>
          <Button variant={auto ? "dark" : "secondary"} onClick={() => onAutoChange(!auto)} aria-pressed={auto}>{auto ? <Pause size={14} /> : <Play size={14} />}{auto ? "Pause" : "Auto-play"}</Button>
          <Button onClick={() => { onAutoChange(false); onIndexChange(0); }}><RotateCcw size={14} />Reset</Button>
        </div>
        <p className="mt-3 text-2xs text-ink-mute">The phone controls are interactive. Allow, Human help and End also move the simulation.</p>
      </Panel>
    </aside>
  );
}
