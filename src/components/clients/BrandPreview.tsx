import { Mic, Video } from "lucide-react";
import { InitialsBlock } from "./shared";

/** Mini mock of the customer-facing header, rendered in the tenant's brand. */
export function BrandPreview({ name, initials, accent, welcome = "Visual support session" }: { name: string; initials: string; accent: string; welcome?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface" aria-label="Customer-facing header preview">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5" style={{ background: accent }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <InitialsBlock initials={initials} color="rgba(255,255,255,.18)" size={28} />
          <div className="min-w-0 text-white">
            <p className="truncate text-[13px] font-semibold leading-tight">{name}</p>
            <p className="truncate text-2xs opacity-80">{welcome}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-white/90"><Video size={14} /><Mic size={14} /></div>
      </div>
      <div className="space-y-2 bg-subtle/60 p-3.5">
        <div className="h-16 rounded bg-line/70" />
        <button className="h-8 w-full rounded text-xs font-semibold text-white" style={{ background: accent }} tabIndex={-1}>Share camera</button>
      </div>
    </div>
  );
}
