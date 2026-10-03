"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Chip, ConfidenceBar, Field, KeyValue, Panel, Select, Table, Td, TextInput, Th, Toggle, Tr, type Tone } from "@/components/ui/primitives";
import { Kpi } from "@/components/ui/Kpi";
import { ChartBox, axisProps, chartColors, tooltipStyle } from "@/components/ui/charts";
import { OwnerChip, StatusChip } from "@/components/ui/domain";
import { agents } from "@/lib/data/agents";
import { workflows } from "@/lib/data/workflows";
import { policies } from "@/lib/data/policies";
import { dailySeries } from "@/lib/data/metrics";
import { clientIntegrations, clientUsers, dataResidencyOptions } from "@/lib/data/admin-extras";
import { fmtDuration, gbp, num } from "@/lib/format";
import { useSessions } from "@/lib/services/sessions";
import type { Client } from "@/lib/types";
import { FlashNote, retentionLabel, useFlash } from "./shared";
import { BrandPreview } from "./BrandPreview";
import { AgentStatusChip } from "@/components/agents/shared";
import { WorkflowStatusChip } from "@/components/workflows/shared";
import { PolicyStatusChip } from "@/components/policies/shared";

export function OverviewTab({ client }: { client: Client }) {
  const series = useMemo(() => dailySeries(client.id), [client.id]);
  const all = useSessions({ respectClientFilter: false });
  const recent = useMemo(() => all.filter((s) => s.clientId === client.id).slice(0, 8), [all, client.id]);
  const tot = series.reduce((a, p) => a + p.sessions, 0);
  const avg = (f: (p: (typeof series)[number]) => number) => series.reduce((a, p) => a + f(p), 0) / series.length;
  const spark = (f: (p: (typeof series)[number]) => number) => series.map(f);
  const half = (f: (p: (typeof series)[number]) => number) => { const a = avg(f); const l = series.slice(-7).reduce((x, p) => x + f(p), 0) / 7; return ((l - a) / a) * 100; };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sessions (30d)" value={num(tot)} delta={half((p) => p.sessions)} hint="last 7d vs avg" spark={spark((p) => p.sessions)} />
        <Kpi label="AI resolved" value={`${avg((p) => p.aiResolved).toFixed(0)}%`} delta={half((p) => p.aiResolved)} hint="vs avg" spark={spark((p) => p.aiResolved)} />
        <Kpi label="Avg duration" value={fmtDuration(Math.round(avg((p) => p.avgDurationSec)))} delta={half((p) => p.avgDurationSec)} goodWhenUp={false} hint="vs avg" spark={spark((p) => p.avgDurationSec)} />
        <Kpi label="Cost (30d)" value={gbp(series.reduce((a, p) => a + p.cost, 0), 0)} delta={half((p) => p.cost)} goodWhenUp={false} hint="vs avg" spark={spark((p) => p.cost)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Daily sessions" subtitle="Last 30 days">
          <ChartBox height={220}>
            <BarChart data={series} margin={{ left: -16, right: 4, top: 4 }}>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="date" {...axisProps} interval={4} /><YAxis {...axisProps} />
              <Tooltip {...tooltipStyle} /><Bar dataKey="sessions" name="Sessions" fill={client.accent} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ChartBox>
        </Panel>
        <Panel title="AI resolution and escalation rate" subtitle="% of sessions">
          <ChartBox height={220}>
            <LineChart data={series} margin={{ left: -16, right: 4, top: 4 }}>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="date" {...axisProps} interval={4} /><YAxis {...axisProps} domain={[0, 100]} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="aiResolved" name="AI resolved %" stroke={chartColors.brand} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="escalated" name="Escalated %" stroke={chartColors.amber} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartBox>
        </Panel>
      </div>
      <Panel flush title="Recent sessions" actions={<Link href="/sessions" className="text-xs font-medium text-brand-strong hover:underline">View all</Link>}>
        <Table>
          <thead><tr><Th>Session</Th><Th>Customer</Th><Th>Workflow</Th><Th>Status</Th><Th>Owner</Th><Th>Confidence</Th><Th className="text-right">Duration</Th></tr></thead>
          <tbody>
            {recent.map((s) => (
              <Tr key={s.id}>
                <Td><Link href={`/sessions/${s.id}`} className="font-mono text-xs font-medium text-brand-strong hover:underline">{s.id}</Link></Td>
                <Td>{s.customer}</Td><Td className="text-ink-soft">{s.workflowName} {s.workflowVersion}</Td>
                <Td><StatusChip status={s.status} /></Td><Td><OwnerChip owner={s.owner} name={s.humanAgent} /></Td>
                <Td><ConfidenceBar value={s.aiConfidence} /></Td><Td className="num text-right">{fmtDuration(s.durationSec)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

const roleTone: Record<string, Tone> = { "Tenant Admin": "brand", Supervisor: "human", Agent: "info", "QA Reviewer": "warn", Analyst: "neutral" };
const userTone: Record<string, Tone> = { active: "ok", invited: "info", suspended: "bad" };

export function UsersTab({ client }: { client: Client }) {
  const users = clientUsers[client.id] ?? [];
  const [msg, flash] = useFlash();
  return (
    <Panel flush title={`${users.length} users`} subtitle="Mock tenant users. Roles control console access." actions={<><FlashNote msg={msg} /><Button size="sm" onClick={() => flash("Invitation queued (demo only)")}>Invite user</Button></>}>
      <Table>
        <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Last active</Th></tr></thead>
        <tbody>
          {users.map((u) => (
            <Tr key={u.email}>
              <Td className="font-medium">{u.name}</Td><Td className="text-ink-soft">{u.email}</Td>
              <Td><Chip tone={roleTone[u.role]}>{u.role}</Chip></Td>
              <Td><Chip tone={userTone[u.status]} dot>{u.status[0].toUpperCase() + u.status.slice(1)}</Chip></Td>
              <Td className="text-ink-soft">{u.lastActive}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

export function AgentsTab({ client }: { client: Client }) {
  const rows = agents.filter((a) => a.clientId === client.id);
  return (
    <Panel flush title={`${rows.length} AI agents`}>
      <Table>
        <thead><tr><Th>Agent</Th><Th>Status</Th><Th>Voice</Th><Th>Language</Th><Th>Version</Th><Th className="text-right">Sessions (30d)</Th><Th className="text-right">Resolution</Th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <Tr key={a.id}>
              <Td><Link href={`/agents/${a.id}`} className="font-medium hover:text-brand-strong">{a.name}<span className="block text-2xs font-normal text-ink-mute">{a.title}</span></Link></Td>
              <Td><AgentStatusChip status={a.status} /></Td><Td className="text-ink-soft">{a.voice}</Td><Td className="text-ink-soft">{a.language}</Td>
              <Td className="font-mono text-xs">{a.version}</Td><Td className="num text-right">{num(a.sessions30d)}</Td><Td className="num text-right">{a.resolution ? `${a.resolution}%` : "—"}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

export function WorkflowsTab({ client }: { client: Client }) {
  const rows = workflows.filter((w) => w.clientId === client.id);
  return (
    <Panel flush title={`${rows.length} workflows`}>
      <Table>
        <thead><tr><Th>Workflow</Th><Th>Version</Th><Th>Status</Th><Th className="text-right">Sessions (30d)</Th><Th className="text-right">Completion</Th><Th>Updated</Th></tr></thead>
        <tbody>
          {rows.map((w) => (
            <Tr key={w.id}>
              <Td><Link href={`/workflows/${w.id}`} className="font-medium hover:text-brand-strong">{w.name}</Link></Td>
              <Td className="font-mono text-xs">{w.version}</Td><Td><WorkflowStatusChip status={w.status} /></Td>
              <Td className="num text-right">{num(w.sessions30d)}</Td><Td className="num text-right">{w.completionRate ? `${w.completionRate}%` : "—"}</Td><Td className="text-ink-soft">{w.updated}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

export function PoliciesTab({ client }: { client: Client }) {
  const rows = policies.filter((p) => p.clientIds.includes(client.id));
  return (
    <Panel flush title={`${rows.length} assigned policies`} actions={<Link href="/policies" className="text-xs font-medium text-brand-strong hover:underline">Policy library</Link>}>
      <Table>
        <thead><tr><Th>ID</Th><Th>Policy</Th><Th>Category</Th><Th>Scope</Th><Th>Version</Th><Th>Status</Th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <Tr key={p.id}>
              <Td className="font-mono text-xs">{p.id}</Td><Td className="font-medium">{p.name}</Td><Td className="text-ink-soft">{p.category}</Td>
              <Td><Chip>{p.scope}</Chip></Td><Td className="font-mono text-xs">{p.version}</Td><Td><PolicyStatusChip status={p.status} /></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

const intTone: Record<string, Tone> = { connected: "ok", degraded: "warn", not_configured: "neutral" };
const intLabel: Record<string, string> = { connected: "Connected", degraded: "Degraded", not_configured: "Not configured" };
export function IntegrationsTab({ client }: { client: Client }) {
  const rows = clientIntegrations[client.id] ?? [];
  return (
    <Panel flush title="Integrations" subtitle="Connections are simulated in this demo.">
      <Table>
        <thead><tr><Th>Integration</Th><Th>Type</Th><Th>Status</Th><Th>Detail</Th></tr></thead>
        <tbody>
          {rows.map((i) => (
            <Tr key={i.name}><Td className="font-medium">{i.name}</Td><Td className="text-ink-soft">{i.kind}</Td><Td><Chip tone={intTone[i.status]} dot>{intLabel[i.status]}</Chip></Td><Td className="text-ink-soft">{i.detail}</Td></Tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

export function SettingsTab({ client, accent, onAccent, displayName, onDisplayName }: { client: Client; accent: string; onAccent: (v: string) => void; displayName: string; onDisplayName: (v: string) => void }) {
  const [mode, setMode] = useState<Client["retentionMode"]>(client.retentionMode);
  const [days, setDays] = useState(String(client.retentionDays));
  const [region, setRegion] = useState(client.region);
  const [residency, setResidency] = useState(dataResidencyOptions[0]);
  const [initials, setInitials] = useState(client.initials);
  const [showLogo, setShowLogo] = useState(true);
  const [recording, setRecording] = useState(false);
  const [redact, setRedact] = useState(true);
  const [msg, flash] = useFlash(3200);
  const dirtyHint = mode === "full_evidence" ? "Full evidence retention requires a DPO-approved policy." : mode === "live_only" ? "No frames stored; QA review and evidence export are unavailable." : "Only frames selected for model analysis are stored. Raw video is never stored.";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Data retention" subtitle="Applied to new sessions after saving">
        <div className="space-y-3">
          <Field label="Retention mode" hint={dirtyHint}>
            <Select className="w-full" value={mode} onChange={(v) => setMode(v as Client["retentionMode"])} options={Object.entries(retentionLabel).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="Retention period (days)"><TextInput type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="w-28" disabled={mode === "live_only"} /></Field>
          <Row label="Blur faces and documents before storage" on={redact} onChange={setRedact} />
          <Row label="Store audio recordings" on={recording} onChange={setRecording} />
        </div>
      </Panel>
      <Panel title="Region and residency">
        <div className="space-y-3">
          <Field label="Processing region"><Select className="w-full" value={region} onChange={setRegion} options={["UK South (London)", "UK West (Cardiff)", "EU West (Dublin)"].map((r) => ({ value: r, label: r }))} /></Field>
          <Field label="Data residency"><Select className="w-full" value={residency} onChange={setResidency} options={dataResidencyOptions.map((r) => ({ value: r, label: r }))} /></Field>
          <KeyValue cols={2} items={[{ k: "Contract tier", v: client.contractTier }, { k: "Industry", v: client.industry }]} />
        </div>
      </Panel>
      <Panel title="Branding" subtitle="Shown in the customer-facing session header" className="lg:col-span-2">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="Display name"><TextInput value={displayName} onChange={(e) => onDisplayName(e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Accent colour"><div className="flex items-center gap-2"><input type="color" aria-label="Accent colour" value={accent} onChange={(e) => onAccent(e.target.value)} className="h-8 w-10 rounded border border-line bg-surface" /><TextInput value={accent} onChange={(e) => onAccent(e.target.value)} className="font-mono" /></div></Field>
              <Field label="Logo initials"><TextInput value={initials} maxLength={3} onChange={(e) => setInitials(e.target.value.toUpperCase())} className="w-24" /></Field>
            </div>
            <Row label="Show logo block in customer header" on={showLogo} onChange={setShowLogo} />
          </div>
          <BrandPreview name={displayName} initials={showLogo ? initials : ""} accent={accent} />
        </div>
      </Panel>
      <div className="flex items-center gap-3 lg:col-span-2">
        <Button variant="primary" onClick={() => flash("Settings saved (demo only, not persisted)")}>Save settings</Button>
        <FlashNote msg={msg} />
      </div>
    </div>
  );
}
function Row({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2"><span className="text-[13px]">{label}</span><Toggle on={on} onChange={onChange} label={label} /></div>;
}
