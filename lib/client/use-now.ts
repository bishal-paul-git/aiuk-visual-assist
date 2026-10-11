"use client";

import { useSyncExternalStore } from "react";

/**
 * A 1-second clock that hydrates without mismatches: server render and
 * hydration use the server's timestamp, then the client ticks.
 */
let current = typeof window === "undefined" ? 0 : Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(serverNow: number): number {
  return useSyncExternalStore(subscribe, () => current || serverNow, () => serverNow);
}
