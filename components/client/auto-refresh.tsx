"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads a server-rendered page every few seconds while it is visible, so lists stay current. */
export function AutoRefresh({ everyMs = 8000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
