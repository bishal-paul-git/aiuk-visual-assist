import type { ReactNode } from "react";
import {
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  CircleOff,
  Clock3,
  FlaskConical,
  Hand,
  Laptop,
  Link2Off,
  PauseCircle,
  Radio,
  ToggleLeft,
  ToggleRight,
  TriangleAlert,
  Wrench,
  XCircle,
} from "lucide-react";
import type { Policy, TenantStatus, ToolPermission, ToolRisk } from "@/lib/domain/types";
import type { Integration } from "@/lib/config/catalog";
import type { ServiceStatus } from "@/lib/config/operations";
import { Badge, cx, type Tone } from "@/components/ui/primitives";

/**
 * Small, status-carrying badges for the configuration pages. Every badge pairs
 * colour with an icon and a text label (docs/03 §7 — never colour alone).
 */

const I = "size-3";

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const map: Record<TenantStatus, [Tone, ReactNode, string]> = {
    active: ["ok", <CheckCircle2 key="i" className={I} aria-hidden />, "Active"],
    onboarding: ["brand", <Clock3 key="i" className={I} aria-hidden />, "Onboarding"],
    suspended: ["danger", <PauseCircle key="i" className={I} aria-hidden />, "Suspended"],
  };
  const [tone, icon, label] = map[status];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}

export function ConfigStatusBadge({ status }: { status: "draft" | "in_review" | "active" | "retired" }) {
  const map = {
    draft: ["neutral", <CircleDashed key="i" className={I} aria-hidden />, "Draft"],
    in_review: ["warn", <Clock3 key="i" className={I} aria-hidden />, "In review"],
    active: ["ok", <CheckCircle2 key="i" className={I} aria-hidden />, "Active"],
    retired: ["neutral", <CircleOff key="i" className={I} aria-hidden />, "Retired"],
  } as const;
  const [tone, icon, label] = map[status];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}

export function ToolModeBadge({ mode }: { mode: ToolPermission["mode"] }) {
  if (mode === "allow")
    return (
      <Badge tone="ok" icon={<CheckCircle2 className={I} aria-hidden />}>
        AI allowed
      </Badge>
    );
  if (mode === "human_only")
    return (
      <Badge tone="violet" icon={<Hand className={I} aria-hidden />}>
        Human only
      </Badge>
    );
  return (
    <Badge tone="danger" icon={<Ban className={I} aria-hidden />}>
      Denied
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: ToolRisk }) {
  const tone: Record<ToolRisk, Tone> = { low: "neutral", medium: "warn", high: "danger", regulated: "danger" };
  const label: Record<ToolRisk, string> = { low: "Low", medium: "Medium", high: "High", regulated: "Regulated" };
  return (
    <Badge tone={tone[risk]} icon={risk === "low" ? undefined : <TriangleAlert className={I} aria-hidden />}>
      {label[risk]}
    </Badge>
  );
}

export function SensitiveHandlingBadge({ handling }: { handling: Policy["sensitiveData"][number]["handling"] | undefined }) {
  if (!handling)
    return (
      <Badge tone="warn" icon={<TriangleAlert className={I} aria-hidden />}>
        Not specified
      </Badge>
    );
  const map: Record<typeof handling, [Tone, string]> = {
    avoid_capture: ["brand", "Avoid capture"],
    blur: ["brand", "Blur"],
    escalate: ["violet", "Escalate to human"],
    allowed: ["neutral", "Allowed"],
  };
  const [tone, label] = map[handling];
  return <Badge tone={tone}>{label}</Badge>;
}

export function IntegrationStatusBadge({ status }: { status: Integration["status"] }) {
  const map: Record<Integration["status"], [Tone, ReactNode, string]> = {
    connected: ["ok", <CheckCircle2 key="i" className={I} aria-hidden />, "Connected"],
    sandbox: ["brand", <FlaskConical key="i" className={I} aria-hidden />, "Sandbox"],
    degraded: ["warn", <TriangleAlert key="i" className={I} aria-hidden />, "Degraded"],
    not_configured: ["neutral", <Link2Off key="i" className={I} aria-hidden />, "Not configured"],
  };
  const [tone, icon, label] = map[status];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}

export function ServiceModeBadge({ mode }: { mode: ServiceStatus["mode"] }) {
  const map: Record<ServiceStatus["mode"], [Tone, ReactNode, string, string?]> = {
    live: ["ok", <Radio key="i" className={I} aria-hidden />, "Live"],
    browser_native: ["brand", <Laptop key="i" className={I} aria-hidden />, "Browser-native"],
    simulated: ["neutral", <FlaskConical key="i" className={I} aria-hidden />, "Simulated", "border-dashed"],
    not_deployed: ["neutral", <CircleOff key="i" className={I} aria-hidden />, "Not deployed"],
  };
  const [tone, icon, label, cls] = map[mode];
  return (
    <Badge tone={tone} icon={icon} className={cls}>
      {label}
    </Badge>
  );
}

export function ServiceStatusBadge({ status }: { status: ServiceStatus["status"] }) {
  const map: Record<ServiceStatus["status"], [Tone, ReactNode, string]> = {
    operational: ["ok", <CheckCircle2 key="i" className={I} aria-hidden />, "Operational"],
    degraded: ["warn", <TriangleAlert key="i" className={I} aria-hidden />, "Degraded"],
    outage: ["danger", <XCircle key="i" className={I} aria-hidden />, "Outage"],
    not_deployed: ["neutral", <CircleOff key="i" className={I} aria-hidden />, "Not deployed"],
  };
  const [tone, icon, label] = map[status];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}

export type ImplState = "implemented" | "partial" | "planned";

/** Delivery state of a control or capability — used to stay honest about the POC. */
export function ImplStateBadge({ state, label }: { state: ImplState; label?: string }) {
  const map: Record<ImplState, [Tone, ReactNode, string]> = {
    implemented: ["ok", <CheckCircle2 key="i" className={I} aria-hidden />, "Implemented (POC)"],
    partial: ["warn", <Wrench key="i" className={I} aria-hidden />, "Partial"],
    planned: ["neutral", <CircleDashed key="i" className={I} aria-hidden />, "Planned"],
  };
  const [tone, icon, text] = map[state];
  return (
    <Badge tone={tone} icon={icon}>
      {label ?? text}
    </Badge>
  );
}

export function FlagBadge({ on }: { on: boolean }) {
  return on ? (
    <Badge tone="ok" icon={<ToggleRight className={I} aria-hidden />}>
      On
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<ToggleLeft className={I} aria-hidden />}>
      Off
    </Badge>
  );
}

export function YesNo({ value, yes = "Yes", no = "No" }: { value: boolean; yes?: string; no?: string }) {
  return value ? (
    <Badge tone="ok" icon={<CheckCircle2 className={I} aria-hidden />}>
      {yes}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<CircleDot className={I} aria-hidden />}>
      {no}
    </Badge>
  );
}

/** A KPI that cannot be computed from session data alone; shown explicitly rather than invented. */
export function UnmeasuredStat({ label, requires, note }: { label: string; requires: string; note?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink-2">
        <Link2Off className="size-3.5 text-muted" aria-hidden />
        {requires}
      </div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

/** Wrapping list of neutral chips. */
export function Chips({ items, empty = "None", mono }: { items: ReactNode[]; empty?: string; mono?: boolean }) {
  if (items.length === 0) return <span className="text-xs text-muted">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <li key={i} className={cx("rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] leading-4 text-ink-2", mono && "font-mono")}>
          {it}
        </li>
      ))}
    </ul>
  );
}

/** Uppercase field label used inside dense cards. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</div>;
}

/** Inline explanatory note (info callout) — neutral, no colour semantics. */
export function Note({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2", className)}>
      {icon && <span className="mt-0.5 shrink-0 text-muted">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 py-px font-mono text-[11px] text-ink-2">{children}</code>;
}
