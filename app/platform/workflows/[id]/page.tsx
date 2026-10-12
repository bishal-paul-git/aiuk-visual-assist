import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, Lock, ShieldCheck, XCircle } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { getPolicy, getWorkflow, tenantName, workflows } from "@/lib/config/catalog";
import { validateWorkflow } from "@/lib/workflow/engine";
import { computeMetrics, stepFunnel } from "@/lib/analytics/metrics";
import { confidencePct, formatDateTime, formatMinutes, pct } from "@/lib/format";
import { Badge, KeyValue, Meter, PageHeader, Panel, Table, Td, Th, cx } from "@/components/ui/primitives";
import { WorkflowStatusBadge } from "@/components/domain/badges";
import { SECTOR_LABELS, orderSteps } from "@/components/platform/config-data";
import { ConfigStatusBadge, FieldLabel, Mono } from "@/components/platform/config-ui";
import { IssueLine, STEP_TYPE_META, StepTypeBadge, WorkflowNode } from "@/components/platform/config-workflow-node";
import { WorkflowVersionActions } from "@/components/platform/workflow-version-actions";

export async function generateStaticParams() {
  return workflows.map((w) => ({ id: w.id }));
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const scope = await platformScope("platform.access", `/platform/workflows/${id}`);
  const found = getWorkflow(id);
  const wf = found && scope.includes(found.tenantId) ? found : undefined;
  return { title: wf ? `${wf.name} v${wf.version}` : "Workflow" };
}

export default async function WorkflowDetailPage({ params }: Props) {
  const { id } = await params;
  const scope = await platformScope("platform.access", `/platform/workflows/${id}`);
  const rt = scope.rt;
  const def = getWorkflow(id);
  // Another client's workflow is "not found", never "forbidden".
  if (!def || !scope.includes(def.tenantId)) notFound();

  const policy = getPolicy(def.policyId);
  const issues = validateWorkflow(def);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  const steps = orderSteps(def);
  const states = rt.states({ tenantId: def.tenantId }).filter((s) => s.session.workflowId === def.id);
  const funnel = stepFunnel(states);
  const m = computeMetrics(states);
  const versions = workflows.filter((w) => w.key === def.key && w.tenantId === def.tenantId).sort((a, b) => b.version - a.version);
  const draft = versions.find((w) => w.status === "draft" || w.status === "in_review");
  const openDraft = draft && draft.id !== def.id ? { id: draft.id, version: draft.version, status: draft.status } : undefined;
  const typeCounts = steps.reduce<Record<string, number>>((acc, s) => ((acc[s.type] = (acc[s.type] ?? 0) + 1), acc), {});

  return (
    <>
      <Link href="/platform/workflows" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
        <ArrowLeft className="size-3" aria-hidden /> All workflows
      </Link>
      <PageHeader
        title={`${def.name} v${def.version}`}
        description={`${tenantName(def.tenantId)} · ${SECTOR_LABELS[def.sector]} · key ${def.key}`}
        meta={
          <>
            <WorkflowStatusBadge status={def.status} />
            <Badge tone="neutral">{def.steps.length} steps</Badge>
            {errors.length === 0 ? (
              <Badge tone="ok" icon={<CheckCircle2 className="size-3" aria-hidden />}>
                Publish checks pass
              </Badge>
            ) : (
              <Badge tone="danger" icon={<XCircle className="size-3" aria-hidden />}>
                {errors.length} blocking error{errors.length === 1 ? "" : "s"}
              </Badge>
            )}
            {def.status === "published" || def.status === "retired" ? (
              <Badge tone="neutral" icon={<Lock className="size-3" aria-hidden />}>
                Immutable version
              </Badge>
            ) : null}
          </>
        }
        actions={<WorkflowVersionActions id={def.id} status={def.status} version={def.version} openDraft={openDraft} />}
      />

      {versions.length > 1 && (
        <nav aria-label="Versions" className="-mt-2 mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Versions:</span>
          {versions.map((v) => (
            <Link
              key={v.id}
              href={`/platform/workflows/${v.id}`}
              aria-current={v.id === def.id ? "page" : undefined}
              className={cx(
                "rounded-md border px-2 py-0.5 font-medium",
                v.id === def.id ? "border-brand/30 bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              v{v.version} · {v.status.replace("_", " ")}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Definition" className="xl:col-span-2">
          <p className="text-[13px] leading-5 text-ink">{def.objective}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Allowed scope</FieldLabel>
              <ul className="mt-1.5 space-y-1 text-[13px] text-ink-2">
                {def.allowedScope.map((s) => (
                  <li key={s} className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <FieldLabel>Prohibited guidance</FieldLabel>
              <ul className="mt-1.5 space-y-1 text-[13px] text-ink-2">
                {def.prohibitedGuidance.map((s) => (
                  <li key={s} className="flex items-start gap-1.5">
                    <Ban className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <KeyValue
              items={[
                [
                  "Linked policy",
                  policy ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Link href={`/platform/policies#${def.policyId}`} className="text-brand hover:underline">
                        {policy.name} v{policy.version}
                      </Link>
                      <ConfigStatusBadge status={policy.status} />
                    </span>
                  ) : (
                    <Badge tone="danger">Missing policy {def.policyId}</Badge>
                  ),
                ],
                ["Default confidence", `≥ ${confidencePct(def.defaultConfidenceThreshold)}`],
                ["Max AI duration", formatMinutes(def.maxAiDurationSec)],
                ["Start step", <Mono key="s">{def.startStep}</Mono>],
                ["Change note", def.changeNote],
                ["Published", def.publishedAt ? `${formatDateTime(def.publishedAt)} by ${def.publishedBy ?? "—"}` : "Not published"],
                ["Approval", def.approvedBy ? `Submitted by ${def.submittedBy ?? "—"} · approved by ${def.approvedBy}` : def.status === "in_review" && def.submittedBy ? `Submitted by ${def.submittedBy} · awaiting approval` : "—"],
              ]}
            />
          </div>
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-muted" aria-hidden /> Publish checks
            </span>
          }
          description="Static validation (validateWorkflow) run before a version can be published"
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Badge tone={errors.length ? "danger" : "neutral"}>{errors.length} errors</Badge>
            <Badge tone={warnings.length ? "warn" : "neutral"}>{warnings.length} warnings</Badge>
            <Badge tone="neutral">{infos.length} info</Badge>
          </div>
          {issues.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[13px] text-ok">
              <CheckCircle2 className="size-3.5" aria-hidden /> All checks passing.
            </p>
          ) : (
            <div className="space-y-3">
              {[
                { label: "Errors — block publishing", list: errors },
                { label: "Warnings", list: warnings },
                { label: "Info", list: infos },
              ]
                .filter((g) => g.list.length > 0)
                .map((g) => (
                  <div key={g.label}>
                    <FieldLabel>{g.label}</FieldLabel>
                    <ul className="mt-1.5 space-y-1.5">
                      {g.list.map((iss, i) => (
                        <IssueLine key={i} issue={iss} def={def} />
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
          <p className="mt-3 border-t border-line pt-2.5 text-xs text-muted">
            Checks: step keys unique, start step exists, every rule and failure path targets a real step, visual requests define evidence and a failure path,
            business actions define an action, terminal steps define an outcome or reason, every step has AI wording, every step reachable, and a human escalation step exists.
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel
          title="Workflow builder"
          description="Steps ordered by distance from the entry point; completion and escalation steps last. Within a step, rules are evaluated top to bottom and the first match wins."
          className="xl:col-span-2"
        >
          <ol aria-label="Workflow steps">
            {steps.map((step, i) => (
              <WorkflowNode
                key={step.key}
                def={def}
                step={step}
                index={i}
                policy={policy}
                issues={issues.filter((x) => x.stepKey === step.key)}
                funnel={states.length ? (funnel.get(step.key) ?? { entered: 0, completed: 0, failed: 0 }) : undefined}
                last={i === steps.length - 1}
              />
            ))}
          </ol>
        </Panel>

        <div className="space-y-4 xl:sticky xl:top-20">
          <Panel title="Step funnel" description={`${states.length} sessions on this version`} bodyClassName="p-0">
            {states.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">
                No sessions have run on this version{def.status === "published" ? " yet" : ` — it is ${def.status.replace("_", " ")}`}.
              </p>
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Step</Th>
                      <Th align="right">Entered</Th>
                      <Th align="right">Done</Th>
                      <Th align="right">Failed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((s) => {
                      const f = funnel.get(s.key) ?? { entered: 0, completed: 0, failed: 0 };
                      return (
                        <tr key={s.key}>
                          <Td>
                            <a href={`#step-${s.key}`} className="text-ink hover:text-brand hover:underline">
                              {s.title}
                            </a>
                            <div className="mt-1 w-24">
                              <Meter value={f.entered / Math.max(1, states.length)} label={`${s.title}: ${pct(f.entered / Math.max(1, states.length))} of sessions entered`} />
                            </div>
                          </Td>
                          <Td align="right">{f.entered}</Td>
                          <Td align="right">{f.completed}</Td>
                          <Td align="right" className={f.failed ? "text-danger" : undefined}>
                            {f.failed}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                <p className="px-4 py-2.5 text-xs text-muted">
                  Entered counts sessions; done and failed count passes, so a step the customer repeats can complete more often than it was entered. Bar = share of sessions that entered. AI resolution {pct(m.aiResolutionRate)} · escalation {pct(m.escalationRate)}.
                </p>
              </>
            )}
          </Panel>

          <Panel title="Node types">
            <ul className="space-y-1.5 text-[13px]">
              {(Object.keys(STEP_TYPE_META) as (keyof typeof STEP_TYPE_META)[]).map((t) => (
                <li key={t} className="flex items-center justify-between gap-2">
                  <StepTypeBadge type={t} />
                  <span className="tabular text-xs text-muted">{typeCounts[t] ?? 0}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              A visual request whose next rules branch on observations is a <span className="font-medium text-ink-2">visual decision</span>.
            </p>
          </Panel>
        </div>
      </div>

      <Panel
        title="Version history"
        description="Each version is submitted by one administrator and approved by a different one before it is published (four-eyes)."
        className="mt-4"
        bodyClassName="p-0"
      >
        <Table>
          <thead>
            <tr>
              <Th>Version</Th>
              <Th>Status</Th>
              <Th>Change note</Th>
              <Th>Submitted by</Th>
              <Th>Approved by</Th>
              <Th>Published</Th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <Td className="whitespace-nowrap">
                  <Link href={`/platform/workflows/${v.id}`} className="font-medium text-brand hover:underline" aria-current={v.id === def.id ? "page" : undefined}>
                    v{v.version}
                  </Link>
                  {v.basedOnVersion && <div className="text-xs text-muted">from v{v.basedOnVersion}</div>}
                </Td>
                <Td>
                  <WorkflowStatusBadge status={v.status} />
                </Td>
                <Td className="min-w-[220px] text-xs">{v.changeNote || <span className="text-muted">—</span>}</Td>
                <Td className="whitespace-nowrap text-xs">{v.submittedBy ?? <span className="text-muted">—</span>}</Td>
                <Td className="whitespace-nowrap text-xs">{v.approvedBy ?? <span className="text-muted">{v.publishedBy ? "Not recorded" : "—"}</span>}</Td>
                <Td className="whitespace-nowrap text-xs">{v.publishedAt ? `${formatDateTime(v.publishedAt)} by ${v.publishedBy ?? "—"}` : <span className="text-muted">—</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
