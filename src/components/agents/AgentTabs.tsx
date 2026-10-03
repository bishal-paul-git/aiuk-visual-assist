"use client";
import Link from "next/link";
import { useState } from "react";
import { Bot, Info, Play, Send, Volume2 } from "lucide-react";
import { Button, Chip, Field, KeyValue, Modal, Panel, Select, Table, Td, TextArea, TextInput, Th, Toggle, Tr } from "@/components/ui/primitives";
import type { AiAgent } from "@/lib/data/agents";
import { workflowById } from "@/lib/data/workflows";
import { agentVersionHistory } from "@/lib/data/admin-extras";
import { FlashNote, useFlash } from "@/components/clients/shared";
import { RiskChip } from "./shared";
import { WorkflowStatusChip } from "@/components/workflows/shared";

export function IdentityTab({ agent }: { agent: AiAgent }) {
  const [name, setName] = useState(agent.name);
  const [title, setTitle] = useState(agent.title);
  const [persona, setPersona] = useState(agent.persona);
  const [msg, flash] = useFlash();
  return (
    <Panel title="Identity and persona" actions={<FlashNote msg={msg} />}>
      <div className="grid max-w-3xl gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Agent name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Role title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        </div>
        <Field label="Persona and behaviour guidance" hint="Injected as the agent's system guidance. Safety policies always take precedence over persona wording."><TextArea rows={4} value={persona} onChange={(e) => setPersona(e.target.value)} /></Field>
        <div><Button variant="primary" onClick={() => flash("Identity saved to draft (demo only)")}>Save draft</Button></div>
      </div>
    </Panel>
  );
}

export function GreetingTab({ agent }: { agent: AiAgent }) {
  const [text, setText] = useState(agent.greeting);
  const [preview, setPreview] = useState(false);
  const [msg, flash] = useFlash();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Greeting" subtitle="First thing the customer hears" actions={<FlashNote msg={msg} />}>
        <Field label="Greeting script" hint={`${text.length} characters · roughly ${Math.max(1, Math.round(text.split(/\s+/).length / 2.5))}s spoken. Must include AI disclosure.`}><TextArea rows={6} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="mt-3 flex gap-2"><Button onClick={() => setPreview(true)}><Play size={13} />Preview greeting</Button><Button variant="primary" onClick={() => flash("Greeting saved to draft (demo only)")}>Save draft</Button></div>
      </Panel>
      <Panel title="Customer-side preview">
        <div className="rounded-lg border border-line bg-subtle/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-ink-mute"><Bot size={14} />{agent.name} · {agent.title}</div>
          <div className="max-w-[90%] rounded-lg rounded-tl-none border border-line bg-surface px-3 py-2 text-[13px]">{text || <span className="text-ink-mute">No greeting set</span>}</div>
          <p className="mt-3 text-2xs text-ink-mute">Visual preview only. No audio is generated in this demo.</p>
        </div>
      </Panel>
      <Modal open={preview} onClose={() => setPreview(false)} title="Greeting preview" width="max-w-md" footer={<Button onClick={() => setPreview(false)}>Close</Button>}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand-strong"><Volume2 size={22} /></div>
          <div className="flex h-8 items-end gap-0.5" aria-hidden>{[6, 14, 9, 22, 16, 28, 12, 20, 8, 24, 10, 18, 7].map((h, i) => <span key={i} className="w-1 rounded-sm bg-brand" style={{ height: h }} />)}</div>
          <p className="text-[13px] text-ink-soft">&ldquo;{text}&rdquo;</p>
          <Chip tone="neutral">{agent.voice} · {agent.voiceProvider}</Chip>
        </div>
      </Modal>
    </div>
  );
}

export function VoiceTab({ agent }: { agent: AiAgent }) {
  const voices = Array.from(new Set([agent.voice, "Charlotte (en-GB)", "Matilda (en-GB)", "Alice (en-GB)", "Daniel (en-GB)"]));
  const [voice, setVoice] = useState(agent.voice);
  const [speed, setSpeed] = useState(1.0);
  const [stability, setStability] = useState(0.6);
  const [barge, setBarge] = useState(true);
  const [msg, flash] = useFlash();
  return (
    <Panel title="Voice" subtitle="Provider: demo text-to-speech" actions={<><Chip tone="warn">{agent.voiceProvider}</Chip><FlashNote msg={msg} /></>}>
      <div className="grid max-w-2xl gap-4">
        <Field label="Voice"><Select className="w-full" value={voice} onChange={setVoice} options={voices.map((v) => ({ value: v, label: v }))} /></Field>
        <Slider label="Speaking speed" value={speed} min={0.7} max={1.3} step={0.05} onChange={setSpeed} fmt={(v) => `${v.toFixed(2)}x`} />
        <Slider label="Stability" value={stability} min={0} max={1} step={0.05} onChange={setStability} fmt={(v) => v.toFixed(2)} hint="Higher values give a more consistent delivery; lower values sound more expressive." />
        <div className="flex items-center justify-between rounded border border-line px-3 py-2"><span className="text-[13px]">Allow customer to interrupt (barge-in)</span><Toggle on={barge} onChange={setBarge} label="Allow barge-in" /></div>
        <div className="flex gap-2"><Button onClick={() => flash("Playing sample (visual only)")}><Play size={13} />Play sample</Button><Button variant="primary" onClick={() => flash("Voice settings saved to draft (demo only)")}>Save draft</Button></div>
      </div>
    </Panel>
  );
}
function Slider({ label, value, min, max, step, onChange, fmt, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; hint?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><label className="font-medium text-ink-soft">{label}</label><span className="num font-semibold">{fmt(value)}</span></div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand" />
      {hint && <p className="mt-0.5 text-2xs text-ink-mute">{hint}</p>}
    </div>
  );
}

export function ModelTab({ agent }: { agent: AiAgent }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Model configuration">
        <KeyValue cols={2} items={[
          { k: "Model", v: agent.model }, { k: "Temperature", v: <span className="num">0.2 <span className="text-ink-mute">(fixed by platform policy)</span></span> },
          { k: "Max tokens per turn", v: "512" }, { k: "Frame input", v: "Selected frames only" },
          { k: "Structured output", v: "Observation schema v3" }, { k: "Inference region", v: "UK South (demo)" },
        ]} />
      </Panel>
      <Panel title="Frame budget">
        <div className="flex gap-2.5 rounded border border-info/30 bg-info-soft px-3 py-2.5 text-[13px] text-info">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>The model never receives the full video stream. Only frames selected by workflow checkpoints, customer language, scene change or human request are analysed, up to the session frame budget.</p>
        </div>
        <KeyValue cols={2} items={[{ k: "Frame budget per session", v: "24 frames" }, { k: "Min. gap between frames", v: "2 s" }, { k: "Quality gate", v: "≥ 0.45 sharpness" }, { k: "Periodic sample", v: "1 per 20 s" }]} />
      </Panel>
    </div>
  );
}

export function LanguagesTab({ agent }: { agent: AiAgent }) {
  const all = ["English (UK)", "Welsh", "Polish", "Urdu", "Punjabi", "French"];
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(all.map((l) => [l, agent.languages.includes(l)])));
  return (
    <Panel flush title="Languages" subtitle={`Primary: ${agent.language}`}>
      <Table>
        <thead><tr><Th>Language</Th><Th>Role</Th><Th>Quality</Th><Th>Enabled</Th></tr></thead>
        <tbody>{all.map((l) => (
          <Tr key={l}><Td className="font-medium">{l}</Td><Td>{l === agent.language ? <Chip tone="brand">Primary</Chip> : <span className="text-ink-mute">Secondary</span>}</Td><Td className="text-ink-soft">{["English (UK)", "Welsh"].includes(l) ? "Validated" : "Pilot (limited)"}</Td><Td><Toggle on={on[l]} onChange={(v) => setOn((s) => ({ ...s, [l]: v }))} label={`Enable ${l}`} /></Td></Tr>
        ))}</tbody>
      </Table>
    </Panel>
  );
}

export function KnowledgeTab({ agent }: { agent: AiAgent }) {
  const [items, setItems] = useState(agent.knowledge);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("SOP");
  return (
    <Panel flush title={`${items.length} knowledge sources`} subtitle="Approved sources only. The agent cannot answer from unapproved material." actions={<Button size="sm" onClick={() => setOpen(true)}>Add source</Button>}>
      <Table>
        <thead><tr><Th>Source</Th><Th>Type</Th><Th>Updated</Th><Th>Status</Th></tr></thead>
        <tbody>{items.map((k) => <Tr key={k.name}><Td className="font-medium">{k.name}</Td><Td><Chip>{k.type}</Chip></Td><Td className="text-ink-soft">{k.updated}</Td><Td><Chip tone={k.updated === "Just now" ? "warn" : "ok"} dot>{k.updated === "Just now" ? "Indexing" : "Indexed"}</Chip></Td></Tr>)}</tbody>
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="Add knowledge source" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => { setItems((i) => [...i, { name: name.trim(), type, updated: "Just now" }]); setName(""); setOpen(false); }}>Add source</Button></>}>
        <div className="space-y-3">
          <Field label="Source name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hub 6 Installation Guide" autoFocus /></Field>
          <Field label="Type"><Select className="w-full" value={type} onChange={setType} options={["SOP", "Policy", "Product manual", "Reference", "Scripts"].map((t) => ({ value: t, label: t }))} /></Field>
          <div className="rounded border border-dashed border-line px-3 py-6 text-center text-xs text-ink-mute">File upload is simulated. No document is stored.</div>
        </div>
      </Modal>
    </Panel>
  );
}

export function ToolsTab({ agent }: { agent: AiAgent }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(Object.fromEntries(agent.tools.map((t) => [t.name, true])));
  return (
    <Panel flush title="Tools" subtitle="Actions this agent may request from connected systems">
      <div className="flex items-start gap-2 border-b border-line bg-warn-soft px-4 py-2 text-xs text-warn"><Info size={14} className="mt-px shrink-0" />High-risk tools require human confirmation. The agent can recommend them but cannot execute them, even when enabled.</div>
      <Table>
        <thead><tr><Th>Tool</Th><Th>Scope</Th><Th>Risk</Th><Th>Execution</Th><Th>Enabled</Th></tr></thead>
        <tbody>{agent.tools.map((t) => (
          <Tr key={t.name}>
            <Td className="font-mono text-xs font-medium">{t.name}</Td><Td className="text-ink-soft">{t.scope}</Td><Td><RiskChip risk={t.risk} /></Td>
            <Td className="text-xs text-ink-soft">{t.risk === "high" ? "Human confirmation required" : t.risk === "medium" ? "Customer consent + audit log" : "Automatic"}</Td>
            <Td><Toggle on={enabled[t.name]} onChange={(v) => setEnabled((s) => ({ ...s, [t.name]: v }))} label={`Enable ${t.name}`} /></Td>
          </Tr>
        ))}</tbody>
      </Table>
    </Panel>
  );
}

export function WorkflowsTab({ agent }: { agent: AiAgent }) {
  return (
    <Panel flush title="Assigned workflows">
      <Table>
        <thead><tr><Th>Workflow</Th><Th>Version</Th><Th>Status</Th><Th>Objective</Th></tr></thead>
        <tbody>{agent.workflowIds.map((id) => { const w = workflowById(id); return w ? (
          <Tr key={id}><Td><Link href={`/workflows/${w.id}`} className="font-medium hover:text-brand-strong hover:underline">{w.name}</Link></Td><Td className="font-mono text-xs">{w.version}</Td><Td><WorkflowStatusChip status={w.status} /></Td><Td className="max-w-md text-ink-soft">{w.objective}</Td></Tr>
        ) : null; })}</tbody>
      </Table>
    </Panel>
  );
}

export function EscalationTab({ agent }: { agent: AiAgent }) {
  return (
    <Panel title="Escalation rules" subtitle="When the agent must hand over to a human adviser">
      <ol className="space-y-2">{agent.escalationRules.map((r, i) => (
        <li key={i} className="flex gap-3 rounded border border-line px-3 py-2 text-[13px]"><span className="num mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded bg-human-soft text-2xs font-semibold text-human">{i + 1}</span>{r}</li>
      ))}</ol>
    </Panel>
  );
}

export function VersionsTab({ agent }: { agent: AiAgent }) {
  const rows = agentVersionHistory[agent.id] ?? [];
  return (
    <Panel flush title="Version history">
      <Table>
        <thead><tr><Th>Version</Th><Th>Date</Th><Th>Author</Th><Th>Change</Th><Th>State</Th></tr></thead>
        <tbody>{rows.map((v, i) => <Tr key={v.v}><Td className="font-mono text-xs font-medium">{v.v}</Td><Td className="text-ink-soft">{v.date}</Td><Td>{v.author}</Td><Td>{v.note}</Td><Td>{i === 0 ? <Chip tone={agent.status === "active" ? "ok" : "neutral"} dot>{agent.status === "active" ? "Live" : "Draft"}</Chip> : <Chip>Archived</Chip>}</Td></Tr>)}</tbody>
      </Table>
    </Panel>
  );
}

const canned: [RegExp, string][] = [
  [/gas|smoke|carbon|co alarm/i, "Please step away from the appliance and do not use any switches. I am connecting you with a safety adviser right now."],
  [/human|person|adviser|agent/i, "Of course. I'm transferring you to a colleague now and I'll share what we've covered so far."],
  [/cover|liab|claim|compensat/i, "I'm not able to advise on cover or liability. I can arrange for an adviser to help with that."],
  [/light|led|display|screen|code/i, "I can see the indicator area, but it's a little blurry. Could you move about 20 cm closer and hold steady for a moment?"],
];
export function TestTab({ agent }: { agent: AiAgent }) {
  const [log, setLog] = useState<{ who: "you" | "ai"; text: string }[]>([{ who: "ai", text: agent.greeting }]);
  const [input, setInput] = useState("");
  const send = () => {
    if (!input.trim()) return;
    const reply = canned.find(([re]) => re.test(input))?.[1] ?? "Thanks. Could you show me that on camera so I can confirm what I'm seeing?";
    setLog((l) => [...l, { who: "you", text: input.trim() }, { who: "ai", text: reply }]);
    setInput("");
  };
  return (
    <Panel title="Test conversation" subtitle="Canned replies only. No AI model is called." actions={<Button size="sm" variant="ghost" onClick={() => setLog([{ who: "ai", text: agent.greeting }])}>Reset</Button>}>
      <div className="mb-3 max-h-80 space-y-2 overflow-y-auto rounded border border-line bg-subtle/40 p-3" aria-live="polite">
        {log.map((m, i) => <div key={i} className={m.who === "you" ? "flex justify-end" : "flex"}><div className={`max-w-[80%] rounded px-3 py-1.5 text-[13px] ${m.who === "you" ? "bg-brand text-white" : "border border-line bg-surface"}`}>{m.text}</div></div>)}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <TextInput value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type as the customer, e.g. 'I can smell gas'" aria-label="Customer message" />
        <Button variant="primary" type="submit"><Send size={13} />Send</Button>
      </form>
    </Panel>
  );
}
