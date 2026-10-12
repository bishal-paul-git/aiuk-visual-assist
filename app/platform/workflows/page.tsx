import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { getPolicy, tenantName, workflows as allWorkflows } from "@/lib/config/catalog";
import { validateWorkflow } from "@/lib/workflow/engine";
import { computeMetrics } from "@/lib/analytics/metrics";
import { formatDateTime, pct } from "@/lib/format";
import { Badge, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { WorkflowStatusBadge } from "@/components/domain/badges";
import { SECTOR_LABELS } from "@/components/platform/config-data";

export const metadata = { title: "Visual Workflows" };

export default async function WorkflowsPage() {
  const scope = await platformScope("platform.access", "/platform/workflows");
  const states = scope.states();
  const workflows = scope.filter(allWorkflows);

  const groups = new Map<string, typeof workflows>();
  for (const w of workflows) groups.set(w.key, [...(groups.get(w.key) ?? []), w]);
  const grouped = [...groups.entries()].map(([key, versions]) => ({ key, versions: [...versions].sort((a, b) => b.version - a.version) }));

  return (
    <>
      <PageHeader
        title="Visual Workflows"
        description="Versioned, tenant-scoped workflow definitions. Sessions are pinned to the exact version they started on; only published versions can start new sessions."
        meta={<Badge tone="neutral">{grouped.length} workflows · {workflows.length} versions</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Published" value={workflows.filter((w) => w.status === "published").length} hint="Can start sessions" />
        <Stat label="In review" value={workflows.filter((w) => w.status === "in_review").length} />
        <Stat label="Draft" value={workflows.filter((w) => w.status === "draft").length} />
        <Stat label="Retired" value={workflows.filter((w) => w.status === "retired").length} hint="Kept for audit of past sessions" />
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map(({ key, versions }) => {
          const head = versions[0];
          return (
            <Panel
              key={key}
              title={head.name}
              description={
                <>
                  {tenantName(head.tenantId)} · {SECTOR_LABELS[head.sector]} · key <span className="font-mono">{key}</span>
                </>
              }
              actions={
                <Link href={`/platform/workflows/${head.id}`} className="text-xs font-medium text-brand hover:underline">
                  Open latest
                </Link>
              }
              bodyClassName="p-0"
            >
              <p className="border-b border-line px-4 py-2.5 text-[13px] text-ink-2">{head.objective}</p>
              <Table>
                <thead>
                  <tr>
                    <Th>Version</Th>
                    <Th>Status</Th>
                    <Th>Change note</Th>
                    <Th>Published</Th>
                    <Th>Policy</Th>
                    <Th align="right">Steps</Th>
                    <Th>Publish checks</Th>
                    <Th align="right">Sessions</Th>
                    <Th align="right">AI resolution</Th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((w) => {
                    const issues = validateWorkflow(w);
                    const errors = issues.filter((i) => i.severity === "error").length;
                    const warnings = issues.filter((i) => i.severity === "warning").length;
                    const infos = issues.filter((i) => i.severity === "info").length;
                    const m = computeMetrics(states.filter((s) => s.session.workflowId === w.id));
                    const policy = getPolicy(w.policyId);
                    return (
                      <tr key={w.id} className="hover:bg-surface-2">
                        <Td>
                          <Link href={`/platform/workflows/${w.id}`} className="font-medium text-brand hover:underline">
                            v{w.version}
                          </Link>
                        </Td>
                        <Td>
                          <WorkflowStatusBadge status={w.status} />
                        </Td>
                        <Td className="min-w-64 text-xs">{w.changeNote}</Td>
                        <Td className="whitespace-nowrap text-xs">
                          {w.publishedAt ? (
                            <>
                              {formatDateTime(w.publishedAt)}
                              <div className="text-muted">by {w.publishedBy ?? "—"}</div>
                            </>
                          ) : (
                            <span className="text-muted">Not published</span>
                          )}
                        </Td>
                        <Td className="text-xs">{policy ? `${policy.name} v${policy.version}` : w.policyId}</Td>
                        <Td align="right">{w.steps.length}</Td>
                        <Td>
                          <span className="flex flex-wrap gap-1">
                            {errors > 0 && (
                              <Badge tone="danger" icon={<XCircle className="size-3" aria-hidden />}>
                                {errors} error{errors === 1 ? "" : "s"}
                              </Badge>
                            )}
                            {warnings > 0 && (
                              <Badge tone="warn" icon={<AlertTriangle className="size-3" aria-hidden />}>
                                {warnings} warning{warnings === 1 ? "" : "s"}
                              </Badge>
                            )}
                            {errors === 0 && warnings === 0 && (
                              <Badge tone="ok" icon={<CheckCircle2 className="size-3" aria-hidden />}>
                                Passing
                              </Badge>
                            )}
                            {infos > 0 && (
                              <Badge tone="neutral" icon={<Info className="size-3" aria-hidden />}>
                                {infos} info
                              </Badge>
                            )}
                          </span>
                        </Td>
                        <Td align="right">{m.sessions}</Td>
                        <Td align="right">{m.completed ? pct(m.aiResolutionRate) : "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
