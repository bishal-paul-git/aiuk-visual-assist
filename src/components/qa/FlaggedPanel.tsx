"use client";
import { AlertTriangle } from "lucide-react";
import { Chip, ConfidenceBar, EmptyState, Panel, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { flagLabel } from "@/lib/data/qa";
import type { QaFlag } from "@/lib/types/qa";

export function FlaggedPanel({ flags, onOpen }: { flags: QaFlag[]; onOpen: (sessionId: string) => void }) {
  return (
    <Panel title="Flagged observations" subtitle="Hallucination and low-confidence flags across filtered sessions" flush
      actions={<Chip tone={flags.length ? "warn" : "neutral"}><AlertTriangle size={11} />{flags.length}</Chip>}>
      {flags.length === 0 ? <EmptyState title="No flagged observations" /> : (
        <Table>
          <thead><tr><Th>Session</Th><Th>Flag</Th><Th>Observation</Th><Th>Confidence</Th></tr></thead>
          <tbody>
            {flags.slice(0, 12).map((f) => (
              <Tr key={f.sessionId + f.observationId} onClick={() => onOpen(f.sessionId)}>
                <Td className="num font-medium">{f.sessionId}</Td>
                <Td><Chip tone={f.kind === "hallucination" ? "bad" : "warn"}>{flagLabel[f.kind]}</Chip></Td>
                <Td className="max-w-md truncate text-ink-soft">{f.text}</Td>
                <Td><ConfidenceBar value={f.confidence} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {flags.length > 12 && <p className="border-t border-line px-4 py-2 text-2xs text-ink-mute">Showing 12 of {flags.length}. Narrow with the filters above.</p>}
    </Panel>
  );
}
