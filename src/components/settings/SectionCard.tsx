"use client";
import { Toggle as Toggle2 } from "@/components/ui/primitives";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button, Panel } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";

/** Panel with a local-only "Save changes" button and inline success feedback. */
export function SectionCard({ title, description, children, onSave, noSave }: { title: string; description?: string; children: ReactNode; onSave?: () => void; noSave?: boolean }) {
  const [saved, setSaved] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const save = () => { onSave?.(); setSaved(true); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setSaved(false), 3000); };
  return (
    <Panel title={title} subtitle={description}>
      <div className="space-y-5">{children}</div>
      {!noSave && (
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-3">
          <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1 text-xs text-ok transition-opacity", saved ? "opacity-100" : "opacity-0")}><Check size={13} />Changes saved (demo, local only)</span>
          <Button variant="primary" onClick={save}>Save changes</Button>
        </div>
      )}
    </Panel>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 cursor-pointer rounded-sm border-line accent-[rgb(var(--brand))] disabled:cursor-not-allowed disabled:opacity-50" />;
}

export function ToggleRow({ label, hint, on, onChange, disabled }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", disabled && "opacity-60")}>
      <div className="min-w-0"><p className="text-[13px] font-medium text-ink">{label}</p>{hint && <p className="text-xs text-ink-mute">{hint}</p>}</div>
      <div className={disabled ? "pointer-events-none" : ""}><Toggle2 on={on} onChange={onChange} label={label} /></div>
    </div>
  );
}
