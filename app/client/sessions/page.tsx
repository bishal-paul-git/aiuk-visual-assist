import Link from "next/link";
import { Smartphone } from "lucide-react";
import { clientScope } from "@/lib/server/client-data";
import { staticSafeSearchParams } from "@/lib/server/platform-data";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, Table, Td, Th } from "@/components/ui/primitives";
import { OutcomeBadge, OwnerBadge, SessionStatusBadge } from "@/components/domain/badges";
import { PortalShell, portalHref } from "@/components/client/portal-shell";

export const metadata = { title: "Sessions" };

const LIMIT = 200;

export default async function ClientSessions({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await staticSafeSearchParams(searchParams);
  const scope = await clientScope("/client/sessions", org);
  const all = scope.summaries();
  const rows = all.slice(0, LIMIT);

  return (
    <PortalShell scope={scope} active="sessions">
      <PageHeader
        title="Sessions"
        description={`Every session run for ${scope.tenant.name}, newest first. Open one to see the conversation, what the AI saw and what it did.`}
        meta={<Badge tone="neutral">{all.length} session{all.length === 1 ? "" : "s"}</Badge>}
      />
      <Panel bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No sessions yet" icon={<Smartphone className="size-5" aria-hidden />}>
            Start a test session from the Home page. It will appear here straight away.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Session</Th>
                <Th>Started</Th>
                <Th>Run on</Th>
                <Th>Status</Th>
                <Th>Result</Th>
                <Th>Handled by</Th>
                <Th align="right">Photos</Th>
                <Th align="right">Time</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const end = s.endedAt ? Date.parse(s.endedAt) : undefined;
                const start = s.startedAt ? Date.parse(s.startedAt) : undefined;
                return (
                  <tr key={s.id}>
                    <Td>
                      <Link href={portalHref(scope, `/client/sessions/${s.id}`)} className="font-medium text-brand hover:underline">
                        {s.reference}
                      </Link>
                      <div className="max-w-56 truncate text-xs text-muted">{s.issue ?? s.workflowName}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {formatRelative(s.startedAt ?? s.createdAt)}
                      <div className="text-muted">{formatDateTime(s.startedAt ?? s.createdAt)}</div>
                    </Td>
                    <Td className="text-xs">{s.scenario ? "Scripted scenario" : "Live AI"}</Td>
                    <Td>
                      <SessionStatusBadge status={s.status} />
                    </Td>
                    <Td>
                      <OutcomeBadge outcome={s.outcome} />
                    </Td>
                    <Td>
                      <OwnerBadge owner={s.ownerType} />
                      {s.escalation?.assignedUserName && <div className="text-xs text-muted">{s.escalation.assignedUserName}</div>}
                    </Td>
                    <Td align="right" className="tabular">
                      {s.frames}
                      {s.uncertain > 0 && <div className="text-[11px] text-warn">{s.uncertain} unsure</div>}
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap text-xs">
                      {start ? formatDuration(((end ?? Date.parse(s.lastActivityAt)) - start) / 1000) : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
      {all.length > LIMIT && <p className="mt-2 text-xs text-muted">Showing the newest {LIMIT} of {all.length}.</p>}
    </PortalShell>
  );
}
