"use client";
import { Bot, CheckCircle2, Circle, OctagonAlert, UserRound, XCircle, ShieldAlert, Loader2 } from "lucide-react";
import { Chip, ConfidenceBar } from "@/components/ui/primitives";
import type { AuditEntry, CostLine, Session, ToolAction, TranscriptLine, VisualObservation, WorkflowStepProgress } from "@/lib/types";
import { cn } from "@/components/ui/cn";
import { ObservationChip } from "@/components/ui/domain";
import { fmtDuration, gbp } from "@/lib/data/sessions";

/** Segmented AI vs Human time bar. */
export function OwnershipBar({ s }: { s: Session }) {
  const total = Math.max(1, s.aiDurationSec + s.humanDurationSec);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-line">
        <div className="bg-brand" style={{ width: `${(s.aiDurationSec / total) * 100}%` }} />
        <div className="bg-human" style={{ width: `${(s.humanDurationSec / total) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-ink-soft">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand" />AI handled <b className="num text-ink">{fmtDuration(s.aiDurationSec)}</b></span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-human" />Human <b className="num text-ink">{fmtDuration(s.humanDurationSec)}</b></span>
      </div>
    </div>
  );
}

export function Transcript({ lines, className }: { lines: TranscriptLine[]; className?: string }) {
  const style = {
    ai: { label: "AI", cls: "bg-brand-soft text-brand-strong", icon: <Bot size={11} /> },
    customer: { label: "Customer", cls: "bg-subtle text-ink-soft", icon: null },
    human: { label: "Adviser", cls: "bg-human-soft text-human", icon: <UserRound size={11} /> },
    system: { label: "System", cls: "bg-warn-soft text-warn", icon: null },
  } as const;
  return (
    <ol className={cn("space-y-2.5 overflow-y-auto pr-1", className)}>
      {lines.map((l) => (
        <li key={l.id} className="flex gap-2.5">
          <span className="num mt-0.5 w-9 shrink-0 text-2xs text-ink-mute">{l.at}</span>
          <div className="min-w-0">
            <span className={cn("mr-1.5 inline-flex items-center gap-1 rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide", style[l.speaker].cls)}>{style[l.speaker].icon}{style[l.speaker].label}</span>
            <span className={cn("text-[13px]", l.speaker === "system" ? "italic text-ink-soft" : "text-ink")}>{l.text}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ObservationList({ items, activeFrame, onSelectFrame, threshold = 0.7 }: { items: VisualObservation[]; activeFrame?: string; onSelectFrame?: (f: string) => void; threshold?: number }) {
  return (
    <ul className="divide-y divide-line/70">
      {items.map((o) => (
        <li key={o.id} className={cn("flex items-start gap-2.5 px-4 py-2.5", activeFrame === o.frameId && "bg-brand-soft/50")}>
          <span className="mt-0.5">
            {o.status === "confirmed_visible" || o.status === "likely_visible" ? <CheckCircle2 size={15} className="text-ok" /> : <OctagonAlert size={15} className="text-warn" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug">{o.text}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ObservationChip status={o.status} />
              <ConfidenceBar value={o.confidence} threshold={threshold} />
              <button onClick={() => onSelectFrame?.(o.frameId)} className="text-2xs font-medium text-brand-strong hover:underline">{o.frameId} · {o.at}</button>
              {o.requiresConfirmation && <Chip tone="warn">Needs confirmation</Chip>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function WorkflowStepper({ steps }: { steps: WorkflowStepProgress[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const Icon = s.state === "done" ? CheckCircle2 : s.state === "current" ? Loader2 : s.state === "escalated" ? ShieldAlert : s.state === "skipped" ? XCircle : Circle;
        const color = s.state === "done" ? "text-ok" : s.state === "current" ? "text-info" : s.state === "escalated" ? "text-warn" : "text-ink-mute";
        return (
          <li key={s.key} className="relative flex gap-2.5 pb-3 last:pb-0">
            {i < steps.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-line" />}
            <Icon size={15} className={cn("relative z-10 mt-px shrink-0 bg-surface", color, s.state === "current" && "animate-spin")} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px] leading-tight", s.state === "pending" ? "text-ink-mute" : "font-medium")}>{s.label}</p>
              {s.note && <p className="text-2xs text-ink-mute">{s.note}</p>}
            </div>
            {s.at && <span className="num text-2xs text-ink-mute">{s.at}</span>}
          </li>
        );
      })}
    </ol>
  );
}

const toneDot = { neutral: "bg-ink-mute", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", human: "bg-human" } as const;
export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <ol className="relative ml-1">
      {entries.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-3.5 last:pb-0">
          {i < entries.length - 1 && <span className="absolute left-[3.5px] top-3 h-full w-px bg-line" />}
          <span className={cn("relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-surface", toneDot[e.tone ?? "neutral"])} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px]"><span className="font-medium">{e.event}</span> <span className="text-ink-mute">· {e.actor}</span></p>
            <p className="text-xs text-ink-soft">{e.detail}</p>
          </div>
          <span className="num shrink-0 text-2xs text-ink-mute">{e.at}</span>
        </li>
      ))}
    </ol>
  );
}

const actionTone = { success: "ok", pending: "info", failed: "bad", blocked: "warn" } as const;
export function ActionsTable({ actions }: { actions: ToolAction[] }) {
  return (
    <div className="divide-y divide-line/70">
      {actions.map((a) => (
        <div key={a.id} className="grid grid-cols-[48px_1fr_auto] items-start gap-3 px-4 py-2.5">
          <span className="num pt-0.5 text-2xs text-ink-mute">{a.at}</span>
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold">{a.tool}</p>
            <p className="text-xs text-ink-soft">{a.request}</p>
            <p className="text-xs text-ink">→ {a.result}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Chip tone={actionTone[a.status]}>{a.status}</Chip>
            <span className="text-2xs text-ink-mute">{a.actor}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CostBreakdown({ lines, total }: { lines: CostLine[]; total: number }) {
  const max = Math.max(...lines.map((l) => l.amount), 0.01);
  const sum = lines.reduce((a, l) => a + l.amount, 0);
  return (
    <div>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.category} title={`${l.provider} · ${l.detail}`}>
            <div className="flex justify-between text-xs"><span className="text-ink-soft">{l.category}</span><span className="num font-medium">{gbp(l.amount)}</span></div>
            <div className="mt-0.5 h-1 rounded-full bg-line"><div className="h-1 rounded-full bg-brand/70" style={{ width: `${(l.amount / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[13px]">
        <span className="font-semibold">Total (demo)</span><span className="num font-semibold">{gbp(Math.abs(sum - total) < 0.06 ? total : sum)}</span>
      </div>
    </div>
  );
}
