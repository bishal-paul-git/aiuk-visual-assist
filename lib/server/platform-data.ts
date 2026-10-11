import { connection } from "next/server";
import { getRuntime } from "./runtime";

export const STATIC_EXPORT = process.env.STATIC_EXPORT === "1";

/**
 * Entry point for platform pages: render per request from the live runtime.
 * The static demo build prerenders a snapshot of the seeded runtime instead.
 */
export async function platformRuntime() {
  if (!STATIC_EXPORT) await connection();
  return getRuntime();
}

/** Search params are a request-time API; the static build renders the unfiltered view. */
export async function staticSafeSearchParams<T extends object>(sp: Promise<T>): Promise<T> {
  return STATIC_EXPORT ? ({} as T) : sp;
}
