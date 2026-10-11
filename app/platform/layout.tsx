import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { Sidebar } from "@/components/platform/sidebar";
import { MobileNav } from "@/components/platform/mobile-nav";
import { TestSessionLauncher } from "@/components/shared/test-session-launcher";

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-[13px] font-semibold text-ink">AIUK Management Platform</span>
            <span className="hidden items-center gap-1 rounded-md border border-dashed border-warn/40 bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn sm:inline-flex">
              <FlaskConical className="size-3" aria-hidden />{" "}
              {process.env.NEXT_PUBLIC_STATIC_DEMO === "1" ? "Static demo · reports are a build snapshot · sessions run in your browser" : "POC environment · simulated AI providers"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <TestSessionLauncher />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex size-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">JC</span>
              <span className="text-xs leading-tight">
                <span className="block font-medium text-ink">James Carter</span>
                <span className="block text-muted">AIUK Administrator</span>
              </span>
            </div>
          </div>
        </header>
        <MobileNav />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
