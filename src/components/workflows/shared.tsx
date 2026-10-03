import { Chip, type Tone } from "@/components/ui/primitives";
import type { Workflow } from "@/lib/data/workflows";

type WfStatus = Workflow["status"];
const tone: Record<WfStatus, Tone> = { published: "ok", draft: "neutral", in_review: "warn" };
export const wfStatusLabel: Record<WfStatus, string> = { published: "Published", draft: "Draft", in_review: "In review" };
export const WorkflowStatusChip = ({ status }: { status: WfStatus }) => <Chip tone={tone[status]} dot>{wfStatusLabel[status]}</Chip>;

export function CompletionBar({ value }: { value: number }) {
  if (!value) return <span className="text-ink-mute">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${value}%` }} /></div>
      <span className="num w-8 text-xs text-ink-soft">{value}%</span>
    </div>
  );
}
