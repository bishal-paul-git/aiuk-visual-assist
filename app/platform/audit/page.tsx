import Link from "next/link";
import { Search } from "lucide-react";
import { platformRuntime, staticSafeSearchParams } from "@/lib/server/platform-data";
import { tenants, tenantName } from "@/lib/config/catalog";
import type { SessionState } from "@/lib/domain/session";
import type { AuditEvent } from "@/lib/domain/types";
import { formatDateTime, formatTimeSec } from "@/lib/format";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { securityEvents } from "@/lib/auth/security-log";
import { Badge, EmptyState, PageHeader, Panel, Table, Td, Th, buttonClass, cx } from "@/components/ui/primitives";
import {
  ACTOR_LABELS,
  ACTOR_TYPES,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  actorName,
  eventCategory,
  firstParam,
  summarizePayload,
  versionContext,
  type SearchParams,
} from "@/components/platform/audit-format";
import { Pagination, fieldClass, hrefWith, parsePage } from "@/components/platform/pagination";

export const metadata = { title: "Audit Logs" };

const PAGE_SIZE = 50;

interface Row {
  event: AuditEvent;
  sessionId: string;
  reference: string;
  tenantId: string;
}

function flatten(states: SessionState[], configEvents: AuditEvent[], security: AuditEvent[] = []): Row[] {
  // Configuration changes (workflow versions) have no session; they link to the configuration item.
  const rows: Row[] = configEvents.map((event) => ({ event, sessionId: "", reference: `${String(event.payload.key)} v${String(event.payload.version)}`, tenantId: event.tenantId }));
  // Sign-in, sign-out and access denials (no session).
  for (const event of security) rows.push({ event, sessionId: "", reference: "Access", tenantId: event.tenantId });
  for (const st of states)
    for (const event of st.audit)
      rows.push({ event, sessionId: st.session.id, reference: st.session.reference, tenantId: event.tenantId || st.session.tenantId });
  return rows.sort((a, b) => b.event.timestamp.localeCompare(a.event.timestamp) || b.event.id.localeCompare(a.event.id));
}

export default async function AuditLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const rt = await platformRuntime();
  const sp = await staticSafeSearchParams(searchParams);
  const filters = {
    type: firstParam(sp.type),
    actor: firstParam(sp.actor),
    client: firstParam(sp.client),
    ref: firstParam(sp.ref),
  };
  const all = flatten(rt.states(), getWorkflowRegistry().audit, securityEvents());
  const ref = filters.ref?.toLowerCase();
  // Category counts reflect every filter except the event type, so the chips show where events sit.
  const beforeType = all.filter(
    (r) =>
      (!filters.actor || r.event.actorType === filters.actor) &&
      (!filters.client || r.tenantId === filters.client) &&
      (!ref || r.reference.toLowerCase().includes(ref) || r.sessionId.toLowerCase().includes(ref)),
  );
  const matched = beforeType.filter((r) => !filters.type || r.event.eventType.startsWith(`${filters.type}.`));
  const counts = new Map<string, number>();
  for (const r of beforeType) {
    const c = eventCategory(r.event.eventType);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(parsePage(firstParam(sp.page)), pages);
  const rows = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const anyFilter = Object.values(filters).some(Boolean);
  const sessionsCovered = new Set(matched.map((r) => r.sessionId)).size;

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Append-only domain events across all sessions, newest first. Each event records the actor and the workflow, policy and model versions in force (docs/04 §3, docs/06 §7)."
        meta={
          <>
            <Badge tone="neutral">
              {matched.length} of {all.length} events
            </Badge>
            <Badge tone="neutral">{sessionsCovered} sessions</Badge>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Filter by event category">
        <Link
          href={hrefWith("/platform/audit", { ...filters, type: undefined })}
          aria-current={!filters.type ? "true" : undefined}
          className={cx(buttonClass(!filters.type ? "navy" : "secondary", "sm"))}
        >
          All <span className="tabular opacity-70">{beforeType.length}</span>
        </Link>
        {EVENT_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={hrefWith("/platform/audit", { ...filters, type: c })}
            aria-current={filters.type === c ? "true" : undefined}
            className={cx(buttonClass(filters.type === c ? "navy" : "secondary", "sm"))}
          >
            {EVENT_CATEGORY_LABELS[c]} <span className="tabular opacity-70">{counts.get(c) ?? 0}</span>
          </Link>
        ))}
      </div>

      <Panel bodyClassName="p-0">
        <form method="get" action="/platform/audit" className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3" role="search" aria-label="Filter audit events">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Session reference
            <span className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input name="ref" defaultValue={filters.ref} placeholder="VA-12467" className={`${fieldClass} w-36 pl-7`} />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Event type
            <select name="type" defaultValue={filters.type ?? ""} className={fieldClass}>
              <option value="">All types</option>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}.*
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Actor
            <select name="actor" defaultValue={filters.actor ?? ""} className={fieldClass}>
              <option value="">Any actor</option>
              {ACTOR_TYPES.map((a) => (
                <option key={a} value={a}>
                  {ACTOR_LABELS[a]}
                </option>
              ))}
            </select>
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
          <div className="flex items-center gap-2">
            <button type="submit" className={buttonClass("primary", "sm")}>
              Apply filters
            </button>
            {anyFilter && (
              <Link href="/platform/audit" className={buttonClass("ghost", "sm")}>
                Reset
              </Link>
            )}
          </div>
        </form>

        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No audit events match these filters">Clear a filter or check the session reference.</EmptyState>
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Event</Th>
                  <Th>Actor</Th>
                  <Th>Session</Th>
                  <Th>Client</Th>
                  <Th>Payload</Th>
                  <Th>Version context</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.sessionId}-${r.event.id}`} className="align-top hover:bg-surface-2">
                    <Td className="tabular whitespace-nowrap">
                      {formatDateTime(r.event.timestamp)}
                      <div className="text-xs text-muted">{formatTimeSec(r.event.timestamp)}</div>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-xs text-ink">{r.event.eventType}</Td>
                    <Td className="whitespace-nowrap">
                      {ACTOR_LABELS[r.event.actorType]}
                      <div className="text-xs text-muted">{actorName(r.event.actorType, r.event.actorId)}</div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.event.eventType.startsWith("security.") ? (
                        <>
                          <span className="font-medium text-ink">{r.reference}</span>
                          <div className="text-xs text-muted">Sign-in and permissions</div>
                        </>
                      ) : (
                        <>
                          <Link
                            href={r.sessionId ? `/platform/sessions/${r.sessionId}` : `/platform/workflows/${String(r.event.payload.workflowId)}`}
                            className="font-medium text-brand hover:underline"
                          >
                            {r.reference}
                          </Link>
                          {!r.sessionId && <div className="text-xs text-muted">Workflow config</div>}
                        </>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{tenantName(r.tenantId)}</Td>
                    <Td className="min-w-[260px] text-xs">{summarizePayload(r.event.payload)}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted">{versionContext(r.event.context)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination pathname="/platform/audit" params={filters} page={page} pageSize={PAGE_SIZE} total={matched.length} />
          </>
        )}
      </Panel>
      <p className="mt-3 text-xs text-muted">
        Payloads are summarised; open a session for its complete timeline. Model versions ending in “-sim” are simulated providers, not production models.
      </p>
    </>
  );
}
