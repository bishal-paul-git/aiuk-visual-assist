"use client";
import { Button, Drawer, KeyValue, Panel, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { incidents } from "@/lib/data/metrics";
import { incidentUpdates } from "@/lib/data/health";
import { IncidentStateChip, SeverityChip } from "./HealthChips";

export function IncidentsPanel({ resolved, onOpen }: { resolved: Record<string, boolean>; onOpen: (id: string) => void }) {
  return (
    <Panel flush title="Recent incidents" subtitle={`${incidents.filter((i) => i.state !== "resolved" && !resolved[i.id]).length} open · ${incidents.length} in last 7 days`}>
      <Table>
        <thead><tr><Th>ID</Th><Th>Title</Th><Th>Service</Th><Th>Severity</Th><Th>State</Th><Th>Started</Th><Th className="text-right">Duration</Th></tr></thead>
        <tbody>
          {incidents.map((i) => (
            <Tr key={i.id} onClick={() => onOpen(i.id)}>
              <Td className="whitespace-nowrap font-mono text-xs">{i.id}</Td>
              <Td className="min-w-[16rem] font-medium">{i.title}</Td>
              <Td className="whitespace-nowrap">{i.service}</Td>
              <Td><SeverityChip sev={i.severity} /></Td>
              <Td><IncidentStateChip state={resolved[i.id] ? "resolved" : i.state} /></Td>
              <Td className="whitespace-nowrap text-xs text-ink-soft">{i.startedAt}</Td>
              <Td className="num text-right text-xs">{i.durationMin} min</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

export function IncidentDrawer({ id, resolved, onClose, onResolve }: { id: string | null; resolved: Record<string, boolean>; onClose: () => void; onResolve: (id: string) => void }) {
  const inc = id ? incidents.find((i) => i.id === id) : undefined;
  const isResolved = !!inc && (inc.state === "resolved" || resolved[inc.id]);
  return (
    <Drawer open={!!inc} onClose={onClose} width="max-w-lg" title={inc ? `${inc.id} · ${inc.service}` : ""} subtitle={inc?.title}
      footer={inc && !isResolved ? <Button variant="primary" onClick={() => onResolve(inc.id)}>Mark resolved</Button> : undefined}>
      {inc && (
        <div className="space-y-5">
          <div className="flex items-center gap-2"><SeverityChip sev={inc.severity} /><IncidentStateChip state={isResolved ? "resolved" : inc.state} /></div>
          <KeyValue cols={2} items={[{ k: "Started", v: inc.startedAt }, { k: "Duration", v: `${inc.durationMin} min` }, { k: "Service", v: inc.service }]} />
          <KeyValue items={[{ k: "Customer impact", v: inc.impact }, { k: "Summary", v: inc.summary }]} />
          <div>
            <p className="label mb-2">Timeline</p>
            <ol className="relative ml-1.5 border-l border-line">
              {incidentUpdates(inc, !!resolved[inc.id]).map((u, i) => (
                <li key={i} className="relative pb-3 pl-4">
                  <span className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full bg-brand" />
                  <p className="text-2xs text-ink-mute"><span className="num">{u.at}</span> · {u.state}</p>
                  <p className="text-[13px] text-ink">{u.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Drawer>
  );
}
