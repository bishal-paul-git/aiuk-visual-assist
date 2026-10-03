"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Chip, type Tone } from "@/components/ui/primitives";
import { clientById } from "@/lib/data/clients";
import type { Client } from "@/lib/types";
import { cn } from "@/components/ui/cn";

export const clientStatusTone: Record<Client["status"], Tone> = { live: "ok", pilot: "info", onboarding: "warn" };
export const ClientStatusChip = ({ status }: { status: Client["status"] }) => <Chip tone={clientStatusTone[status]} dot>{status[0].toUpperCase() + status.slice(1)}</Chip>;

export function InitialsBlock({ initials, color, size = 28, className }: { initials: string; color: string; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded font-semibold text-white", className)} style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {initials}
    </span>
  );
}

/** Small client reference: coloured initials + name, optionally linked. */
export function ClientTag({ id, link = true }: { id: string; link?: boolean }) {
  const c = clientById(id);
  if (!c) return <span className="text-ink-mute">—</span>;
  const inner = (
    <span className="inline-flex items-center gap-2">
      <InitialsBlock initials={c.initials} color={c.accent} size={20} />
      <span className="truncate">{c.name}</span>
    </span>
  );
  return link ? <Link href={`/clients/${c.id}`} className="hover:text-brand-strong hover:underline" onClick={(e) => e.stopPropagation()}>{inner}</Link> : inner;
}

export const retentionLabel: Record<Client["retentionMode"], string> = { live_only: "Live only (no storage)", selected_frames: "Selected frames only", full_evidence: "Full evidence" };

/** Inline success flash for visual-only "Save" actions. */
export function useFlash(ms = 2600) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const flash = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), ms);
  }, [ms]);
  return [msg, flash] as const;
}
export function FlashNote({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <span role="status" className="anim-fade-in inline-flex items-center gap-1 text-xs font-medium text-ok"><CheckCircle2 size={14} />{msg}</span>;
}
/** Floating toast (fixed, bottom-right). */
export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div role="status" className="anim-rise fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded border border-line bg-ink px-3.5 py-2 text-[13px] font-medium text-white shadow-pop">
      <CheckCircle2 size={15} className="text-ok" />{msg}
    </div>
  );
}
