import Link from "next/link";
import { Search } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { tenants, tenantName } from "@/lib/config/catalog";
import type { SessionOutcome, SessionStatus } from "@/lib/domain/types";
import type { SessionSummaryView } from "@/lib/session/projections";
import { ESCALATION_REASON_LABELS, OUTCOME_LABELS, STATUS_LABELS, humanize } from "@/lib/domain/labels";
import { formatDateTime, formatDuration, formatGBP } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, Table, Td, Th, buttonClass } from "@/components/ui/primitives";
import { OutcomeBadge, OwnerBadge, SessionStatusBadge } from "@/components/domain/badges";
import { Pagination, fieldClass, parsePage } from "@/components/platform/pagination";
import { firstParam, type SearchParams } from "@/components/platform/audit-format";

export const metadata = { title: "Session History" };

const PAGE_SIZE = 25;
const ACTIVE: SessionStatus[] = ["created", "awaiting_consent", "active", "escalated", "human_active"];

interface Filters {
  outcome?: string;
  status?: string;
  escalated?: string;
  q?: string;
  client?: string;
}

function applyFilters(rows: SessionSummaryView[], f: Filters): SessionSummaryView[] {
  const q = f.q?.toLowerCase();
  return rows.filter((s) => {
    if (f.outcome && (f.outcome === "in_progress" ? Boolean(s.outcome) : s.outcome !== f.outcome)) return false;
    if (f.status && s.status !== f.status) return false;
    if (f.escalated === "yes" && !s.escalation) return false;
    if (f.escalated === "no" && s.escalation) return false;
    if (f.client && s.tenantId !== f.client) return false;
    if (q && !s.reference.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Elapsed seconds; ongoing sessions are measured to now. Kept out of render for purity. */
function durationSec(s: SessionSummaryView, now = Date.now()): number {
  if (!s.startedAt) return NaN;
  return ((s.endedAt ? Date.parse(s.endedAt) : now) - Date.parse(s.startedAt)) / 1000;
}

export default async function SessionHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const rt = await platformRuntime();
  const sp = await searchParams;
  const filters: Filters = {
    outcome: firstParam(sp.outcome),
    status: firstParam(sp.status),
    escalated: firstParam(sp.escalated),
    q: firstParam(sp.q),
    client: firstParam(sp.client),
  };
  const all = rt.summaries();
  const matched = applyFilters(all, filters);
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(parsePage(firstParam(sp.page)), pages);
  const rows = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const anyFilter = Object.values(filters).some(Boolean);
  const escalated = matched.filter((s) => s.escalation).length;
  const aiResolved = matched.filter((s) => s.outcome === "resolved_by_ai").length;
  const params = { ...filters } as Record<string, string | undefined>;

  return (
    <>
      <PageHeader
        title="Session history"
        description="Every session, with its outcome, escalation and cost. Open a session for the full auditable reconstruction."
        meta={
          <>
            <Badge tone="neutral">
              {matched.length} of {all.length} sessions
            </Badge>
            <Badge tone="neutral">{escalated} escalated</Badge>
            <Badge tone="neutral">{aiResolved} resolved by AI</Badge>
          </>
        }
      />

      <Panel bodyClassName="p-0">
        <form method="get" action="/platform/sessions" className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3" role="search" aria-label="Filter sessions">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Reference
            <span className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input name="q" defaultValue={filters.q} placeholder="VA-12467" className={`${fieldClass} w-36 pl-7`} />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Client
            <select name="client" defaultValue={filters.client ?? ""} className={fieldClass}>
              <option value="">All clients</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Status
            <select name="status" defaultValue={filters.status ?? ""} className={fieldClass}>
              <option value="">Any status</option>
              {(Object.keys(STATUS_LABELS) as SessionStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Outcome
            <select name="outcome" defaultValue={filters.outcome ?? ""} className={fieldClass}>
              <option value="">Any outcome</option>
              <option value="in_progress">In progress</option>
              {(Object.keys(OUTCOME_LABELS) as SessionOutcome[]).map((k) => (
                <option key={k} value={k}>
                  {OUTCOME_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Escalated
            <select name="escalated" defaultValue={filters.escalated ?? ""} className={fieldClass}>
              <option value="">Either</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className={buttonClass("primary", "sm")}>
              Apply filters
            </button>
            {anyFilter && (
              <Link href="/platform/sessions" className={buttonClass("ghost", "sm")}>
                Reset
              </Link>
            )}
          </div>
        </form>

        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No sessions match these filters">Try widening the filters or clearing the reference search.</EmptyState>
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Client</Th>
                  <Th>Workflow</Th>
                  <Th>Channel</Th>
                  <Th>Started</Th>
                  <Th align="right">Duration</Th>
                  <Th>Outcome</Th>
                  <Th>Escalation reason</Th>
                  <Th>Owner</Th>
                  <Th align="right">Frames</Th>
                  <Th align="right">Uncertain obs.</Th>
                  <Th align="right">Cost</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/platform/sessions/${s.id}`} className="font-medium text-brand hover:underline">
                        {s.reference}
                      </Link>
                      <div className="text-xs text-muted">{s.customerLabel}</div>
                    </Td>
                    <Td className="whitespace-nowrap">{tenantName(s.tenantId)}</Td>
                    <Td className="whitespace-nowrap">
                      {s.workflowName} <span className="text-muted">v{s.workflowVersion}</span>
                    </Td>
                    <Td className="whitespace-nowrap">{humanize(s.channel)}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(s.startedAt ?? s.createdAt)}</Td>
                    <Td align="right">{formatDuration(durationSec(s))}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <OutcomeBadge outcome={s.outcome} />
                        {ACTIVE.includes(s.status) && <SessionStatusBadge status={s.status} />}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{s.escalation ? ESCALATION_REASON_LABELS[s.escalation.reason] : <span className="text-muted">Not escalated</span>}</Td>
                    <Td>
                      <OwnerBadge owner={s.ownerType} />
                    </Td>
                    <Td align="right">{s.frames}</Td>
                    <Td align="right">{s.uncertain > 0 ? <span className="font-medium text-warn">{s.uncertain}</span> : s.uncertain}</Td>
                    <Td align="right">{formatGBP(s.costTotal, 3)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination pathname="/platform/sessions" params={params} page={page} pageSize={PAGE_SIZE} total={matched.length} />
          </>
        )}
      </Panel>
      <p className="mt-3 text-xs text-muted">Costs are provider estimates. Uncertain observations are those still unresolved at the end of the session (latest per observation type).</p>
    </>
  );
}
