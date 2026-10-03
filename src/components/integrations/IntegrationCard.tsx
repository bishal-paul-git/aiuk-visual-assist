"use client";
import { Brain, MessageSquare, Mic, Ticket, Users, Video, Workflow, Wrench, type LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui/primitives";
import { statusLabel, statusTone } from "@/lib/data/integrations";
import type { Integration, IntegrationIconKey, IntegrationStatus } from "@/lib/types/integrations";

export const iconMap: Record<IntegrationIconKey, LucideIcon> = { video: Video, mic: Mic, brain: Brain, workflow: Workflow, users: Users, ticket: Ticket, wrench: Wrench, message: MessageSquare };

export const StatusPill = ({ status }: { status: IntegrationStatus }) => <Chip tone={statusTone[status]} dot>{statusLabel[status]}</Chip>;

export function IntegrationCard({ item, status, onOpen }: { item: Integration; status: IntegrationStatus; onOpen: () => void }) {
  const Icon = iconMap[item.icon];
  return (
    <button onClick={onOpen} className="flex flex-col rounded-lg border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-ink-mute focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded border border-line bg-subtle text-ink-soft"><Icon size={18} /></span>
        <StatusPill status={status} />
      </div>
      <h3 className="mt-3 text-[14px] font-semibold">{item.name}</h3>
      <p className="label mt-0.5">{item.category}</p>
      <p className="mt-2 text-[13px] text-ink-soft">{item.purpose}</p>
      <p className="mt-3 border-t border-line pt-2 text-2xs text-ink-mute"><span className="font-semibold text-ink-soft">Architecture role: </span>{item.role}</p>
    </button>
  );
}
