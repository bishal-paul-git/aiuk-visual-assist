"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Headset, NotebookPen, Octagon, Undo2, AlertTriangle, Layers, Eye } from "lucide-react";
import { Button, Chip, EmptyState, KeyValue, LinkButton, Modal, PageHeader, Panel, Select, TextArea, Field } from "@/components/ui/primitives";
import { OwnerChip, StatusChip, ConnectionIndicator } from "@/components/ui/domain";
import { CameraPanel } from "@/components/visual/CameraPanel";
import { FrameThumb } from "@/components/visual/FrameThumb";
import { ActionsTable, AuditTimeline, CostBreakdown, ObservationList, OwnershipBar, Transcript, WorkflowStepper } from "@/components/sessions/SessionParts";
import { useSession } from "@/lib/services/sessions";
import { actions } from "@/lib/store";
import { clientById } from "@/lib/data/clients";
import { fmtDuration, gbp, isLiveStatus } from "@/lib/data/sessions";
import { useTicker } from "@/lib/hooks/useTicker";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { session: s, detail: d, override } = useSession(id);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [note, setNote] = useState("");
  const [cat, setCat] = useState("Observation");
  const [outcome, setOutcome] = useState("Resolved by human");
  const live = s ? isLiveStatus(s.status) : false;
  const tick = useTicker(live);

  if (!s || !d) return <EmptyState title={`Session ${id} not found`} hint="Return to Sessions to pick another." />;
  const client = clientById(s.clientId)!;
  const frame = d.frames.find((f) => f.id === frameId);
  const reviewing = !!frame;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Sessions", href: "/sessions" }, { label: s.id }]}
        title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{s.id}</span><StatusChip status={s.status} /><OwnerChip owner={s.owner} name={s.humanAgent} />{s.escalated && <Chip tone="warn"><AlertTriangle size={11} />Escalated</Chip>}</span>}
        description={`${client.name} · ${s.workflowName} ${s.workflowVersion} · Agent ${s.agentName} · started ${s.startedAt}`}
        actions={<>
          <LinkButton href="/agent-console/demo"><Headset size={14} />Open agent console</LinkButton>
          <Button onClick={() => setNoteOpen(true)}><NotebookPen size={14} />Add note</Button>
          {live && s.owner === "AI" && <Button variant="human" onClick={() => actions.takeOver(s.id)}><ArrowRightLeft size={14} />Take over</Button>}
          {live && s.owner === "Human" && <Button onClick={() => actions.returnToAI(s.id)}><Undo2 size={14} />Return to AI</Button>}
          {live && <Button variant="danger" onClick={() => setEndOpen(true)}><Octagon size={14} />End session</Button>}
        </>}
      />

      {/* metadata strip */}
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-line bg-surface p-4 shadow-card sm:grid-cols-4 xl:grid-cols-8">
        {[
          ["Duration", fmtDuration(s.durationSec + (live ? tick : 0))], ["AI handled", fmtDuration(s.aiDurationSec)], ["Human handled", fmtDuration(s.humanDurationSec)], ["Frames analysed", String(s.framesAnalysed)],
          ["Escalated", s.escalated ? "Yes" : "No"], ["Reason", s.escalationReason ?? "—"], ["Outcome", s.outcome], ["Demo cost", gbp(s.cost)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0"><p className="label">{k}</p><p className="num mt-0.5 truncate text-sm font-semibold" title={v}>{v}</p></div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel flush title={reviewing ? `Reviewing evidence frame ${frame!.id}` : "Customer camera"} subtitle={reviewing ? `${frame!.label} · captured at ${frame!.at}` : "Demo feed — procedural placeholder, no real video"}
            actions={reviewing ? <Button size="sm" onClick={() => setFrameId(null)}>Back to live view</Button> : <ConnectionIndicator q={s.connection} />}>
            <div className="grid gap-0 lg:grid-cols-[1fr_190px]">
              <CameraPanel scene={frame?.scene ?? s.scene} live={!reviewing && live} timer={fmtDuration(s.durationSec + (live ? tick : 0))} label={reviewing ? "FROZEN FRAME" : undefined} rounded={false} analysing={!reviewing && s.status === "analysing"} className="aspect-video lg:min-h-[340px]"
                caption={reviewing ? undefined : d.transcript.filter((t) => t.speaker !== "system").at(-1)?.text} />
              <div className="flex gap-2 overflow-x-auto border-t border-line p-2 lg:max-h-[420px] lg:flex-col lg:overflow-y-auto lg:border-l lg:border-t-0">
                <p className="label hidden px-1 pt-1 lg:block"><Layers size={11} className="mr-1 inline" />Selected frames ({d.frames.length})</p>
                {d.frames.map((f) => <div key={f.id} className="w-36 shrink-0 lg:w-auto"><FrameThumb frame={f} active={frameId === f.id} onClick={() => setFrameId(frameId === f.id ? null : f.id)} /></div>)}
              </div>
            </div>
            <div className="flex items-start gap-2 border-t border-line bg-subtle/60 px-4 py-2 text-2xs text-ink-soft">
              <Eye size={12} className="mt-px shrink-0" />Continuous video is <b>not</b> sent to the multimodal model. Only {s.framesAnalysed} selected frames were analysed (checkpoints, AI requests, scene changes).
            </div>
          </Panel>

          <Panel title="AI summary" subtitle="Structured handover package" actions={<Chip tone="brand">Generated by AI · reviewed by policy</Chip>}>
            <p className="text-[13px] leading-relaxed">{d.summary}</p>
            {d.uncertaintyFlags.length > 0 && (
              <div className="mt-3 rounded border border-warn/30 bg-warn-soft/60 p-3">
                <p className="label text-warn">Uncertainty flags</p>
                <ul className="mt-1 list-inside list-disc text-xs text-ink">{d.uncertaintyFlags.map((u) => <li key={u}>{u}</li>)}</ul>
              </div>
            )}
            <div className="mt-3 rounded border border-brand/30 bg-brand-soft/60 p-3">
              <p className="label text-brand-strong">Recommended next action</p>
              <p className="mt-0.5 text-[13px]">{d.recommendedNext}</p>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Visual observations" subtitle="Confidence marker = policy threshold 0.70" flush>
              <ObservationList items={d.observations} activeFrame={frameId ?? undefined} onSelectFrame={setFrameId} />
            </Panel>
            <Panel title="Transcript" subtitle="Voice conversation, live-style" bodyClassName="p-4">
              <Transcript lines={d.transcript} className="max-h-[420px]" />
            </Panel>
          </div>

          <Panel title="Business & tool actions" subtitle="Governed by approved workflow and human-required policy" flush>
            <ActionsTable actions={d.actions} />
          </Panel>
        </div>

        {/* right rail */}
        <div className="min-w-0 space-y-4">
          <Panel title="Current owner">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><OwnerChip owner={s.owner} name={s.humanAgent} /><span className="text-xs text-ink-soft">{s.owner === "AI" ? `${s.agentName} is handling this session` : `${s.humanAgent ?? "Adviser"} has taken over`}</span></div>
            </div>
            <OwnershipBar s={s} />
          </Panel>

          {s.escalated && (
            <Panel title="Escalation" className="border-warn/40">
              <KeyValue items={[
                { k: "Reason", v: <span className="font-medium text-warn">{s.escalationReason}</span> },
                { k: "Queue", v: "Broadband L1 · accepted in 4s" }, { k: "Human adviser", v: s.humanAgent ?? "Awaiting acceptance" },
                { k: "Handover package", v: `${d.frames.length} frames · ${d.observations.length} observations · ${d.actions.length} actions` },
              ]} cols={1} />
            </Panel>
          )}

          <Panel title="Workflow progress" subtitle={`${s.workflowName} ${s.workflowVersion}`} actions={<Link href={`/workflows/${s.workflowId}`} className="text-2xs font-medium text-brand-strong hover:underline">View workflow</Link>}>
            <WorkflowStepper steps={d.steps} />
          </Panel>

          <Panel title="Session metadata">
            <KeyValue cols={2} items={[
              { k: "Client", v: <Link className="text-brand-strong hover:underline" href={`/clients/${client.id}`}>{client.name}</Link> },
              { k: "AI agent", v: <Link className="text-brand-strong hover:underline" href={`/agents/${s.agentId}`}>{s.agentName}</Link> },
              { k: "Customer", v: s.customer }, { k: "Channel", v: s.channel },
              { k: "Model", v: s.modelVersion }, { k: "Policy", v: s.policyVersion },
              { k: "AI confidence", v: s.aiConfidence.toFixed(2) }, { k: "Retention", v: d.retention },
            ]} />
          </Panel>

          <Panel title="Cost breakdown" subtitle="Fictional demo data" actions={<Chip tone="warn">Demo</Chip>}>
            <CostBreakdown lines={d.cost} total={s.cost} />
          </Panel>

          {override && override.notes.length > 0 && (
            <Panel title="Notes">
              <ul className="space-y-2">{override.notes.map((n) => <li key={n.id} className="rounded bg-subtle p-2 text-xs"><p className="mb-0.5 text-2xs text-ink-mute">{n.category} · {n.author} · {n.at}</p>{n.text}</li>)}</ul>
            </Panel>
          )}
        </div>
      </div>

      <Panel className="mt-4" title="Audit timeline" subtitle="Every ownership change, tool action and policy decision is recorded">
        <AuditTimeline entries={d.audit} />
      </Panel>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add session note"
        footer={<><Button onClick={() => setNoteOpen(false)}>Cancel</Button><Button variant="primary" disabled={!note.trim()} onClick={() => { actions.addNote(s.id, note.trim(), cat); setNote(""); setNoteOpen(false); }}>Save note</Button></>}>
        <div className="space-y-3">
          <Field label="Category"><Select value={cat} onChange={setCat} options={["Observation", "Customer context", "Follow-up", "QA concern"].map((v) => ({ value: v, label: v }))} className="w-full" /></Field>
          <Field label="Note"><TextArea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to supervisors and included in the audit trail…" /></Field>
        </div>
      </Modal>
      <Modal open={endOpen} onClose={() => setEndOpen(false)} title={`End session ${s.id}?`}
        footer={<><Button onClick={() => setEndOpen(false)}>Keep open</Button><Button variant="danger" onClick={() => { actions.endSession(s.id, outcome); setEndOpen(false); }}>End session</Button></>}>
        <p className="mb-3 text-[13px] text-ink-soft">The customer will see the session-complete screen and the outcome is written to the audit log.</p>
        <Field label="Outcome"><Select value={outcome} onChange={setOutcome} options={["Resolved by human", "Resolved by AI", "Case created", "Unresolved — callback booked"].map((v) => ({ value: v, label: v }))} className="w-full" /></Field>
      </Modal>
    </>
  );
}
