"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button, PageHeader, Panel, SearchInput, Select } from "@/components/ui/primitives";
import { SessionTable } from "@/components/sessions/SessionTable";
import { useSessions } from "@/lib/services/sessions";
import { clients } from "@/lib/data/clients";
import { workflows } from "@/lib/data/workflows";

function SessionsInner() {
  const all = useSessions();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [workflow, setWorkflow] = useState("all");
  const [status, setStatus] = useState("all");
  const [esc, setEsc] = useState("all");
  const [client, setClient] = useState("all");
  const rows = useMemo(() => all.filter((s) =>
    (!q || `${s.id} ${s.customer} ${s.workflowName} ${s.agentName}`.toLowerCase().includes(q.toLowerCase())) &&
    (client === "all" || s.clientId === client) && (workflow === "all" || s.workflowId === workflow) &&
    (status === "all" || s.status === status) && (esc === "all" || (esc === "yes" ? s.escalated : !s.escalated))), [all, q, workflow, status, esc, client]);
  return (
    <>
      <PageHeader title="Sessions" description="Complete history of Human + AI visual assistance sessions. Open any session for the full evidence trail." actions={<Button><Download size={14} />Export (demo)</Button>} />
      <Panel flush title={`${rows.length} sessions`} actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search ID, customer, workflow…" />
          <Select label="Client" value={client} onChange={setClient} options={[{ value: "all", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select label="Workflow" value={workflow} onChange={setWorkflow} options={[{ value: "all", label: "All workflows" }, ...workflows.filter((w) => w.sessions30d > 0).map((w) => ({ value: w.id, label: w.name }))]} />
          <Select label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "resolved", label: "Resolved" }, { value: "failed", label: "Failed" }, { value: "ai_handling", label: "AI handling" }, { value: "escalating", label: "Escalating" }, { value: "human_joined", label: "Human joined" }]} />
          <Select label="Escalation" value={esc} onChange={setEsc} options={[{ value: "all", label: "Escalated: any" }, { value: "yes", label: "Escalated" }, { value: "no", label: "AI only" }]} />
        </div>
      }>
        <SessionTable rows={rows} cols={["id", "client", "workflow", "started", "status", "owner", "duration", "frames", "outcome", "cost"]} />
      </Panel>
    </>
  );
}
export default function SessionsPage() { return <Suspense><SessionsInner /></Suspense>; }
