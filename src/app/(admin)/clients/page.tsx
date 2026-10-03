"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, Field, Modal, PageHeader, Panel, SearchInput, Select, Table, Td, TextInput, Th, Tr, EmptyState } from "@/components/ui/primitives";
import { clients as baseClients } from "@/lib/data/clients";
import { agents } from "@/lib/data/agents";
import { workflows } from "@/lib/data/workflows";
import { dailySeries } from "@/lib/data/metrics";
import { isLiveStatus } from "@/lib/data/sessions";
import { useSessions } from "@/lib/services/sessions";
import { useAppState } from "@/lib/store";
import { num } from "@/lib/format";
import { ClientStatusChip, InitialsBlock, FlashNote, useFlash } from "@/components/clients/shared";
import type { Client } from "@/lib/types";

const industries = ["Energy & Utilities", "Telecommunications", "Insurance", "Retail", "Healthcare", "Public Sector"];

export default function ClientsPage() {
  const clientFilter = useAppState((s) => s.clientFilter);
  const sessions = useSessions({ respectClientFilter: false });
  const [extra, setExtra] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [msg, flash] = useFlash();

  const rows = useMemo(() => {
    const all = [...baseClients, ...extra];
    return all
      .filter((c) => clientFilter === "all" || c.id === clientFilter)
      .filter((c) => status === "all" || c.status === status)
      .filter((c) => !q || `${c.name} ${c.industry}`.toLowerCase().includes(q.toLowerCase()))
      .map((c) => ({
        c,
        live: sessions.filter((s) => s.clientId === c.id && isLiveStatus(s.status)).length,
        wf: workflows.filter((w) => w.clientId === c.id).length,
        ag: agents.filter((a) => a.clientId === c.id).length,
        s30: (c.id === "northstar" || c.id === "clearwave" || c.id === "horizon") ? dailySeries(c.id).reduce((a, p) => a + p.sessions, 0) : 0,
      }));
  }, [extra, clientFilter, status, q, sessions]);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Tenant organisations using Absolute Intelligence Visual Assist: branding, assigned agents, workflows and data policies."
        actions={<><FlashNote msg={msg} /><Button variant="primary" onClick={() => setOpen(true)}><Plus size={14} />Add client</Button></>}
      />
      <Panel
        flush
        title={`${rows.length} client${rows.length === 1 ? "" : "s"}`}
        actions={<>
          <SearchInput value={q} onChange={setQ} placeholder="Search clients…" />
          <Select label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "live", label: "Live" }, { value: "pilot", label: "Pilot" }, { value: "onboarding", label: "Onboarding" }]} />
        </>}
      >
        <Table>
          <thead><tr><Th>Client</Th><Th>Industry</Th><Th>Status</Th><Th>Region</Th><Th className="text-right">Active sessions</Th><Th className="text-right">Workflows</Th><Th className="text-right">AI agents</Th><Th className="text-right">Sessions (30d)</Th></tr></thead>
          <tbody>
            {rows.map(({ c, live, wf, ag, s30 }) => (
              <Tr key={c.id}>
                <Td>
                  <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5 font-medium hover:text-brand-strong">
                    <InitialsBlock initials={c.initials} color={c.accent} size={26} />
                    <span>{c.name}<span className="block text-2xs font-normal text-ink-mute">{c.contractTier}</span></span>
                  </Link>
                </Td>
                <Td className="text-ink-soft">{c.industry}</Td>
                <Td><ClientStatusChip status={c.status} /></Td>
                <Td className="text-ink-soft">{c.region}</Td>
                <Td className="num text-right">{live}</Td>
                <Td className="num text-right">{wf}</Td>
                <Td className="num text-right">{ag}</Td>
                <Td className="num text-right">{num(s30)}</Td>
              </Tr>
            ))}
            {rows.length === 0 && <tr><Td colSpan={8}><EmptyState title="No clients match" hint="Adjust search, status filter or the global client switcher." /></Td></tr>}
          </tbody>
        </Table>
      </Panel>
      <AddClientModal open={open} onClose={() => setOpen(false)} onAdd={(c) => { setExtra((e) => [...e, c]); flash(`${c.name} added (demo only)`); setOpen(false); }} />
    </>
  );
}

function AddClientModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (c: Client) => void }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState(industries[0]);
  const [region, setRegion] = useState("UK South (London)");
  const [accent, setAccent] = useState("#0d7e8f");
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const submit = () => {
    if (!name.trim()) return;
    onAdd({ id: `demo-${name.toLowerCase().replace(/\W+/g, "-")}` as Client["id"], name: name.trim(), industry, status: "onboarding", region, accent, initials: initials || "NC", retentionDays: 30, retentionMode: "selected_frames", contractTier: "Trial" });
    setName("");
  };
  return (
    <Modal open={open} onClose={onClose} title="Add client" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!name.trim()}>Create client</Button></>}>
      <div className="space-y-3">
        <p className="rounded border border-line bg-subtle px-3 py-2 text-xs text-ink-soft">Demo only. The new client is added to this list for this page view and is not persisted.</p>
        <Field label="Organisation name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meridian Water" autoFocus /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Industry"><Select value={industry} onChange={setIndustry} className="w-full" options={industries.map((i) => ({ value: i, label: i }))} /></Field>
          <Field label="Region"><Select value={region} onChange={setRegion} className="w-full" options={["UK South (London)", "UK West (Cardiff)", "EU West (Dublin)"].map((r) => ({ value: r, label: r }))} /></Field>
        </div>
        <Field label="Brand accent colour"><div className="flex items-center gap-2"><input type="color" aria-label="Accent colour" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-8 w-10 rounded border border-line bg-surface" /><TextInput value={accent} onChange={(e) => setAccent(e.target.value)} className="w-28 font-mono" /><InitialsBlock initials={initials || "NC"} color={accent} size={32} /></div></Field>
      </div>
    </Modal>
  );
}
