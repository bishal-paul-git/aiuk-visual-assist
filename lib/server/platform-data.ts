import { connection } from "next/server";
import { getRuntime } from "./runtime";
import { requirePageUser } from "./auth";
import type { Permission } from "@/lib/auth/rbac";

export const STATIC_EXPORT = process.env.STATIC_EXPORT === "1";

/**
 * Entry point for platform pages: render per request from the live runtime,
 * for a signed-in user allowed to use the management platform (redirects to
 * sign-in otherwise). The static demo build prerenders a snapshot of the
 * seeded runtime instead, with no sign-in.
 */
export async function platformRuntime(permission: Permission = "platform.access", next = "/platform") {
  if (!STATIC_EXPORT) {
    await connection();
    await requirePageUser(permission, next);
  }
  return getRuntime();
}

/** Search params are a request-time API; the static build renders the unfiltered view. */
export async function staticSafeSearchParams<T extends object>(sp: Promise<T>): Promise<T> {
  return STATIC_EXPORT ? ({} as T) : sp;
}
