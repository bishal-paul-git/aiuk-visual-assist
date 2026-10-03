"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { PageHeader, Panel, Segmented, Select, Chip, Stat } from "@/components/ui/primitives";
import { SessionTable } from "@/components/sessions/SessionTable";
import { CameraPanel } from "@/components/visual/CameraPanel";
import { OwnerChip, StatusChip } from "@/components/ui/domain";
import { useSessions } from "@/lib/services/sessions";
import { fmtDuration, isLiveStatus } from "@/lib/data/sessions";
import { clientById } from "@/lib/data/clients";
import { useTicker } from "@/lib/hooks/useTicker";

export default function LivePage() {
  const all = useSessions();
  const [view, setView] = useState<"table" | "grid">("table");
  const [status, setStatus] = useState("all");
  const live = useMemo(() => all.filter((s) => isLiveStatus(s.status)), [all]);
  const rows = live.filter((s) => status === "all" || s.status === status);
  const tick = useTicker();
  const count = (f: (s: (typeof live)[number]) => boolean) => live.filter(f).length;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">Live Sessions <Chip tone="ok" dot pulse>Live</Chip></span>}
        description="Real-time view of in-flight Human + AI visual assistance sessions. Click any session to inspect evidence, transcript and ownership."
        actions={<Segmented value={view} onChange={setView} options={[{ id: "table", label: "Table" }, { id: "grid", label: "Camera grid" }]} />}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 shadow-card sm:grid-cols-5">
        <Stat label="Active now" value={live.length} />
        <Stat label="AI handling" value={count((s) => s.owner === "AI")} sub="no human needed" tone="ok" />
        <Stat label="Human owned" value={count((s) => s.owner === "Human")} />
        <Stat label="Escalating" value={count((s) => s.status === "escalating")} sub="awaiting adviser" tone="warn" />
        <Stat label="Low confidence" value={count((s) => s.aiConfidence < 0.7)} sub="below 0.70 threshold" tone="warn" />
      </div>
      <Panel
        title="In-flight sessions" subtitle={`${rows.length} shown · updated ${tick}s ago`} flush
        actions={<Select label="State" value={status} onChange={setStatus} options={[{ value: "all", label: "All states" }, { value: "ai_handling", label: "AI handling" }, { value: "awaiting_evidence", label: "Awaiting visual evidence" }, { value: "analysing", label: "Analysing" }, { value: "escalating", label: "Escalating" }, { value: "human_joined", label: "Human joined" }]} />}
      >
        {view === "table" ? (
          <SessionTable rows={rows} live cols={["id", "client", "workflow", "status", "owner", "duration", "confidence", "escalation", "connection"]} />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {rows.map((s) => (
              <Link key={s.id} href={`/sessions/${s.id}`} className="group overflow-hidden rounded-lg border border-line bg-surface hover:border-ink-mute">
                <CameraPanel scene={s.scene} rounded={false} overlays={false} timer={fmtDuration(s.durationSec + tick)} className="aspect-video" />
                <div className="space-y-1.5 p-2.5">
                  <div className="flex items-center justify-between"><span className="font-mono text-xs font-semibold">{s.id}</span><OwnerChip owner={s.owner} name={s.humanAgent} /></div>
                  <p className="truncate text-xs text-ink-soft">{clientById(s.clientId)?.name} · {s.workflowName}</p>
                  <StatusChip status={s.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
      <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-mute"><Radio size={12} />Demo simulation. In production this view is driven by a WebSocket stream from the session orchestrator.</p>
    </>
  );
}
