"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button, Panel, SearchInput, Select, Table, Td, Th, Tr, EmptyState } from "@/components/ui/primitives";
import { useAppState } from "@/lib/store";
import { clients } from "@/lib/data/clients";
import { AUDIT_ACTOR_TYPES, AUDIT_EVENT_TYPES, AUDIT_RESULTS, auditEvents, auditTenants } from "@/lib/data/audit";
import type { AuditEvent } from "@/lib/types/audit";
import { ResultChip } from "./AuditChips";
import { EventDrawer } from "./EventDrawer";
import { useToast } from "./Toast";

const PAGE = 25;
const all = (label: string, vals: readonly string[]) => [{ value: "all", label }, ...vals.map((v) => ({ value: v, label: v }))];

export function AuditLog() {
  const clientFilter = useAppState((s) => s.clientFilter);
  const globalTenant = clientFilter === "all" ? null : clients.find((c) => c.id === clientFilter)?.name ?? null;
  const [q, setQ] = useState("");
  const [tenant, setTenant] = useState("all");
  const [result, setResult] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [actorType, setActorType] = useState("all");
  const [sessionId, setSessionId] = useState("");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const toast = useToast();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sid = sessionId.trim().toLowerCase();
    const list = auditEvents.filter((e) => {
      if (globalTenant && e.tenant !== globalTenant && e.tenant !== "Platform") return false;
      if (tenant !== "all" && e.tenant !== tenant) return false;
      if (result !== "all" && e.result !== result) return false;
      if (eventType !== "all" && e.event !== eventType) return false;
      if (actorType !== "all" && e.actorType !== actorType) return false;
      if (sid && !(e.sessionId ?? "").toLowerCase().includes(sid)) return false;
      if (needle) {
        const hay = [e.id, e.at, e.tenant, e.sessionId, e.actor, e.actorType, e.event, e.workflowVersion, e.policyVersion, e.modelVersion, e.result, JSON.stringify(e.payload)].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => (asc ? a.iso.localeCompare(b.iso) : b.iso.localeCompare(a.iso)));
  }, [q, tenant, result, eventType, actorType, sessionId, asc, globalTenant]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = rows.slice(cur * PAGE, cur * PAGE + PAGE);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };
  const clear = () => { setQ(""); setTenant("all"); setResult("all"); setEventType("all"); setActorType("all"); setSessionId(""); setPage(0); };
  const filtered = q || tenant !== "all" || result !== "all" || eventType !== "all" || actorType !== "all" || sessionId;

  return (
    <>
      <Panel
        flush
        title="Audit events"
        subtitle={`${rows.length} of ${auditEvents.length} events${globalTenant ? ` · scoped to ${globalTenant}` : ""}`}
        actions={<Button size="sm" onClick={() => toast.show(`Export queued (demo): ${rows.length} events as CSV`)}><Download size={13} />Export (demo)</Button>}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <SearchInput value={q} onChange={reset(setQ)} placeholder="Search any field…" className="w-64" />
          <Select label="Tenant" value={tenant} onChange={reset(setTenant)} options={all("All tenants", auditTenants)} />
          <Select label="Event type" value={eventType} onChange={reset(setEventType)} options={all("All events", AUDIT_EVENT_TYPES)} />
          <Select label="Actor type" value={actorType} onChange={reset(setActorType)} options={all("All actors", AUDIT_ACTOR_TYPES)} />
          <Select label="Result" value={result} onChange={reset(setResult)} options={all("All results", AUDIT_RESULTS)} />
          <SearchInput value={sessionId} onChange={reset(setSessionId)} placeholder="Session ID (VA-27413)" className="w-44 font-mono" />
          {filtered && <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>
                <button onClick={() => setAsc((a) => !a)} className="inline-flex items-center gap-1 uppercase tracking-wider" aria-label="Sort by timestamp">
                  Timestamp {asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                </button>
              </Th>
              <Th>Tenant</Th><Th>Session</Th><Th>Actor</Th><Th>Event</Th><Th>Workflow</Th><Th>Policy</Th><Th>Model</Th><Th>Result</Th>
            </tr>
          </thead>
          <tbody>
            {slice.map((e) => (
              <Tr key={e.id} onClick={() => setSelected(e)} selected={selected?.id === e.id}>
                <Td className="whitespace-nowrap font-mono text-xs text-ink-soft">{e.at}</Td>
                <Td className="whitespace-nowrap">{e.tenant}</Td>
                <Td className="whitespace-nowrap">
                  {e.sessionId ? <Link href={`/sessions/${e.sessionId}`} onClick={(ev) => ev.stopPropagation()} className="font-mono text-xs text-brand hover:underline">{e.sessionId}</Link> : <span className="text-ink-mute">—</span>}
                </Td>
                <Td className="whitespace-nowrap">{e.actor}<span className="ml-1.5 text-2xs text-ink-mute">{e.actorType}</span></Td>
                <Td className="whitespace-nowrap font-medium">{e.event}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{e.workflowVersion ?? "—"}</Td>
                <Td className="whitespace-nowrap font-mono text-xs text-ink-soft">{e.policyVersion}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{e.modelVersion}</Td>
                <Td><ResultChip result={e.result} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <EmptyState title="No audit events match these filters" hint="Adjust or clear the filters to widen the search." />}
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink-mute">
          <span>{rows.length === 0 ? "0 events" : `${cur * PAGE + 1}–${Math.min(rows.length, cur * PAGE + PAGE)} of ${rows.length}`}</span>
          <div className="flex items-center gap-2">
            <span>Page {cur + 1} / {pages}</span>
            <Button size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft size={13} /></Button>
            <Button size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight size={13} /></Button>
          </div>
        </div>
      </Panel>
      <EventDrawer event={selected} onClose={() => setSelected(null)} onSelect={setSelected} />
      {toast.node}
    </>
  );
}
