import type { ReactNode } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AgentPicker } from "@/components/console/agent-identity";
import { TestSessionLauncher } from "@/components/shared/test-session-launcher";

export const metadata = { title: { default: "Agent Console", template: "%s · Agent Console" } };

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 bg-navy px-4 pt-[env(safe-area-inset-top)] text-white">
        <div className="flex items-center gap-4">
          <Link href="/console" className="rounded-md">
            <Logo inverted product={false} />
          </Link>
          <nav className="hidden items-center gap-1 text-[13px] sm:flex">
            <Link href="/console" className="rounded-md px-2.5 py-1.5 font-medium whitespace-nowrap text-white hover:bg-white/10">
              Live queue
            </Link>
            <Link href="/platform" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">
              <LayoutGrid className="size-3.5" aria-hidden /> Platform
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden lg:block">
            <TestSessionLauncher variant="navy" />
          </span>
          <AgentPicker />
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
