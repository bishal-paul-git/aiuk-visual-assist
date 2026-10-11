"use client";

import { Check, X } from "lucide-react";
import type { VisualEvent, VisualObservation } from "@/lib/domain/types";
import { formatTimeSec, humanizeTrigger } from "./format";
import { ConfidenceMeter, ObservationStatusBadge } from "@/components/domain/badges";
import { Badge, EmptyState, cx } from "@/components/ui/primitives";
import { isUncertain } from "@/lib/session/handover";

export function Filmstrip({
  frames,
  selected,
  onSelect,
  frameSrc,
}: {
  frames: VisualEvent[];
  selected?: string;
  onSelect: (id: string) => void;
  frameSrc: (f: VisualEvent) => string;
}) {
  if (frames.length === 0) return <p className="text-xs text-muted">No frames selected yet. Frames are captured only when the workflow or an agent asks for evidence.</p>;
  return (
    <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Selected evidence frames">
      {frames.map((f, i) => (
        <li key={f.id} className="shrink-0">
          <button
            type="button"
            onClick={() => onSelect(f.id)}
            aria-pressed={selected === f.id}
            className={cx("block w-28 overflow-hidden rounded-md border-2 text-left", selected === f.id ? "border-brand" : "border-transparent hover:border-line-strong")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frameSrc(f)} alt={`Frame ${i + 1}: ${f.checkpoint ?? f.triggerType}`} className="aspect-[4/3] w-full bg-surface-2 object-cover" loading="lazy" />
            <span className="block truncate bg-surface-2 px-1.5 py-1 text-[10px] text-ink-2">
              #{i + 1} · {(f.checkpoint ?? humanizeTrigger(f.triggerType)).replace(/_/g, " ")}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function ObservationList({
  observations,
  frames,
  threshold,
  canReview,
  onReview,
  onInspect,
  emptyText = "No observations yet.",
}: {
  observations: VisualObservation[];
  frames: VisualEvent[];
  threshold: number;
  canReview: boolean;
  onReview: (id: string, verdict: "confirmed" | "rejected") => void;
  onInspect: (frameId: string) => void;
  emptyText?: string;
}) {
  if (observations.length === 0) return <EmptyState title={emptyText} />;
  return (
    <ul className="divide-y divide-line">
      {observations.map((o) => {
        const frameIdx = frames.findIndex((f) => f.id === o.visualEventId);
        const flagged = isUncertain(o);
        return (
          <li key={o.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{o.observationText}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <ObservationStatusBadge status={o.status} />
                  {o.requiresConfirmation && !o.humanReview && <Badge tone="warn">Needs confirmation</Badge>}
                  {o.humanReview && (
                    <Badge tone={o.humanReview.verdict === "confirmed" ? "ok" : "danger"}>
                      {o.humanReview.verdict === "confirmed" ? "Confirmed by agent" : "Rejected by agent"}
                    </Badge>
                  )}
                  {frameIdx >= 0 && (
                    <button type="button" onClick={() => onInspect(o.visualEventId)} className="text-[11px] font-medium text-brand hover:underline">
                      Frame #{frameIdx + 1}
                    </button>
                  )}
                  <span className="text-[11px] text-muted">{formatTimeSec(o.timestamp)}</span>
                </div>
              </div>
              <ConfidenceMeter value={o.confidence} threshold={threshold} compact />
            </div>
            {canReview && flagged && !o.humanReview && (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onReview(o.id, "confirmed")} className="inline-flex items-center gap-1 rounded-md border border-ok/40 bg-ok-soft px-2 py-1 text-[11px] font-medium text-ok">
                  <Check className="size-3" aria-hidden /> Confirm
                </button>
                <button type="button" onClick={() => onReview(o.id, "rejected")} className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger-soft px-2 py-1 text-[11px] font-medium text-danger">
                  <X className="size-3" aria-hidden /> Reject
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
