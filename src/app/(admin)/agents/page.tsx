"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader, Panel, SearchInput, Select, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { agents } from "@/lib/data/agents";
import { workflowById } from "@/lib/data/workflows";
import { useAppState } from "@/lib/store";
import { num } from "@/lib/format";
import { ClientTag } from "@/components/clients/shared";
import { AgentAvatar, AgentStatusChip } from "@/components/agents/shared";

export default function AgentsPage() {
  const clientFilter = useAppState((s) => s.clientFilter);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const rows = useMemo(() => agents
    .filter((a) => clientFilter === "all" || a.clientId === clientFilter)
    .filter((a) => status === "all" || a.status === status)
    .filter((a) => !q || `${a.name} ${a.title} ${a.model}`.toLowerCase().includes(q.toLowerCase())), [clientFilter, q, status]);
  return (
    <>
      <PageHeader title="AI agents" description="Configure the persona, voice, knowledge, tools and escalation behaviour of each AI agent. Agents act only within their assigned workflows." />
      <Panel flush title={`${rows.length} agent${rows.length === 1 ? "" : "s"}`} actions={<>
        <SearchInput value={q} onChange={setQ} placeholder="Search agents…" />
        <Select label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "paused", label: "Paused" }]} />
      </>}>
        <Table>
          <thead><tr><Th>Agent</Th><Th>Client</Th><Th>Status</Th><Th>Voice</Th><Th>Language</Th><Th>Model</Th><Th>Workflow</Th><Th>Version</Th><Th className="text-right">Sessions (30d)</Th><Th className="text-right">Resolution</Th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <Tr key={a.id}>
                <Td><Link href={`/agents/${a.id}`} className="flex items-center gap-2.5 font-medium hover:text-brand-strong"><AgentAvatar agent={a} /><span>{a.name}<span className="block text-2xs font-normal text-ink-mute">{a.title}</span></span></Link></Td>
                <Td><ClientTag id={a.clientId} /></Td>
                <Td><AgentStatusChip status={a.status} /></Td>
                <Td className="text-ink-soft">{a.voice}</Td>
                <Td className="text-ink-soft">{a.language}</Td>
                <Td className="max-w-[180px] truncate text-ink-soft" title={a.model}>{a.model}</Td>
                <Td>{a.workflowIds.map((w) => <Link key={w} href={`/workflows/${w}`} className="block text-ink-soft hover:text-brand-strong hover:underline">{workflowById(w)?.name ?? w}</Link>)}</Td>
                <Td className="font-mono text-xs">{a.version}</Td>
                <Td className="num text-right">{num(a.sessions30d)}</Td>
                <Td className="num text-right">{a.resolution ? `${a.resolution}%` : "—"}</Td>
              </Tr>
            ))}
            {rows.length === 0 && <tr><Td colSpan={10}><EmptyState title="No agents match" hint="Adjust filters or the global client switcher." /></Td></tr>}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
