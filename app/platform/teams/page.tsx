import { Clock3, Info } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { teams as allTeams, tenantName, users as allUsers } from "@/lib/config/catalog";
import type { EscalationReasonCode } from "@/lib/domain/types";
import { ESCALATION_REASON_LABELS, humanize } from "@/lib/domain/labels";
import { formatMinutes, pct, secondsBetween } from "@/lib/format";
import { Badge, Dot, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { ROLE_LABELS, withinDays } from "@/components/platform/config-data";
import { Chips, FieldLabel, Note } from "@/components/platform/config-ui";

export const metadata = { title: "Human Teams" };

export default async function TeamsPage() {
  const scope = await platformScope("platform.access", "/platform/teams");
  const teams = scope.filter(allTeams);
  const users = scope.filter(allUsers);
  const summaries = scope.summaries();
  const live = summaries.filter((s) => s.live && s.status !== "completed" && s.status !== "failed");
  const waitingAll = live.filter((s) => s.status === "escalated");
  const recent = withinDays(scope.states(), 14);

  const rows = teams.map((team) => {
    const members = users.filter((u) => u.teamId === team.id);
    const memberIds = new Set(members.map((u) => u.id));
    const memberNames = new Set(members.map((u) => u.name));
    const tenantLive = live.filter((s) => s.tenantId === team.tenantId);
    const waiting = tenantLive.filter((s) => s.status === "escalated" && s.escalation && team.escalationReasons.includes(s.escalation.reason));
    const active = tenantLive.filter((s) => s.status === "human_active" && s.escalation?.assignedUserName && memberNames.has(s.escalation.assignedUserName));
    const longest = waiting.reduce((mx, s) => Math.max(mx, secondsBetween(s.escalation!.requestedAt)), 0);
    const answered = recent.filter((s) => s.escalation?.acceptedAt && s.escalation.assignedUserId && memberIds.has(s.escalation.assignedUserId));
    const waits = answered.map((s) => secondsBetween(s.escalation!.requestedAt, s.escalation!.acceptedAt));
    const avgAnswer = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : NaN;
    const withinTarget = waits.length ? waits.filter((w) => w <= team.targetAnswerSec).length / waits.length : NaN;
    return { team, members, waiting, active, longest, answered: answered.length, avgAnswer, withinTarget };
  });

  return (
    <>
      <PageHeader
        title="Human Teams"
        description="Teams that receive escalations from the AI. Routing is by escalation reason; every escalated session arrives with a structured handover so the customer never starts again."
        meta={<Badge tone="neutral">{teams.length} teams · {users.filter((u) => u.teamId).length} members</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Waiting for a human" value={waitingAll.length} tone={waitingAll.length > 2 ? "warn" : undefined} hint={`${scope.label}, live`} />
        <Stat label="Human-active sessions" value={live.filter((s) => s.status === "human_active").length} hint="Live" />
        <Stat label="Agents on teams" value={users.filter((u) => u.teamId && u.role === "agent").length} hint={`${users.filter((u) => u.teamId && u.status !== "active").length} not yet active`} />
        <Stat label="Escalations answered (14 d)" value={rows.reduce((n, r) => n + r.answered, 0)} hint="Attributed to team members" />
      </div>

      <Note className="mt-4" icon={<Info className="size-3.5" />}>
        Live load is derived from session state: <span className="font-medium text-ink">waiting</span> counts escalated sessions whose reason this team handles (a
        session can be eligible for more than one team until a queue service assigns it), and <span className="font-medium text-ink">active</span> counts sessions
        currently owned by a team member. Staffing, presence and shift data are not yet connected.
      </Note>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {rows.map(({ team, members, waiting, active, longest, answered, avgAnswer, withinTarget }) => {
          const overTarget = waiting.length > 0 && longest > team.targetAnswerSec;
          return (
            <Panel
              key={team.id}
              title={team.name}
              description={tenantName(team.tenantId)}
              actions={
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock3 className="size-3.5" aria-hidden /> {team.hours}
                </span>
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <FieldLabel>Waiting</FieldLabel>
                  <div className="tabular mt-0.5 flex items-center gap-1.5 text-xl font-semibold text-ink">
                    <Dot tone={waiting.length ? "warn" : "ok"} />
                    {waiting.length}
                  </div>
                  <div className="text-[11px] text-muted">{waiting.length ? `Longest ${formatMinutes(longest)}` : "Queue clear"}</div>
                </div>
                <div>
                  <FieldLabel>Active</FieldLabel>
                  <div className="tabular mt-0.5 text-xl font-semibold text-ink">{active.length}</div>
                  <div className="text-[11px] text-muted">with a team member</div>
                </div>
                <div>
                  <FieldLabel>Target answer</FieldLabel>
                  <div className="tabular mt-0.5 text-xl font-semibold text-ink">{formatMinutes(team.targetAnswerSec)}</div>
                  <div className={overTarget ? "text-[11px] font-medium text-warn" : "text-[11px] text-muted"}>{overTarget ? "Breached now" : "Within target now"}</div>
                </div>
                <div>
                  <FieldLabel>Avg answer (14 d)</FieldLabel>
                  <div className="tabular mt-0.5 text-xl font-semibold text-ink">{formatMinutes(avgAnswer)}</div>
                  <div className="text-[11px] text-muted">{answered ? `${pct(withinTarget)} within target · ${answered} answered` : "No answered escalations"}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Skills</FieldLabel>
                  <div className="mt-1.5">
                    <Chips items={team.skills.map(humanize)} />
                  </div>
                </div>
                <div>
                  <FieldLabel>Escalation reasons routed here</FieldLabel>
                  <div className="mt-1.5">
                    <Chips items={team.escalationReasons.map((r) => ESCALATION_REASON_LABELS[r as EscalationReasonCode] ?? humanize(r))} />
                  </div>
                </div>
              </div>

              <div className="-mx-4 -mb-4 mt-4 border-t border-line">
                {members.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted">No members assigned.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Member</Th>
                        <Th>Role</Th>
                        <Th>Account</Th>
                        <Th align="right">Now</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((u) => {
                        const handling = active.filter((s) => s.escalation?.assignedUserName === u.name).length;
                        return (
                          <tr key={u.id}>
                            <Td>
                              <div className="font-medium text-ink">{u.name}</div>
                              <div className="text-xs text-muted">{u.email}</div>
                            </Td>
                            <Td>{ROLE_LABELS[u.role] ?? u.role}</Td>
                            <Td>
                              <Badge tone={u.status === "active" ? "ok" : u.status === "invited" ? "brand" : "neutral"}>{humanize(u.status)}</Badge>
                            </Td>
                            <Td align="right">{handling ? `${handling} session${handling === 1 ? "" : "s"}` : <span className="text-muted">—</span>}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
