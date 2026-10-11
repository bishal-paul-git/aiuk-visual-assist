"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";
import { NAV } from "./nav";

/** Compact horizontal navigation for screens without the sidebar. */
export function MobileNav() {
  const pathname = usePathname();
  const items = NAV.flatMap((g) => g.items);
  return (
    <nav aria-label="Platform" className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:hidden">
      {items.map((item) => {
        const active = item.href === "/platform" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx("flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs", active ? "bg-navy font-medium text-white" : "text-ink-2 hover:bg-surface-2")}
          >
            <item.icon className="size-3.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
