import { Chip, type Tone } from "./primitives";
import { statusMeta } from "@/lib/data/sessions";
import type { ConnectionQuality, Owner, SessionStatus, ObservationStatus } from "@/lib/types";
import { Bot, UserRound } from "lucide-react";
import { cn } from "./cn";

export const StatusChip = ({ status }: { status: SessionStatus }) => {
  const m = statusMeta[status];
  const live = !["resolved", "failed"].includes(status);
  return <Chip tone={m.tone} dot pulse={live}>{m.label}</Chip>;
};

export const OwnerChip = ({ owner, name }: { owner: Owner; name?: string }) =>
  owner === "AI" ? (
    <Chip tone="brand"><Bot size={11} />AI</Chip>
  ) : (
    <Chip tone="human"><UserRound size={11} />{name ?? "Human"}</Chip>
  );

const connTone: Record<ConnectionQuality, { tone: Tone; bars: number }> = { excellent: { tone: "ok", bars: 4 }, good: { tone: "ok", bars: 3 }, fair: { tone: "warn", bars: 2 }, poor: { tone: "bad", bars: 1 } };
export function ConnectionIndicator({ q, label = true }: { q: ConnectionQuality; label?: boolean }) {
  const { bars, tone } = connTone[q];
  const color = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-bad";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft" title={`Connection: ${q}`}>
      <span className="flex items-end gap-px" aria-hidden>
        {[1, 2, 3, 4].map((i) => <span key={i} className={cn("w-[3px] rounded-sm", i <= bars ? color : "bg-line")} style={{ height: 3 + i * 2.5 }} />)}
      </span>
      {label && <span className="capitalize">{q}</span>}
    </span>
  );
}

const obsMeta: Record<ObservationStatus, { label: string; tone: Tone }> = {
  confirmed_visible: { label: "Confirmed", tone: "ok" }, likely_visible: { label: "Likely", tone: "info" }, uncertain: { label: "Uncertain", tone: "warn" },
  unreadable: { label: "Unreadable", tone: "bad" }, not_visible: { label: "Not visible", tone: "neutral" }, conflicting_evidence: { label: "Conflicting", tone: "warn" }, needs_another_view: { label: "Needs another view", tone: "warn" },
};
export const ObservationChip = ({ status }: { status: ObservationStatus }) => <Chip tone={obsMeta[status].tone}>{obsMeta[status].label}</Chip>;
