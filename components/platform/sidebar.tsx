"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headset } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cx } from "@/components/ui/primitives";
import { NAV } from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/platform" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Platform" className="flex h-full flex-col bg-navy text-white">
      <div className="flex h-14 items-center border-b border-white/10 px-4">
        <Link href="/platform" className="rounded-md">
          <Logo inverted />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">{g.group}</div>
            <ul>
              {g.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                        active ? "bg-white/12 font-medium text-white" : "text-white/70 hover:bg-white/6 hover:text-white",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <Link
          href="/console"
          className="flex items-center justify-center gap-2 rounded-md bg-white/10 px-3 py-2 text-[13px] font-medium text-white hover:bg-white/15"
        >
          <Headset className="size-4" aria-hidden /> Open Agent Console
        </Link>
      </div>
    </nav>
  );
}
