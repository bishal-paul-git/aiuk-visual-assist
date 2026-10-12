"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. `serverValue` is used for prerendering and
 * the first hydration pass, so markup matches the static HTML.
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Tailwind's `lg` breakpoint: the demo stage shows both views side by side. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
