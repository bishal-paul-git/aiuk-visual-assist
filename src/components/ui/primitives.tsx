"use client";
import Link from "next/link";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

/* ---------- Button ---------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "human" | "dark";
const btnStyles: Record<BtnVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong border-transparent",
  secondary: "bg-surface text-ink border-line hover:bg-subtle",
  ghost: "bg-transparent text-ink-soft border-transparent hover:bg-subtle",
  danger: "bg-bad text-white border-transparent hover:opacity-90",
  human: "bg-human text-white border-transparent hover:opacity-90",
  dark: "bg-ink text-white border-transparent hover:opacity-90",
};
export function Button({ variant = "secondary", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : size === "lg" ? "h-11 px-5 text-sm" : "h-8 px-3 text-[13px]",
        btnStyles[variant], className,
      )}
    />
  );
}
export function LinkButton({ href, variant = "secondary", size = "md", className, children }: { href: string; variant?: BtnVariant; size?: "sm" | "md" | "lg"; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn("inline-flex items-center justify-center gap-1.5 rounded border font-medium transition-colors", size === "sm" ? "h-7 px-2.5 text-xs" : size === "lg" ? "h-11 px-5 text-sm" : "h-8 px-3 text-[13px]", btnStyles[variant], className)}>
      {children}
    </Link>
  );
}

/* ---------- Chip / Badge ---------- */
export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "human" | "brand";
const toneStyles: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-soft",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  human: "bg-human-soft text-human",
  brand: "bg-brand-soft text-brand-strong",
};
const dotStyles: Record<Tone, string> = { neutral: "bg-ink-mute", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", human: "bg-human", brand: "bg-brand" };
export function Chip({ tone = "neutral", dot, pulse, children, className }: { tone?: Tone; dot?: boolean; pulse?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-semibold", toneStyles[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[tone], pulse && "anim-blink")} />}
      {children}
    </span>
  );
}

/* ---------- Panel ---------- */
export function Panel({ title, subtitle, actions, children, className, bodyClassName, flush }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; flush?: boolean }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="truncate text-2xs text-ink-mute">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, breadcrumbs }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumbs?: { label: string; href?: string }[] }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {breadcrumbs && (
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-2xs text-ink-mute">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {b.href ? <Link href={b.href} className="hover:text-ink">{b.label}</Link> : <span>{b.label}</span>}
                {i < breadcrumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-0.5 max-w-3xl text-[13px] text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((t) => (
        <button
          key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors", value === t.id ? "border-brand text-ink" : "border-transparent text-ink-mute hover:text-ink")}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded bg-subtle px-1.5 py-px text-2xs text-ink-soft">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={cn("rounded px-2.5 py-1 text-xs font-medium", value === o.id ? "bg-surface text-ink shadow-sm" : "text-ink-mute hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Form controls ---------- */
const field = "h-8 rounded border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-mute focus:border-brand";
export function Select({ value, onChange, options, label, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(field, "pr-7", className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return <input type="search" aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(field, "w-56", className)} />;
}
export function TextInput(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cn(field, "w-full", p.className)} />; }
export function TextArea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cn(field, "h-auto w-full py-2", p.className)} />; }
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-soft">{label}</label>
      <div id={id}>{children}</div>
      {hint && <p className="mt-1 text-2xs text-ink-mute">{hint}</p>}
    </div>
  );
}
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-line")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

/* ---------- Table ---------- */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto", className)}><table className="w-full border-collapse text-left text-[13px]">{children}</table></div>;
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cn("whitespace-nowrap border-b border-line bg-subtle/60 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-mute", className)}>{children}</th>
);
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cn("border-b border-line/70 px-3 py-2 align-middle", className)}>{children}</td>
);
export function Tr({ children, onClick, selected, href }: { children: ReactNode; onClick?: () => void; selected?: boolean; href?: string }) {
  const click = onClick;
  return (
    <tr
      onClick={click} tabIndex={click ? 0 : undefined} onKeyDown={click ? (e) => (e.key === "Enter" ? click() : null) : undefined}
      className={cn("group", click && "cursor-pointer", "hover:bg-subtle/60", selected && "bg-brand-soft/60")}
      data-href={href}
    >{children}</tr>
  );
}
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return <div className="px-4 py-10 text-center"><p className="text-[13px] font-medium text-ink-soft">{title}</p>{hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}</div>;
}

/* ---------- Overlays ---------- */
function useEsc(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}
export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-md" }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEsc(onClose, open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}>
      <div className="anim-fade-in absolute inset-0 bg-ink/40" onClick={onClose} />
      <aside ref={ref} tabIndex={-1} className={cn("anim-slide-in relative flex h-full w-full flex-col bg-surface shadow-pop outline-none", width)}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{title}</h2>{subtitle && <p className="text-xs text-ink-mute">{subtitle}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-mute hover:bg-subtle"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}
export function Modal({ open, onClose, title, children, footer, width = "max-w-lg" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEsc(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="anim-fade-in absolute inset-0 bg-ink/50" onClick={onClose} />
      <div className={cn("anim-rise relative w-full rounded-lg bg-surface shadow-pop", width)}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-mute hover:bg-subtle"><X size={16} /></button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- Data bits ---------- */
export function ConfidenceBar({ value, threshold = 0.7, showValue = true, className }: { value: number; threshold?: number; showValue?: boolean; className?: string }) {
  const tone = value >= 0.85 ? "bg-ok" : value >= threshold ? "bg-info" : "bg-warn";
  return (
    <div className={cn("flex items-center gap-2", className)} title={`Confidence ${value.toFixed(2)} · threshold ${threshold.toFixed(2)}`}>
      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.round(value * 100)}%` }} />
        <div className="absolute top-0 h-full w-px bg-ink/50" style={{ left: `${threshold * 100}%` }} />
      </div>
      {showValue && <span className="num w-8 text-xs text-ink-soft">{value.toFixed(2)}</span>}
    </div>
  );
}

export function KeyValue({ items, cols = 1 }: { items: { k: string; v: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-2.5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.k} className="min-w-0">
          <dt className="label">{i.k}</dt>
          <dd className="mt-0.5 break-words text-[13px] text-ink">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="num mt-0.5 text-lg font-semibold tracking-tight">{value}</p>
      {sub && <p className={cn("text-2xs", tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink-mute")}>{sub}</p>}
    </div>
  );
}
