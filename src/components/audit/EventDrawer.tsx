"use client";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Drawer, KeyValue } from "@/components/ui/primitives";
import { auditEvents } from "@/lib/data/audit";
import type { AuditEvent } from "@/lib/types/audit";
import { ResultChip } from "./AuditChips";

export function EventDrawer({ event, onClose, onSelect }: { event: AuditEvent | null; onClose: () => void; onSelect: (e: AuditEvent) => void }) {
  const related = event?.sessionId ? auditEvents.filter((e) => e.sessionId === event.sessionId).sort((a, b) => a.iso.localeCompare(b.iso)) : [];
  return (
    <Drawer open={!!event} onClose={onClose} width="max-w-xl" title={event ? event.event : ""} subtitle={event ? `${event.id} · ${event.at}` : undefined}>
      {event && (
        <div className="space-y-5">
          <KeyValue cols={2} items={[
            { k: "Result", v: <ResultChip result={event.result} /> },
            { k: "Tenant", v: event.tenant },
            { k: "Session", v: event.sessionId ? <Link href={`/sessions/${event.sessionId}`} className="font-mono text-brand hover:underline">{event.sessionId}</Link> : "n/a (platform event)" },
            { k: "Actor", v: <>{event.actor} <span className="text-ink-mute">· {event.actorType}</span></> },
            { k: "Workflow version", v: event.workflowVersion ?? "n/a" },
            { k: "Policy version", v: event.policyVersion },
            { k: "Model version", v: event.modelVersion },
            { k: "Timestamp (UTC)", v: <span className="font-mono text-xs">{event.iso}</span> },
          ]} />

          <div>
            <p className="label mb-1.5">Payload</p>
            <pre className="max-h-72 overflow-auto rounded border border-line bg-subtle p-3 font-mono text-xs leading-relaxed text-ink">{JSON.stringify(event.payload, null, 2)}</pre>
          </div>

          <div className="rounded border border-line p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><ShieldCheck size={14} className="text-ok" />Integrity</div>
            <KeyValue items={[
              { k: "Integrity hash (SHA-256, demo)", v: <span className="break-all font-mono text-2xs">{event.hash}</span> },
              { k: "Previous entry hash", v: <span className="break-all font-mono text-2xs text-ink-mute">{event.prevHash}</span> },
            ]} />
            <p className="mt-2 text-2xs text-ink-mute">Tamper-evident log (demo): each entry is chained to the previous hash. Production writes to append-only WORM storage.</p>
          </div>

          {related.length > 0 && (
            <div>
              <p className="label mb-2">Related events · {event.sessionId} ({related.length})</p>
              <ol className="relative ml-1.5 border-l border-line">
                {related.map((e) => (
                  <li key={e.id} className="relative pb-2.5 pl-4">
                    <span className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ${e.id === event.id ? "bg-brand" : "bg-line"}`} />
                    <button onClick={() => onSelect(e)} className={`w-full rounded px-1.5 py-1 text-left hover:bg-subtle ${e.id === event.id ? "bg-brand-soft/60" : ""}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-ink">{e.event}</span>
                        <ResultChip result={e.result} />
                      </span>
                      <span className="text-2xs text-ink-mute">{e.at.split(", ")[1]} · {e.actor}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
