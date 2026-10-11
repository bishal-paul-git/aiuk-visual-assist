import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  EyeOff,
  FlaskConical,
  Headset,
  ScanEye,
  Shuffle,
  XCircle,
} from "lucide-react";
import type { EscalationReasonCode, EscalationSeverity, ObservationStatus, OwnerType, SessionOutcome, SessionStatus, WorkflowStatus } from "@/lib/domain/types";
import { ESCALATION_REASON_LABELS, OBSERVATION_STATUS_LABELS, OUTCOME_LABELS, STATUS_LABELS } from "@/lib/domain/labels";
import { confidencePct } from "@/lib/format";
import { Badge, Meter, type Tone } from "@/components/ui/primitives";

const ICON = "size-3";

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const tone: Record<SessionStatus, Tone> = {
    created: "neutral",
    awaiting_consent: "neutral",
    active: "brand",
    escalated: "warn",
    human_active: "violet",
    completed: "neutral",
    failed: "danger",
  };
  return <Badge tone={tone[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function OwnerBadge({ owner }: { owner: OwnerType }) {
  return owner === "ai" ? (
    <Badge tone="brand" icon={<Bot className={ICON} aria-hidden />}>
      AI owner
    </Badge>
  ) : (
    <Badge tone="violet" icon={<Headset className={ICON} aria-hidden />}>
      Human owner
    </Badge>
  );
}

export function OutcomeBadge({ outcome }: { outcome?: SessionOutcome }) {
  if (!outcome) return <Badge tone="neutral">In progress</Badge>;
  const tone: Record<SessionOutcome, Tone> = {
    resolved_by_ai: "ok",
    resolved_by_human: "ok",
    escalated_unresolved: "warn",
    customer_abandoned: "neutral",
    failed: "danger",
    out_of_scope: "neutral",
  };
  return <Badge tone={tone[outcome]}>{OUTCOME_LABELS[outcome]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: EscalationSeverity }) {
  const tone: Record<EscalationSeverity, Tone> = { low: "neutral", medium: "warn", high: "danger", critical: "danger" };
  return <Badge tone={tone[severity]}>{severity.charAt(0).toUpperCase() + severity.slice(1)}</Badge>;
}

export function EscalationReasonBadge({ reason }: { reason: EscalationReasonCode }) {
  return (
    <Badge tone="warn" icon={<AlertTriangle className={ICON} aria-hidden />}>
      {ESCALATION_REASON_LABELS[reason]}
    </Badge>
  );
}

const OBS_TONE: Record<ObservationStatus, Tone> = {
  confirmed_visible: "ok",
  likely_visible: "brand",
  uncertain: "warn",
  unreadable: "danger",
  not_visible: "neutral",
  conflicting_evidence: "danger",
  needs_another_view: "warn",
};

const OBS_ICON: Record<ObservationStatus, React.ReactNode> = {
  confirmed_visible: <CheckCircle2 className={ICON} aria-hidden />,
  likely_visible: <ScanEye className={ICON} aria-hidden />,
  uncertain: <CircleHelp className={ICON} aria-hidden />,
  unreadable: <EyeOff className={ICON} aria-hidden />,
  not_visible: <CircleDashed className={ICON} aria-hidden />,
  conflicting_evidence: <Shuffle className={ICON} aria-hidden />,
  needs_another_view: <XCircle className={ICON} aria-hidden />,
};

export function ObservationStatusBadge({ status }: { status: ObservationStatus }) {
  return (
    <Badge tone={OBS_TONE[status]} icon={OBS_ICON[status]}>
      {OBSERVATION_STATUS_LABELS[status]}
    </Badge>
  );
}

export function confidenceTone(confidence: number, threshold = 0.75): Tone {
  if (confidence >= Math.max(threshold, 0.85)) return "ok";
  if (confidence >= threshold) return "brand";
  if (confidence >= 0.5) return "warn";
  return "danger";
}

export function ConfidenceMeter({ value, threshold = 0.75, compact }: { value: number; threshold?: number; compact?: boolean }) {
  return (
    <div className={compact ? "flex w-24 items-center gap-2" : "flex w-32 items-center gap-2"}>
      <Meter value={value} tone={confidenceTone(value, threshold)} label={`Confidence ${confidencePct(value)}`} />
      <span className="tabular w-9 text-right text-xs text-ink-2">{confidencePct(value)}</span>
    </div>
  );
}

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const tone: Record<WorkflowStatus, Tone> = { draft: "neutral", in_review: "warn", published: "ok", retired: "neutral" };
  const label: Record<WorkflowStatus, string> = { draft: "Draft", in_review: "In review", published: "Published", retired: "Retired" };
  return <Badge tone={tone[status]}>{label[status]}</Badge>;
}

/** Marks anything produced by simulated providers so it is never mistaken for real model output. */
export function SimulatedTag({ label = "Simulated AI" }: { label?: string }) {
  return (
    <Badge tone="neutral" icon={<FlaskConical className={ICON} aria-hidden />} className="border-dashed">
      {label}
    </Badge>
  );
}
