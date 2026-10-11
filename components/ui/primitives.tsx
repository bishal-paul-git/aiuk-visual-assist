import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type Tone = "neutral" | "brand" | "ok" | "warn" | "danger" | "violet" | "navy";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 ring-line",
  brand: "bg-brand-soft text-brand-ink ring-brand/20",
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  danger: "bg-danger-soft text-danger ring-danger/20",
  violet: "bg-violet-soft text-violet ring-violet/20",
  navy: "bg-navy text-white ring-navy",
};

export function Badge({ tone = "neutral", children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  const color: Record<Tone, string> = {
    neutral: "bg-muted",
    brand: "bg-brand",
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    violet: "bg-violet",
    navy: "bg-navy",
  };
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", color[tone], pulse && "va-pulse")} />;
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx("min-w-0 rounded-lg border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone, footer }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; footer?: ReactNode }) {
  const valueTone = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx("tabular mt-1 text-2xl font-semibold tracking-tight", valueTone)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mb-2 text-muted">{icon}</div>}
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-md text-xs text-muted">{children}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("relative overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ children, className, align }: { children?: ReactNode; className?: string; align?: "right" | "left" }) {
  return (
    <th
      scope="col"
      className={cx(
        "border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align }: { children?: ReactNode; className?: string; align?: "right" | "left" }) {
  return <td className={cx("border-b border-line px-3 py-2 align-middle text-ink-2", align === "right" && "tabular text-right", className)}>{children}</td>;
}

export function buttonClass(variant: "primary" | "secondary" | "ghost" | "danger" | "navy" = "secondary", size: "sm" | "md" = "md"): string {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
  const sizes = { sm: "h-7 px-2.5 text-xs", md: "h-9 px-3.5 text-sm" };
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-ink",
    secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
    ghost: "text-ink-2 hover:bg-surface-2",
    danger: "bg-danger text-white hover:brightness-95",
    navy: "bg-navy text-white hover:bg-navy-2",
  };
  return cx(base, sizes[size], variants[variant]);
}

export function Meter({ value, tone = "brand", label }: { value: number; tone?: Tone; label?: string }) {
  const color: Record<Tone, string> = {
    neutral: "bg-muted",
    brand: "bg-brand",
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    violet: "bg-violet",
    navy: "bg-navy",
  };
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <div className={cx("h-full rounded-full", color[tone])} style={{ width: `${v * 100}%` }} />
    </div>
  );
}
