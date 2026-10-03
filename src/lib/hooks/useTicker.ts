"use client";
import { useEffect, useState } from "react";

/** Seconds elapsed since mount — starts at 0 on both server and client to avoid hydration mismatch. */
export function useTicker(active = true, intervalMs = 1000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((x) => x + 1), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return n;
}
