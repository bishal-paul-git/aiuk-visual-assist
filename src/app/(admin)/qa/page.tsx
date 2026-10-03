"use client";
import { useMemo, useState } from "react";
import { PageHeader, Panel, Segmented, Select, Table, Th, Td, Tr, Chip, EmptyState } from "@/components/ui/primitives";
import { Kpi } from "@/components/ui/Kpi";
import { cn } from "@/components/ui/cn";
import { useSessions } from "@/lib/services/sessions";
import { useAppState } from "@/lib/store";
import { clientById, clients } from "@/lib/data/clients";
import { qaMetricsFor, qaStateMeta, qaTrends, scoreTone } from "@/lib/data/qa";
import type { QaState } from "@/lib/store";
import { ReviewDrawer, type ReviewDraft } from "@/components/qa/ReviewDrawer";
import { FlaggedPanel } from "@/components/qa/FlaggedPanel";

const states: QaState[] = ["pending", "in_review", "approved", "needs_coaching", "rejected"];
const emptyDraft = (): ReviewDraft => ({ verdicts: {}, ratings: { accuracy: 4, compliance: 4, escalation: 4 } });
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default function QaPage() {
  const all = useSessions();
  const qaStates = useAppState((s) => s.qaStates);
  const [stateF, setStateF] = useState("all");
  const [clientF, setClientF] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState<"all" | "flagged">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});

  const rows = useMemo(() => all.filter((s) => s.status === "resolved" || s.status === "failed").map((s) => {
    const m = qaMetricsFor(s);
    return { s, m, state: qaStates[s.id] ?? m.baseState };
  }), [all, qaStates]);

  const filtered = rows.filter((r) => (stateF === "all" || r.state === stateF) && (clientF === "all" || r.s.clientId === clientF) && (flaggedOnly === "all" || r.m.flags.length > 0));
  const awaiting = rows.filter((r) => r.state === "pending" || r.state === "in_review").length;
  const open = rows.find((r) => r.s.id === openId);
  const flags = filtered.flatMap((r) => r.m.flags);
  const t = qaTrends;

  return (
    <div>
      <PageHeader title="QA workbench" description="Sampled session review: visual interpretation accuracy, workflow compliance, hallucination review and escalation correctness. Scores are deterministic demo values." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Awaiting review" value={awaiting} delta={t.awaiting.delta} goodWhenUp={false} spark={t.awaiting.spark} hint="vs prior week" />
        <Kpi label="Avg QA score" value={avg(rows.map((r) => r.m.score)).toFixed(1)} delta={t.score.delta} spark={t.score.spark} hint="out of 100" />
        <Kpi label="Visual accuracy" value={`${avg(rows.map((r) => r.m.accuracy)).toFixed(1)}%`} delta={t.accuracy.delta} spark={t.accuracy.spark} />
        <Kpi label="Workflow compliance" value={`${avg(rows.map((r) => r.m.compliance)).toFixed(1)}%`} delta={t.compliance.delta} spark={t.compliance.spark} />
        <Kpi label="Escalation correctness" value={`${avg(rows.map((r) => r.m.escalation)).toFixed(1)}%`} delta={t.escalation.delta} spark={t.escalation.spark} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select label="Review state" value={stateF} onChange={setStateF} options={[{ value: "all", label: "All states" }, ...states.map((s) => ({ value: s, label: qaStateMeta[s].label }))]} />
        <Select label="Client" value={clientF} onChange={setClientF} options={[{ value: "all", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />
        <Segmented value={flaggedOnly} onChange={setFlaggedOnly} options={[{ id: "all", label: "All sessions" }, { id: "flagged", label: "Flagged only" }]} />
        <span className="ml-auto text-xs text-ink-mute">{filtered.length} of {rows.length} sessions</span>
      </div>

      <Panel flush className="mb-5">
        {filtered.length === 0 ? <EmptyState title="No sessions match these filters" /> : (
          <Table>
            <thead><tr><Th>Session</Th><Th>Client</Th><Th>Workflow</Th><Th className="text-right">QA score</Th><Th className="text-right">Accuracy</Th><Th className="text-right">Compliance</Th><Th className="text-right">Escalation</Th><Th className="text-right">Flags</Th><Th>Review state</Th></tr></thead>
            <tbody>
              {filtered.map(({ s, m, state }) => (
                <Tr key={s.id} onClick={() => setOpenId(s.id)} selected={openId === s.id}>
                  <Td className="num font-medium">{s.id}</Td>
                  <Td>{clientById(s.clientId)?.name}</Td>
                  <Td className="text-ink-soft">{s.workflowName}</Td>
                  <Td className="text-right"><Chip tone={scoreTone(m.score)} className="num">{m.score}</Chip></Td>
                  <Td className="num text-right">{m.accuracy}%</Td>
                  <Td className="num text-right">{m.compliance}%</Td>
                  <Td className="num text-right">{m.escalation}%</Td>
                  <Td className={cn("num text-right", m.flags.length ? "font-semibold text-warn" : "text-ink-mute")}>{m.flags.length}</Td>
                  <Td><Chip tone={qaStateMeta[state].tone} dot>{qaStateMeta[state].label}</Chip></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <FlaggedPanel flags={flags} onOpen={setOpenId} />

      {open && (
        <ReviewDrawer
          key={open.s.id} session={open.s} state={open.state} onClose={() => setOpenId(null)}
          draft={drafts[open.s.id] ?? emptyDraft()} setDraft={(d) => setDrafts((x) => ({ ...x, [open.s.id]: d }))}
        />
      )}
    </div>
  );
}
