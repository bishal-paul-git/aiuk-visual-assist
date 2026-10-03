"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Bot, Camera, CheckCircle2, ChevronRight, CircleDot, Eye, Flag, LogIn, NotebookPen, PhoneOff, Undo2, UserCheck, UserRound } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Button, Chip, ConfidenceBar, KeyValue, Modal, Panel, Select, TextArea } from "@/components/ui/primitives";
import { ConnectionIndicator, ObservationChip, OwnerChip, StatusChip } from "@/components/ui/domain";
import { CameraPanel } from "@/components/visual/CameraPanel";
import { FrameThumb } from "@/components/visual/FrameThumb";
import { useSession } from "@/lib/services/sessions";
import { useTicker } from "@/lib/hooks/useTicker";
import { clientById } from "@/lib/data/clients";
import type { Frame, Owner, SessionStatus, StepState } from "@/lib/types";

const SESSION_ID = "VA-27413";
const START_SEC = 288; // session is picked up at the point of escalation (04:48)
const ADVISER = "Priya Nair";
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

interface ActivityEntry { id: number; at: string; text: string; tone: "neutral" | "ok" | "warn" | "human" | "bad" }
interface Note { id: number; at: string; category: string; text: string }

const NOTE_CATEGORIES = ["Observation", "Customer context", "Follow-up required", "Policy or safety", "Handover"].map((c) => ({ value: c, label: c }));
const OUTCOMES = ["Resolved by human", "Resolved with AI assistance", "Engineer visit booked", "Escalated to specialist", "Customer disconnected"].map((c) => ({ value: c, label: c }));

const stepIcon: Record<StepState, { icon: typeof CheckCircle2; cls: string }> = {
  done: { icon: CheckCircle2, cls: "text-ok" }, current: { icon: CircleDot, cls: "text-brand" }, pending: { icon: CircleDot, cls: "text-ink-mute/50" },
  skipped: { icon: CircleDot, cls: "text-ink-mute" }, escalated: { icon: Flag, cls: "text-warn" },
};

export function LiveConsole() {
  const { session, detail } = useSession(SESSION_ID);
  const client = clientById("clearwave");

  // Local operator state — deliberately NOT written to the global store (VA-27413 is a resolved record).
  const [status, setStatus] = useState<SessionStatus>("escalating");
  const [owner, setOwner] = useState<Owner>("AI");
  const [joined, setJoined] = useState(false);
  const [ended, setEnded] = useState<{ at: number; outcome: string } | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [captured, setCaptured] = useState<Frame[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteCat, setNoteCat] = useState(NOTE_CATEGORIES[0].value);
  const [noteText, setNoteText] = useState("");
  const [endOpen, setEndOpen] = useState(false);
  const [outcome, setOutcome] = useState(OUTCOMES[0].value);
  const [seq, setSeq] = useState(1);

  const tick = useTicker(!ended);
  const elapsed = ended ? ended.at : START_SEC + tick;
  const now = mmss(elapsed);

  if (!session || !detail) return <div className="p-8 text-sm text-ink-soft">Session not found.</div>;

  const log = (text: string, tone: ActivityEntry["tone"] = "neutral") => {
    setActivity((a) => [{ id: seq, at: now, text, tone }, ...a]);
    setSeq((n) => n + 1);
  };

  // ---- derived content (pre-resolution view of the primary session) ----
  const cutoff = "04:48";
  const frames: Frame[] = [...detail.frames.filter((f) => f.at <= cutoff), ...captured];
  const observations = detail.observations.filter((o) => o.at <= cutoff);
  const transcript = detail.transcript.filter((t) => t.at <= cutoff);
  const steps = detail.steps.map((s) => (s.key === "human" ? { ...s, state: (ended ? "done" : joined ? "current" : "pending") as StepState, note: ended ? "Closed by adviser" : joined ? "Adviser in session" : "Awaiting adviser", at: undefined } : s));
  const reviewing = frames.find((f) => f.id === reviewId);
  const liveScene = "router_blur" as const;

  // ---- actions ----
  const join = () => { setJoined(true); setStatus("human_joined"); log(`${ADVISER} joined as observer. AI copilot remains active.`, "human"); };
  const takeOver = () => { setOwner("Human"); log(`${ADVISER} took over from AI. AI is now in copilot mode.`, "human"); };
  const returnToAI = () => { setOwner("AI"); log("Ownership returned to AI. Adviser remains observing.", "neutral"); };
  const capture = () => {
    const n = 13 + captured.length;
    const f: Frame = { id: `F-${n}`, scene: reviewing ? reviewing.scene : liveScene, label: "Human-captured frame", trigger: "human_request", at: now, quality: 0.9, selectedForModel: false };
    setCaptured((c) => [...c, f]);
    setFlash(true); setTimeout(() => setFlash(false), 220);
    log(`Frame ${f.id} captured by adviser.`, "human");
  };
  const saveNote = () => {
    if (!noteText.trim()) return;
    setNotes((n) => [{ id: seq, at: now, category: noteCat, text: noteText.trim() }, ...n]);
    log(`Note added (${noteCat}).`, "neutral");
    setNoteText(""); setNoteOpen(false);
  };
  const endSession = () => {
    setEnded({ at: elapsed, outcome }); setStatus("resolved"); setEndOpen(false);
    log(`Session ended by ${ADVISER}. Outcome: ${outcome}.`, "ok");
  };

  const canJoin = !joined && !ended;
  const canTake = joined && owner === "AI" && !ended;
  const canReturn = owner === "Human" && !ended;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2">
        <Link href="/live" className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink"><ArrowLeft size={14} />Back to admin</Link>
        <span className="hidden h-5 w-px bg-line sm:block" />
        <h1 className="text-sm font-semibold">Visual Assist <span className="font-normal text-ink-mute">/</span> Live Session</h1>
        <Chip tone="neutral" className="font-mono">{session.id}</Chip>
        <StatusChip status={status} />
        <OwnerChip owner={owner} name={ADVISER} />
        {joined && <Chip tone="human"><UserCheck size={11} />Human joined</Chip>}
        <div className="ml-auto flex items-center gap-4">
          <ConnectionIndicator q={session.connection} />
          <span className="num flex items-center gap-1.5 text-sm font-semibold" aria-label="Session timer">
            {!ended && <span className="h-1.5 w-1.5 rounded-full bg-bad anim-blink" />}{now}
          </span>
        </div>
      </header>

      {ended && (
        <div role="status" className="flex items-center gap-2 border-b border-ok/30 bg-ok-soft px-4 py-2 text-[13px] text-ok">
          <CheckCircle2 size={15} />Session ended at {mmss(ended.at)}. Outcome: <strong>{ended.outcome}</strong>. Controls are disabled. (Local demo state; no records were changed.)
        </div>
      )}

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-5">
        {/* LEFT: video + transcript */}
        <div className="space-y-4 lg:col-span-3">
          <div>
            <div className="relative">
              <CameraPanel
                scene={reviewing ? reviewing.scene : liveScene} live={!reviewing && !ended} timer={reviewing ? undefined : now}
                label={reviewing ? `Reviewing frame ${reviewing.id}` : "Customer rear camera"}
                className="aspect-video w-full" analysing={false}
              >
                {flash && <div className="absolute inset-0 bg-white/80 anim-fade-in" aria-hidden />}
                {reviewing && (
                  <button onClick={() => setReviewId(null)} className="absolute right-3 top-3 flex h-8 items-center gap-1 rounded bg-brand px-2.5 text-xs font-semibold text-white hover:bg-brand-strong">
                    <Eye size={13} />Back to live
                  </button>
                )}
              </CameraPanel>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
              <span>{reviewing ? `Reviewing frame ${reviewing.id}: ${reviewing.label} (${reviewing.at})` : "Live customer view with AI detection overlays"}</span>
              <Button size="sm" onClick={capture} disabled={!!ended}><Camera size={13} />Capture frame</Button>
            </div>
          </div>

          <Panel title="Transcript" subtitle={`${transcript.length} lines up to escalation`} bodyClassName="max-h-72 overflow-y-auto" flush>
            <ul className="divide-y divide-line/70">
              {transcript.map((t) => (
                <li key={t.id} className="flex gap-3 px-4 py-2 text-[13px]">
                  <span className="num w-10 shrink-0 text-xs text-ink-mute">{t.at}</span>
                  <span className={cn("w-16 shrink-0 text-xs font-semibold capitalize", t.speaker === "ai" ? "text-brand" : t.speaker === "human" ? "text-human" : t.speaker === "system" ? "text-ink-mute" : "text-ink")}>{t.speaker === "ai" ? "Ava (AI)" : t.speaker}</span>
                  <span className={cn(t.speaker === "system" && "italic text-ink-mute")}>{t.text}</span>
                </li>
              ))}
              {joined && <li className="flex gap-3 px-4 py-2 text-[13px]"><span className="num w-10 shrink-0 text-xs text-ink-mute">{now.slice(0, 5)}</span><span className="w-16 shrink-0 text-xs font-semibold text-ink-mute">System</span><span className="italic text-ink-mute">{ADVISER} joined the session as observer.</span></li>}
            </ul>
          </Panel>

          <Panel title="Selected frames" subtitle="Select a frame to review it in the main view" actions={<Chip>{frames.length}</Chip>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {frames.map((f) => <FrameThumb key={f.id} frame={f} active={reviewId === f.id} onClick={() => setReviewId(reviewId === f.id ? null : f.id)} />)}
            </div>
          </Panel>
        </div>

        {/* RIGHT: panels */}
        <div className="space-y-4 lg:col-span-2">
          <div role="alert" className="flex gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <p className="text-[13px] font-semibold text-warn">Escalation reason: {session.escalationReason}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Internet LED confidence 0.61 stayed below the 0.70 policy threshold after two attempts.</p>
            </div>
          </div>

          <Panel title="Customer and session">
            <KeyValue cols={2} items={[
              { k: "Customer", v: session.customer }, { k: "Client", v: client?.name },
              { k: "Workflow", v: `${session.workflowName} ${session.workflowVersion}` }, { k: "Channel", v: session.channel },
              { k: "Case", v: <span className="font-mono">CW-558210</span> }, { k: "AI agent", v: session.agentName },
            ]} />
          </Panel>

          <Panel title="AI summary" subtitle="Generated at escalation">
            <p className="text-[13px] leading-relaxed text-ink-soft">{detail.summary.split(". A remote line reset")[0]}.</p>
            <div className="mt-3 rounded border border-line bg-subtle px-3 py-2">
              <p className="label">Human handover package</p>
              <p className="mt-1 text-xs text-ink-soft">{frames.filter((f) => f.selectedForModel).length} frames, {observations.length} observations, transcript and tool actions attached. Customer need not repeat earlier steps.</p>
            </div>
          </Panel>

          <Panel title="Recommended next action">
            <p className="flex gap-2 text-[13px]"><ChevronRight size={15} className="mt-0.5 shrink-0 text-brand" />Ask the customer to show the grey inline DSL filter and confirm it is fully seated; then check the Internet LED.</p>
          </Panel>

          <Panel title="Uncertainty flags" actions={<Chip tone="warn">{detail.uncertaintyFlags.length}</Chip>}>
            <ul className="space-y-1.5">
              {detail.uncertaintyFlags.map((u) => <li key={u} className="flex gap-2 text-[13px]"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />{u}</li>)}
            </ul>
          </Panel>

          <Panel title="Visual observations" actions={<Chip>{observations.length}</Chip>} flush>
            <ul className="divide-y divide-line/70">
              {observations.map((o) => (
                <li key={o.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2"><p className="text-[13px]">{o.text}</p><ObservationChip status={o.status} /></div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <ConfidenceBar value={o.confidence} />
                    <button onClick={() => setReviewId(o.frameId)} className="text-2xs font-medium text-brand hover:underline">{o.frameId} · {o.at}</button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Workflow progress" flush>
            <ol className="divide-y divide-line/70">
              {steps.map((s) => {
                const I = stepIcon[s.state].icon;
                return (
                  <li key={s.key} className="flex items-start gap-2.5 px-4 py-2">
                    <I size={14} className={cn("mt-0.5 shrink-0", stepIcon[s.state].cls)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[13px]", s.state === "pending" && "text-ink-mute", s.state === "current" && "font-semibold")}>{s.label}</p>
                      {s.note && <p className="text-2xs text-ink-mute">{s.note}</p>}
                    </div>
                    {s.state === "escalated" && <Chip tone="warn">Escalated</Chip>}
                    {s.state === "current" && <Chip tone="brand">Current</Chip>}
                    {s.at && <span className="num text-2xs text-ink-mute">{s.at}</span>}
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel title="Notes" actions={<Chip>{notes.length}</Chip>}>
            {notes.length === 0 ? <p className="text-xs text-ink-mute">No notes yet. Use Add Note to record context for this session.</p> : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded border border-line px-3 py-2">
                    <div className="flex items-center justify-between"><Chip tone="info">{n.category}</Chip><span className="num text-2xs text-ink-mute">{n.at}</span></div>
                    <p className="mt-1 text-[13px]">{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Activity" subtitle="Local to this console" actions={<Chip>{activity.length + 1}</Chip>} flush>
            <ul className="max-h-64 divide-y divide-line/70 overflow-y-auto">
              {activity.map((a) => (
                <li key={a.id} className="anim-fade-in flex gap-3 px-4 py-2 text-[13px]">
                  <span className="num w-10 shrink-0 text-xs text-ink-mute">{a.at}</span>
                  <span className={cn(a.tone === "human" && "text-human", a.tone === "ok" && "text-ok", a.tone === "warn" && "text-warn")}>{a.text}</span>
                </li>
              ))}
              <li className="flex gap-3 px-4 py-2 text-[13px]"><span className="num w-10 shrink-0 text-xs text-ink-mute">{cutoff}</span><span>AI escalated to human. Reason: {session.escalationReason}.</span></li>
            </ul>
          </Panel>
        </div>
      </main>

      {/* Control bar */}
      <div className="sticky bottom-0 z-20 border-t border-line bg-surface px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={join} disabled={!canJoin}><LogIn size={14} />Join Session</Button>
          <Button variant="human" onClick={takeOver} disabled={!canTake}><UserRound size={14} />Take Over</Button>
          <Button onClick={returnToAI} disabled={!canReturn}><Undo2 size={14} />Return to AI</Button>
          <Button onClick={() => setNoteOpen(true)} disabled={!!ended}><NotebookPen size={14} />Add Note</Button>
          <span className="hidden items-center gap-1.5 text-xs text-ink-soft md:flex">
            {joined && owner === "AI" && <><Bot size={13} className="text-brand" />AI copilot active. Adviser observing.</>}
            {owner === "Human" && !ended && <><Bot size={13} className="text-brand" />AI copilot suggesting in the background.</>}
            {!joined && !ended && "Join to observe before taking over."}
          </span>
          <Button variant="danger" className="ml-auto" onClick={() => setEndOpen(true)} disabled={!!ended}><PhoneOff size={14} />End Session</Button>
        </div>
      </div>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add note" width="max-w-md"
        footer={<><Button onClick={() => setNoteOpen(false)}>Cancel</Button><Button variant="primary" onClick={saveNote} disabled={!noteText.trim()}>Save note</Button></>}>
        <div className="space-y-3">
          <div><label className="mb-1 block text-xs font-medium text-ink-soft">Category</label><Select label="Note category" value={noteCat} onChange={setNoteCat} options={NOTE_CATEGORIES} className="w-full" /></div>
          <div><label htmlFor="note-text" className="mb-1 block text-xs font-medium text-ink-soft">Note</label><TextArea id="note-text" rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Visible to colleagues and attached to the case." /></div>
        </div>
      </Modal>

      <Modal open={endOpen} onClose={() => setEndOpen(false)} title="End session" width="max-w-md"
        footer={<><Button onClick={() => setEndOpen(false)}>Cancel</Button><Button variant="danger" onClick={endSession}>End session</Button></>}>
        <p className="mb-3 text-[13px] text-ink-soft">This ends the live session for the customer and marks it Resolved. Select the outcome to record.</p>
        <label className="mb-1 block text-xs font-medium text-ink-soft">Outcome</label>
        <Select label="Session outcome" value={outcome} onChange={setOutcome} options={OUTCOMES} className="w-full" />
      </Modal>
    </div>
  );
}
