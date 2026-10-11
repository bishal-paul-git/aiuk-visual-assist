import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Compass,
  Headset,
  Info,
  MessageCircleQuestion,
  Play,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Policy, WorkflowDefinition, WorkflowStep, WorkflowStepType } from "@/lib/domain/types";
import type { ValidationIssue } from "@/lib/workflow/engine";
import { ESCALATION_REASON_LABELS } from "@/lib/domain/labels";
import { confidencePct } from "@/lib/format";
import { Badge, cx, type Tone } from "@/components/ui/primitives";
import { OutcomeBadge, SeverityBadge } from "@/components/domain/badges";
import { describeCondition, stepTitle } from "./config-data";
import { Chips, FieldLabel, Mono, ToolModeBadge } from "./config-ui";

export const STEP_TYPE_META: Record<WorkflowStepType, { label: string; icon: LucideIcon; tone: Tone; ring: string }> = {
  start: { label: "Start", icon: Play, tone: "navy", ring: "border-navy bg-navy text-white" },
  question: { label: "Question", icon: MessageCircleQuestion, tone: "neutral", ring: "border-line-strong bg-surface text-ink-2" },
  visual_request: { label: "Visual request", icon: Camera, tone: "brand", ring: "border-brand/30 bg-brand-soft text-brand-ink" },
  guidance: { label: "Guidance", icon: Compass, tone: "neutral", ring: "border-line-strong bg-surface text-ink-2" },
  business_action: { label: "Business action", icon: Zap, tone: "neutral", ring: "border-line-strong bg-surface-2 text-ink" },
  human_escalation: { label: "Human escalation", icon: Headset, tone: "violet", ring: "border-violet/30 bg-violet-soft text-violet" },
  completion: { label: "Completion", icon: CheckCircle2, tone: "ok", ring: "border-ok/30 bg-ok-soft text-ok" },
};

export function StepTypeBadge({ type }: { type: WorkflowStepType }) {
  const meta = STEP_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} icon={<Icon className="size-3" aria-hidden />}>
      {meta.label}
    </Badge>
  );
}

function StepLink({ def, to }: { def: WorkflowDefinition; to: string }) {
  return (
    <a href={`#step-${to}`} className="font-medium text-brand hover:underline">
      {stepTitle(def, to)}
    </a>
  );
}

function IssueIcon({ severity }: { severity: ValidationIssue["severity"] }) {
  if (severity === "error") return <XCircle className="size-3.5 shrink-0 text-danger" aria-label="Error" />;
  if (severity === "warning") return <AlertTriangle className="size-3.5 shrink-0 text-warn" aria-label="Warning" />;
  return <Info className="size-3.5 shrink-0 text-muted" aria-label="Info" />;
}

export function IssueLine({ issue, def }: { issue: ValidationIssue; def: WorkflowDefinition }) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <IssueIcon severity={issue.severity} />
      <span className="min-w-0 text-ink-2">
        <span className="sr-only">{issue.severity}: </span>
        {issue.stepKey && (
          <>
            <a href={`#step-${issue.stepKey}`} className="font-medium text-brand hover:underline">
              {stepTitle(def, issue.stepKey)}
            </a>
            {" — "}
          </>
        )}
        {issue.message}
      </span>
    </li>
  );
}

export function WorkflowNode({
  def,
  step,
  index,
  policy,
  issues,
  funnel,
  last,
}: {
  def: WorkflowDefinition;
  step: WorkflowStep;
  index: number;
  policy?: Policy;
  issues: ValidationIssue[];
  funnel?: { entered: number; completed: number; failed: number };
  last: boolean;
}) {
  const meta = STEP_TYPE_META[step.type];
  const Icon = meta.icon;
  const isVisualDecision = step.next.some((r) => r.when.kind === "observation");
  const toolPerm = step.action ? policy?.tools.find((t) => t.tool === step.action!.tool) : undefined;
  const mandatory = step.escalation ? policy?.mandatoryHumanReasons.includes(step.escalation.reason) : false;
  const threshold = step.confidenceThreshold ?? def.defaultConfidenceThreshold;

  return (
    <li id={`step-${step.key}`} className="relative scroll-mt-20 pl-11">
      {!last && <span aria-hidden className="absolute bottom-0 left-[15px] top-9 w-px bg-line-strong" />}
      <span aria-hidden className={cx("absolute left-0 top-2 flex size-8 items-center justify-center rounded-full border", meta.ring)}>
        <Icon className="size-4" />
      </span>

      <article className="mb-3 rounded-lg border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="tabular text-xs font-semibold text-muted">{String(index + 1).padStart(2, "0")}</span>
            <StepTypeBadge type={step.type} />
            {isVisualDecision && <Badge tone="brand">Visual decision</Badge>}
            {def.startStep === step.key && <Badge tone="neutral">Entry point</Badge>}
            <h3 className="text-[13px] font-semibold text-ink">{step.title}</h3>
            <Mono>{step.key}</Mono>
          </div>
          {funnel && (
            <span className="tabular text-[11px] text-muted">
              {funnel.entered} entered · {funnel.completed} completed{funnel.failed > 0 ? ` · ${funnel.failed} failed` : ""}
            </span>
          )}
        </header>

        <div className="space-y-3 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>AI instruction</FieldLabel>
              <p className="mt-1 text-[13px] leading-5 text-ink-2">{step.instruction}</p>
            </div>
            <div>
              <FieldLabel>Customer prompt</FieldLabel>
              <p className="mt-1 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px] font-medium text-ink">{step.customerPrompt}</p>
            </div>
          </div>

          {(step.allowedGuidance?.length ?? 0) > 0 && (
            <div>
              <FieldLabel>Allowed guidance</FieldLabel>
              <div className="mt-1">
                <Chips items={step.allowedGuidance!} />
              </div>
            </div>
          )}

          {step.evidence && (
            <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
              <FieldLabel>Required evidence</FieldLabel>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-muted">Checkpoint</dt>
                <dd>
                  <Mono>{step.evidence.checkpoint}</Mono> <span className="text-ink-2">— {step.evidence.description}</span>
                </dd>
                <dt className="text-muted">View</dt>
                <dd className="text-ink-2">{step.evidence.view.replace("_", "-")}</dd>
                <dt className="text-muted">Observations</dt>
                <dd>
                  <Chips items={step.evidence.observationTypes} mono />
                </dd>
                <dt className="text-muted">Confidence</dt>
                <dd className="text-ink-2">
                  ≥ {confidencePct(threshold)}
                  {step.confidenceThreshold === undefined && <span className="text-muted"> (workflow default)</span>}
                </dd>
                <dt className="text-muted">Max attempts</dt>
                <dd className="text-ink-2">{step.maxAttempts ?? policy?.maxCaptureAttempts ?? "—"}{step.maxAttempts === undefined && policy && <span className="text-muted"> (policy default)</span>}</dd>
              </dl>
            </div>
          )}

          {step.action && (
            <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
              <FieldLabel>Business action</FieldLabel>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                <Mono>{step.action.tool}</Mono>
                {Object.entries(step.action.params).map(([k, v]) => (
                  <span key={k} className="text-xs text-muted">
                    {k}=<span className="text-ink-2">{String(v)}</span>
                  </span>
                ))}
                {toolPerm ? <ToolModeBadge mode={toolPerm.mode} /> : <Badge tone="danger">Not in policy — will be denied</Badge>}
                {toolPerm?.requiresIdempotencyKey && <span className="text-xs text-muted">idempotency key required</span>}
              </div>
            </div>
          )}

          {step.next.length > 0 && (
            <div>
              <FieldLabel>{isVisualDecision ? "Visual decision — next" : "Next"}</FieldLabel>
              <ul className="mt-1 space-y-1">
                {step.next.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-ink-2">
                    <span>{describeCondition(r.when)}</span>
                    <ArrowRight className="size-3 shrink-0 self-center text-muted" aria-label="goes to" />
                    <StepLink def={def} to={r.to} />
                    <span className="text-xs text-muted">({r.label})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(step.onFailure || step.escalation || step.completion) && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-2.5 text-[13px]">
              {step.onFailure && (
                <div>
                  <FieldLabel>Failure path</FieldLabel>
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5 text-ink-2">
                    <span>On failure{step.maxAttempts ? ` after ${step.maxAttempts} attempts` : ""}</span>
                    <ArrowRight className="size-3 self-center text-muted" aria-label="goes to" />
                    <StepLink def={def} to={step.onFailure.to} />
                    <span className="text-xs text-muted">({ESCALATION_REASON_LABELS[step.onFailure.reason]})</span>
                  </div>
                </div>
              )}
              {step.escalation && (
                <div>
                  <FieldLabel>Escalation rule</FieldLabel>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-ink-2">{ESCALATION_REASON_LABELS[step.escalation.reason]}</span>
                    <SeverityBadge severity={step.escalation.severity} />
                    {(step.escalation.humanOnly || mandatory) && <Badge tone="violet">Mandatory human</Badge>}
                  </div>
                </div>
              )}
              {step.completion && (
                <div>
                  <FieldLabel>Completion outcome</FieldLabel>
                  <div className="mt-1">
                    <OutcomeBadge outcome={step.completion.outcome} />
                  </div>
                </div>
              )}
            </div>
          )}

          {issues.length > 0 && (
            <ul className="space-y-1 border-t border-line pt-2.5">
              {issues.map((iss, i) => (
                <IssueLine key={i} issue={{ ...iss, stepKey: undefined }} def={def} />
              ))}
            </ul>
          )}
        </div>
      </article>
    </li>
  );
}
