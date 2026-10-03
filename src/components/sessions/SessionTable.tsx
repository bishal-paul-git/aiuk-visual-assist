"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Chip, ConfidenceBar, EmptyState, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { ConnectionIndicator, OwnerChip, StatusChip } from "@/components/ui/domain";
import { clientById } from "@/lib/data/clients";
import { fmtDuration, gbp } from "@/lib/data/sessions";
import type { Session } from "@/lib/types";
import { useRouter } from "next/navigation";

export type Col = "id" | "client" | "workflow" | "status" | "owner" | "duration" | "confidence" | "escalation" | "connection" | "frames" | "outcome" | "cost" | "started";

const HEAD: Record<Col, string> = { id: "Session", client: "Client", workflow: "Workflow", status: "State", owner: "Owner", duration: "Duration", confidence: "AI confidence", escalation: "Escalation", connection: "Connection", frames: "Frames", outcome: "Outcome", cost: "Demo cost", started: "Started" };

export function SessionTable({ rows, cols, live }: { rows: Session[]; cols: Col[]; live?: boolean }) {
  const router = useRouter();
  if (!rows.length) return <EmptyState title="No sessions match these filters" hint="Try clearing a filter or switching the client context." />;
  return (
    <Table>
      <thead><tr>{cols.map((c) => <Th key={c}>{HEAD[c]}</Th>)}</tr></thead>
      <tbody>
        {rows.map((s) => (
          <Tr key={s.id} onClick={() => router.push(`/sessions/${s.id}`)}>
            {cols.map((c) => <Td key={c} className={c === "duration" || c === "frames" || c === "cost" ? "num" : undefined}>{cell(c, s, live)}</Td>)}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function cell(c: Col, s: Session, live?: boolean) {
  switch (c) {
    case "id": return <Link href={`/sessions/${s.id}`} className="whitespace-nowrap font-mono text-xs font-semibold text-brand-strong hover:underline" onClick={(e) => e.stopPropagation()}>{s.id}</Link>;
    case "client": return <span className="text-ink-soft">{clientById(s.clientId)?.name}</span>;
    case "workflow": return <span>{s.workflowName} <span className="text-ink-mute">{s.workflowVersion}</span></span>;
    case "status": return <StatusChip status={s.status} />;
    case "owner": return <OwnerChip owner={s.owner} name={s.humanAgent} />;
    case "duration": return fmtDuration(s.durationSec);
    case "confidence": return <ConfidenceBar value={s.aiConfidence} />;
    case "escalation": return s.escalated ? <span className="inline-flex items-center gap-1 text-xs text-warn"><AlertTriangle size={12} />{s.escalationReason}</span> : <span className="text-xs text-ink-mute">None</span>;
    case "connection": return <ConnectionIndicator q={s.connection} />;
    case "frames": return s.framesAnalysed;
    case "outcome": return <Chip tone={s.outcome.startsWith("Failed") ? "bad" : s.outcome === "In progress" ? "info" : s.outcome.includes("human") ? "human" : "ok"}>{s.outcome}</Chip>;
    case "cost": return gbp(s.cost);
    case "started": return <span className="text-ink-soft">{s.startedAt}</span>;
  }
}
