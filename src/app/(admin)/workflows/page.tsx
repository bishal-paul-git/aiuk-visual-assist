"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader, Panel, SearchInput, Select, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { workflows } from "@/lib/data/workflows";
import { useAppState } from "@/lib/store";
import { num } from "@/lib/format";
import { ClientTag } from "@/components/clients/shared";
import { CompletionBar, WorkflowStatusChip } from "@/components/workflows/shared";

export default function WorkflowsPage() {
  const clientFilter = useAppState((s) => s.clientFilter);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const rows = useMemo(() => workflows
    .filter((w) => clientFilter === "all" || w.clientId === clientFilter)
    .filter((w) => status === "all" || w.status === status)
    .filter((w) => !q || `${w.name} ${w.objective}`.toLowerCase().includes(q.toLowerCase())), [clientFilter, q, status]);
  return (
    <>
      <PageHeader title="Workflows" description="Guided visual journeys: checkpoints, confidence thresholds, allowed guidance, prohibited actions and escalation paths." />
      <Panel flush title={`${rows.length} workflow${rows.length === 1 ? "" : "s"}`} actions={<>
        <SearchInput value={q} onChange={setQ} placeholder="Search workflows…" />
        <Select label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "published", label: "Published" }, { value: "in_review", label: "In review" }, { value: "draft", label: "Draft" }]} />
      </>}>
        <Table>
          <thead><tr><Th>Workflow</Th><Th>Client</Th><Th>Version</Th><Th>Status</Th><Th>Completion rate</Th><Th className="text-right">Sessions (30d)</Th><Th className="text-right">Avg duration</Th><Th>Updated</Th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <Tr key={w.id}>
                <Td><Link href={`/workflows/${w.id}`} className="font-medium hover:text-brand-strong">{w.name}<span className="block text-2xs font-normal text-ink-mute">{w.nodes.length} steps · {w.author}</span></Link></Td>
                <Td><ClientTag id={w.clientId} /></Td>
                <Td className="font-mono text-xs">{w.version}</Td>
                <Td><WorkflowStatusChip status={w.status} /></Td>
                <Td><CompletionBar value={w.completionRate} /></Td>
                <Td className="num text-right">{num(w.sessions30d)}</Td>
                <Td className="num text-right">{w.avgDuration}</Td>
                <Td className="text-ink-soft">{w.updated}</Td>
              </Tr>
            ))}
            {rows.length === 0 && <tr><Td colSpan={8}><EmptyState title="No workflows match" hint="Adjust filters or the global client switcher." /></Td></tr>}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
