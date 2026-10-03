"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { demoSurfaces, navGroups } from "./nav";
import { useSessions } from "@/lib/services/sessions";
import { isLiveStatus } from "@/lib/data/sessions";

export function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <div className="grid h-8 w-8 place-items-center rounded bg-brand text-[13px] font-bold text-white">AI</div>
      <div className="leading-tight">
        <p className="text-[13px] font-semibold text-white">Visual Assist</p>
        <p className="text-2xs text-nav-ink">Absolute Intelligence UK</p>
      </div>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const liveCount = useSessions({ respectClientFilter: false }).filter((s) => isLiveStatus(s.status)).length;
  return (
    <nav aria-label="Primary" className="flex h-full flex-col bg-nav">
      <Brand />
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
        {navGroups.map((g) => (
          <div key={g.title} className="mb-3">
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-nav-ink/60">{g.title}</p>
            {g.items.map((i) => {
              const active = path === i.href || path.startsWith(i.href + "/");
              return (
                <Link key={i.href} href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                  className={cn("mb-px flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px] transition-colors", active ? "bg-nav-hover font-medium text-white" : "text-nav-ink hover:bg-nav-hover hover:text-white")}>
                  <i.icon size={15} className={active ? "text-brand" : undefined} />
                  <span className="flex-1">{i.label}</span>
                  {"live" in i && i.live && <span className="num rounded bg-brand/20 px-1.5 text-2xs font-semibold text-brand">{liveCount}</span>}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mt-2 border-t border-nav-line pt-3">
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-nav-ink/60">Product surfaces</p>
          {demoSurfaces.map((i) => (
            <Link key={i.href} href={i.href} className="flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px] text-nav-ink hover:bg-nav-hover hover:text-white">
              <i.icon size={15} /><span className="flex-1">{i.label}</span><ExternalLink size={11} className="opacity-50" />
            </Link>
          ))}
        </div>
      </div>
      <div className="border-t border-nav-line px-4 py-3 text-2xs text-nav-ink">
        <p className="font-medium text-white/80">Phase 1 · Visual MVP</p>
        <p>Mock data only · no live integrations</p>
      </div>
    </nav>
  );
}
