"use client";
import { useState } from "react";
import { AlertTriangle, Check, HelpCircle, X } from "lucide-react";
import { Button, Chip, ConfidenceBar, Drawer, KeyValue, Panel, TextArea } from "@/components/ui/primitives";
import { ObservationChip, OwnerChip, StatusChip } from "@/components/ui/domain";
import { FrameThumb } from "@/components/visual/FrameThumb";
import { cn } from "@/components/ui/cn";
import { actions, useAppState, type QaState } from "@/lib/store";
import { getSessionDetail } from "@/lib/data/session-details";
import { clientById } from "@/lib/data/clients";
import { flagLabel, qaMetricsFor, qaStateMeta } from "@/lib/data/qa";
import { fmtDuration, gbp } from "@/lib/data/sessions";
import type { Session } from "@/lib/types";
import type { ObsVerdict } from "@/lib/types/qa";

export interface ReviewDraft { verdicts: Record<string, ObsVerdict>; ratings: { accuracy: number; compliance: number; escalation: number } }

const verdictOpts: { id: ObsVerdict; label: string; icon: typeof Check; on: string }[] = [
  { id: "correct", label: "Correct", icon: Check, on: "bg-ok text-white border-ok" },
  { id: "incorrect", label: "Incorrect", icon: X, on: "bg-bad text-white border-bad" },
  { id: "unsure", label: "Unsure", icon: HelpCircle, on: "bg-warn text-white border-warn" },
];

function Rating({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-soft">{label}</p>
      <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded border border-line">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={value === n} onClick={() => onChange(n)}
            className={cn("h-7 w-8 border-r border-line text-xs font-medium last:border-r-0", value === n ? "bg-brand text-white" : "bg-surface text-ink-soft hover:bg-subtle")}>{n}</button>
        ))}
      </div>
    </div>
  );
}

export function ReviewDrawer({ session, draft, setDraft, state, onClose }: { session: Session; draft: ReviewDraft; setDraft: (d: ReviewDraft) => void; state: QaState; onClose: () => void }) {
  const notes = useAppState((s) => s.qaNotes[session.id]) ?? [];
  const [note, setNote] = useState("");
  const detail = getSessionDetail(session.id);
  const m = qaMetricsFor(session);
  const flagged = new Set(m.flags.map((f) => f.observationId));
  const client = clientById(session.clientId);
  const selected = detail?.frames.filter((f) => f.selectedForModel) ?? [];
  const reviewed = Object.keys(draft.verdicts).length;

  const set = (id: QaState) => actions.setQa(session.id, id);
  const addNote = () => { if (note.trim()) { actions.addQaNote(session.id, note.trim()); setNote(""); } };

  return (
    <Drawer
      open onClose={onClose} width="max-w-4xl"
      title={<span className="flex items-center gap-2">QA review · {session.id}<Chip tone={qaStateMeta[state].tone} dot>{qaStateMeta[state].label}</Chip></span>}
      subtitle={`${client?.name} · ${session.workflowName} ${session.workflowVersion} · ${session.startedAt}`}
      footer={<>
        <Button onClick={() => set("in_review")} disabled={state === "in_review"}>Start review</Button>
        <Button onClick={() => set("needs_coaching")}>Needs coaching</Button>
        <Button variant="danger" onClick={() => set("rejected")}>Reject</Button>
        <Button variant="primary" onClick={() => set("approved")}>Approve</Button>
      </>}
    >
      {!detail ? <p className="text-sm text-ink-mute">No detail available.</p> : (
        <div className="space-y-5">
          <Panel title="Session summary" bodyClassName="space-y-3">
            <p className="text-[13px] text-ink-soft">{detail.summary}</p>
            <KeyValue cols={3} items={[
              { k: "Status", v: <StatusChip status={session.status} /> }, { k: "Owner", v: <OwnerChip owner={session.owner} name={session.humanAgent} /> },
              { k: "Outcome", v: session.outcome }, { k: "Duration", v: fmtDuration(session.durationSec) }, { k: "Frames analysed", v: session.framesAnalysed },
              { k: "AI confidence", v: <ConfidenceBar value={session.aiConfidence} /> }, { k: "Escalation", v: session.escalationReason ?? "None" }, { k: "Cost (fictional)", v: gbp(session.cost) },
              { k: "Model / policy", v: `${session.modelVersion} · ${session.policyVersion}` },
            ]} />
          </Panel>

          <Panel title="Selected frames" subtitle="Frames sent to the model for analysis">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{selected.map((f) => <FrameThumb key={f.id} frame={f} />)}</div>
          </Panel>

          <Panel title="Visual observations" subtitle={`${reviewed} of ${detail.observations.length} judged · flagged items highlighted`} flush>
            <ul className="divide-y divide-line">
              {detail.observations.map((o) => {
                const fl = m.flags.find((f) => f.observationId === o.id);
                const v = draft.verdicts[o.id];
                return (
                  <li key={o.id} className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-2.5", flagged.has(o.id) && "border-l-2 border-warn bg-warn-soft/50")}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink">{o.text}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <ObservationChip status={o.status} /><ConfidenceBar value={o.confidence} />
                        <span className="text-2xs text-ink-mute">{o.frameId} · {o.at}</span>
                        {fl && <Chip tone="warn"><AlertTriangle size={11} />{flagLabel[fl.kind]}</Chip>}
                      </div>
                    </div>
                    <div className="flex gap-1" role="group" aria-label={`Verdict for ${o.text}`}>
                      {verdictOpts.map((b) => (
                        <button key={b.id} aria-pressed={v === b.id} onClick={() => setDraft({ ...draft, verdicts: { ...draft.verdicts, [o.id]: b.id } })}
                          className={cn("inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-medium", v === b.id ? b.on : "border-line bg-surface text-ink-soft hover:bg-subtle")}>
                          <b.icon size={12} />{b.label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Reviewer ratings" subtitle="1 = poor, 5 = excellent. Derived scores shown for reference.">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Rating label="Visual interpretation accuracy" value={draft.ratings.accuracy} onChange={(n) => setDraft({ ...draft, ratings: { ...draft.ratings, accuracy: n } })} /><p className="mt-1 text-2xs text-ink-mute">Derived {m.accuracy}%</p></div>
              <div><Rating label="Workflow compliance" value={draft.ratings.compliance} onChange={(n) => setDraft({ ...draft, ratings: { ...draft.ratings, compliance: n } })} /><p className="mt-1 text-2xs text-ink-mute">Derived {m.compliance}%</p></div>
              <div><Rating label="Escalation correctness" value={draft.ratings.escalation} onChange={(n) => setDraft({ ...draft, ratings: { ...draft.ratings, escalation: n } })} /><p className="mt-1 text-2xs text-ink-mute">Derived {m.escalation}%</p></div>
            </div>
          </Panel>

          <Panel title="Reviewer notes" subtitle={`${notes.length} note${notes.length === 1 ? "" : "s"}`}>
            <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for coaching, model feedback or audit…" aria-label="Reviewer note" />
            <div className="mt-2 flex justify-end"><Button size="sm" onClick={addNote} disabled={!note.trim()}>Add note</Button></div>
            {notes.length > 0 && <ul className="mt-3 space-y-2">{[...notes].reverse().map((n, i) => <li key={i} className="rounded border border-line bg-subtle px-3 py-2 text-[13px]">{n}</li>)}</ul>}
          </Panel>
        </div>
      )}
    </Drawer>
  );
}
