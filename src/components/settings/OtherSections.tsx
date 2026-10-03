"use client";
import { Toggle as ToggleSwitch } from "@/components/ui/primitives";
import { useState } from "react";
import { Chip, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { actions, useAppState } from "@/lib/store";
import { defaultNotifications, featureFlags, notificationChannels, notificationEvents, regions, subprocessors } from "@/lib/data/settings";
import type { RetentionMode } from "@/lib/types/settings";
import { Checkbox, SectionCard, ToggleRow } from "./SectionCard";

const modes: { id: RetentionMode; label: string; hint: string }[] = [
  { id: "live_only", label: "Live only", hint: "Frames processed in memory and discarded when the session ends." },
  { id: "selected_frames", label: "Selected frames", hint: "Only frames used as evidence for decisions are stored." },
  { id: "full_evidence", label: "Full evidence", hint: "Frames, transcript and tool logs retained for the full period." },
];

export function RetentionSection() {
  const [mode, setMode] = useState<RetentionMode>("selected_frames");
  const [days, setDays] = useState(30);
  const [auto, setAuto] = useState(true);
  const [red, setRed] = useState({ faces: true, documents: true, payment: true });
  return (
    <SectionCard title="Retention and redaction" description="Default for new tenants. Tenant-level overrides can be stricter, never looser.">
      <div role="radiogroup" aria-label="Retention mode" className="grid gap-2 sm:grid-cols-3">
        {modes.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className={cn("rounded border p-3 text-left", mode === m.id ? "border-brand bg-brand-soft/50" : "border-line hover:bg-subtle")}>
            <p className="text-[13px] font-semibold">{m.label}</p><p className="mt-0.5 text-xs text-ink-mute">{m.hint}</p>
          </button>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between"><label htmlFor="ret-days" className="text-xs font-medium text-ink-soft">Retention period</label><span className="num text-[13px] font-semibold">{days} days</span></div>
        <input id="ret-days" type="range" min={1} max={365} value={days} disabled={mode === "live_only"} onChange={(e) => setDays(+e.target.value)} className="mt-1.5 w-full accent-[rgb(var(--brand))] disabled:opacity-40" />
        <div className="flex justify-between text-2xs text-ink-mute"><span>1 day</span><span>365 days</span></div>
      </div>
      <ToggleRow label="Automatic deletion" hint="Purge expired evidence nightly and write a Retention purge audit event." on={auto} onChange={setAuto} />
      <div className="space-y-3 border-t border-line pt-4">
        <p className="label">Redaction</p>
        <ToggleRow label="Faces" hint="Blur detected faces before storage." on={red.faces} onChange={(v) => setRed({ ...red, faces: v })} />
        <ToggleRow label="Documents" hint="Mask ID documents, letters and screens with personal data." on={red.documents} onChange={(v) => setRed({ ...red, documents: v })} />
        <ToggleRow label="Payment information" hint="Mask card numbers and bank details." on={red.payment} onChange={(v) => setRed({ ...red, payment: v })} />
      </div>
      <div className="rounded border border-line bg-subtle/50 p-3 text-xs text-ink-soft"><span className="font-semibold text-ink">Legal hold.</span> Sessions under legal hold are excluded from automatic deletion until released by a Client Admin with a recorded reason.</div>
    </SectionCard>
  );
}

export function RegionsSection() {
  const [def, setDef] = useState("uk-south");
  return (
    <div className="space-y-5">
      <SectionCard title="Data residency" description="Where media, evidence and metadata are processed and stored.">
        <div role="radiogroup" aria-label="Default region" className="divide-y divide-line rounded border border-line">
          {regions.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-3 px-3.5 py-3 hover:bg-subtle/50">
              <input type="radio" name="region" checked={def === r.id} onChange={() => setDef(r.id)} className="accent-[rgb(var(--brand))]" />
              <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{r.name} <span className="font-normal text-ink-mute">· {r.location}</span></p><p className="text-xs text-ink-mute">{r.residency}</p></div>
              {def === r.id && <Chip tone="brand">Default</Chip>}
              <Chip tone={r.status === "Active" ? "ok" : "neutral"} dot>{r.status}</Chip>
            </label>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Subprocessors" description="Third parties that process customer data on our behalf." noSave>
        <div className="-mx-4 -my-1">
          <Table>
            <thead><tr><Th>Subprocessor</Th><Th>Purpose</Th><Th>Region</Th><Th>DPA</Th></tr></thead>
            <tbody>{subprocessors.map((s) => <Tr key={s.name}><Td className="font-medium">{s.name}</Td><Td className="text-ink-soft">{s.purpose}</Td><Td className="whitespace-nowrap">{s.region}</Td><Td><Chip tone={s.dpa === "Signed" ? "ok" : "warn"}>{s.dpa}</Chip></Td></Tr>)}</tbody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}

export function NotificationsSection() {
  const [m, setM] = useState<Record<string, string[]>>(defaultNotifications);
  const toggle = (e: string, c: string, on: boolean) => setM({ ...m, [e]: on ? [...(m[e] ?? []), c] : (m[e] ?? []).filter((x) => x !== c) });
  return (
    <SectionCard title="Notifications" description="Choose which channels receive each event.">
      <div className="-mx-4 -my-1">
        <Table>
          <thead><tr><Th>Event</Th>{notificationChannels.map((c) => <Th key={c} className="text-center">{c}</Th>)}</tr></thead>
          <tbody>
            {notificationEvents.map((e) => (
              <Tr key={e.id}>
                <Td className="font-medium">{e.label}</Td>
                {notificationChannels.map((c) => <Td key={c} className="text-center"><Checkbox label={`${e.label} via ${c}`} checked={(m[e.id] ?? []).includes(c)} onChange={(v) => toggle(e.id, c, v)} /></Td>)}
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </SectionCard>
  );
}

export function FlagsSection() {
  const flags = useAppState((s) => s.featureFlags);
  return (
    <SectionCard title="Feature flags" description="Changes apply immediately in this browser session (demo store).">
      <div className="-mx-4 -my-1">
        <Table>
          <thead><tr><Th>Flag</Th><Th>Environment</Th><Th>Rollout</Th><Th className="text-right">Enabled</Th></tr></thead>
          <tbody>
            {featureFlags.map((f) => {
              const on = flags[f.id] ?? f.defaultOn;
              return (
                <Tr key={f.id}>
                  <Td><p className="font-medium">{f.name}</p><p className="text-xs text-ink-mute">{f.description}</p></Td>
                  <Td><Chip tone={f.env === "Production" ? "brand" : "neutral"}>{f.env}</Chip></Td>
                  <Td>
                    <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><div className={cn("h-full", on ? "bg-brand" : "bg-ink-mute")} style={{ width: `${f.rollout}%` }} /></div><span className="num text-xs text-ink-soft">{f.rollout}%</span></div>
                  </Td>
                  <Td className="text-right"><ToggleSwitch on={on} label={f.name} onChange={(v) => actions.setFlag(f.id, v)} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </SectionCard>
  );
}
