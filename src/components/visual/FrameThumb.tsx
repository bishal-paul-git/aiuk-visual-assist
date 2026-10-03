import { cn } from "@/components/ui/cn";
import type { Frame } from "@/lib/types";
import { Scene } from "./Scene";

const trig: Record<Frame["trigger"], string> = {
  workflow_checkpoint: "Checkpoint", customer_language: "Customer asked", scene_change: "Scene change", ai_request: "AI request", periodic_sample: "Periodic", human_request: "Human captured",
};
export function FrameThumb({ frame, active, onClick, compact }: { frame: Frame; active?: boolean; onClick?: () => void; compact?: boolean }) {
  const low = frame.quality < 0.6;
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("group overflow-hidden rounded border bg-surface text-left", active ? "border-brand ring-2 ring-brand/30" : "border-line hover:border-ink-mute")}>
      <div className="relative aspect-[16/10] bg-black">
        <Scene kind={frame.scene} className="h-full w-full" blink={false} />
        <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">{frame.id}</span>
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">{frame.at}</span>
        {low && <span className="absolute right-1 top-1 rounded bg-amber-500 px-1 text-[10px] font-bold text-black">LOW Q</span>}
      </div>
      {!compact && (
        <div className="px-2 py-1.5">
          <p className="truncate text-xs font-medium">{frame.label}</p>
          <p className="truncate text-2xs text-ink-mute">{trig[frame.trigger]} · q {frame.quality.toFixed(2)}</p>
        </div>
      )}
    </button>
  );
}
