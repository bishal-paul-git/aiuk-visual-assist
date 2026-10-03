"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Play, Save, Send, Square } from "lucide-react";
import { Button, Chip, ConfidenceBar, KeyValue, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { workflowById, type Workflow } from "@/lib/data/workflows";
import { agents } from "@/lib/data/agents";
import { ClientTag, Toast, useFlash } from "@/components/clients/shared";
import { WorkflowStatusChip } from "@/components/workflows/shared";
import { FlowCanvas, type SimState } from "@/components/workflows/FlowCanvas";
import { NodeInspector } from "@/components/workflows/NodeInspector";
import { simulationPath } from "@/components/workflows/flow-layout";

export default function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const wf = workflowById(id);
  if (!wf) notFound();
  return <Editor wf={wf} />;
}

function Editor({ wf }: { wf: Workflow }) {
  const [status, setStatus] = useState(wf.status);
  const [versions, setVersions] = useState(wf.versions);
  const [selected, setSelected] = useState<string | null>(wf.nodes.find((n) => n.kind === "capture")?.id ?? null);
  const [sim, setSim] = useState<SimState>({ path: [], idx: -1 });
  const [running, setRunning] = useState(false);
  const [toast, flash] = useFlash(2800);
  const node = wf.nodes.find((n) => n.id === selected) ?? null;
  const agentList = agents.filter((a) => a.workflowIds.includes(wf.id));
  const path = useMemo(() => simulationPath(wf.nodes, wf.edges), [wf]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSim((s) => ({ ...s, idx: Math.min(s.idx + 1, s.path.length - 1) })), 650);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (sim.idx < 0) return;
    setSelected(sim.path[sim.idx]);
    if (sim.idx >= sim.path.length - 1) setRunning(false);
  }, [sim]);

  const simulate = () => {
    if (running) { setRunning(false); return; }
    setSim({ path, idx: -1 }); setRunning(true);
  };
  const publish = () => {
    setStatus("published");
    setVersions((v) => [{ v: wf.version, date: "03 Oct 2026", note: "Published from editor (demo)", status: "Published" }, ...v.map((x) => (x.status === "Published" ? { ...x, status: "Archived" } : x))]);
    flash("Workflow published (demo only)");
  };
  const done = !running && sim.idx >= 0 && sim.idx === sim.path.length - 1;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Workflows", href: "/workflows" }, { label: wf.name }]}
        title={<span className="flex flex-wrap items-center gap-3">{wf.name}<span className="font-mono text-sm font-normal text-ink-mute">{wf.version}</span><WorkflowStatusChip status={status} /></span>}
        description={wf.objective}
        actions={<>
          <Button onClick={simulate}>{running ? <><Square size={13} />Stop</> : <><Play size={13} />Simulate run</>}</Button>
          <Button onClick={() => flash("Draft saved (demo only)")}><Save size={13} />Save draft</Button>
          <Button variant="primary" onClick={publish} disabled={status === "published"}><Send size={13} />{status === "published" ? "Published" : "Publish"}</Button>
        </>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <ClientTag id={wf.clientId} /><span>Author {wf.author}</span><span>Updated {wf.updated}</span>
        {agentList.length > 0 && <span>Agent: {agentList.map((a, i) => <span key={a.id}>{i > 0 && ", "}<Link href={`/agents/${a.id}`} className="font-medium hover:text-brand-strong hover:underline">{a.name}</Link></span>)}</span>}
        {sim.idx >= 0 && <Chip tone={done ? "ok" : "info"} dot pulse={running}>{done ? `Simulation complete · ${sim.path.length} steps` : `Simulating · step ${sim.idx + 1} of ${sim.path.length}`}</Chip>}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <FlowCanvas workflow={wf} selectedId={selected} onSelect={setSelected} sim={sim} />
        <NodeInspector node={node} workflow={wf} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Workflow rules">
          <div className="space-y-4">
            <KeyValue cols={2} items={[
              { k: "Confidence threshold", v: <ConfidenceBar value={wf.confidenceThreshold} threshold={wf.confidenceThreshold} /> },
              { k: "Max AI duration", v: <span className="num">{wf.maxAiMinutes} minutes</span> },
              { k: "Checkpoints", v: <span className="num">{wf.nodes.filter((n) => n.checkpoint).length} required visual checkpoints</span> },
              { k: "Steps", v: <span className="num">{wf.nodes.length} nodes · {wf.edges.length} transitions</span> },
            ]} />
            <div><p className="label mb-1">Completion condition</p><p className="rounded border border-line bg-subtle px-3 py-2 text-[13px]">{wf.completionCondition}</p></div>
            <div>
              <p className="label mb-1">Escalation rules</p>
              <ul className="space-y-1">{wf.escalationRules.map((r) => <li key={r} className="flex gap-2 rounded border border-line px-2.5 py-1.5 text-xs"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-human" />{r}</li>)}</ul>
            </div>
          </div>
        </Panel>
        <Panel flush title="Version history">
          <Table>
            <thead><tr><Th>Version</Th><Th>Date</Th><Th>Change</Th><Th>State</Th></tr></thead>
            <tbody>{versions.map((v, i) => (
              <Tr key={`${v.v}-${i}`}><Td className="font-mono text-xs font-medium">{v.v}</Td><Td className="whitespace-nowrap text-ink-soft">{v.date}</Td><Td>{v.note}</Td>
                <Td><Chip tone={v.status === "Published" ? "ok" : v.status === "In review" ? "warn" : "neutral"}>{v.status}</Chip></Td></Tr>
            ))}</tbody>
          </Table>
        </Panel>
      </div>
      <Toast msg={toast} />
    </>
  );
}
