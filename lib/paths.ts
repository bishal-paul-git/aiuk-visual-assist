/**
 * Route helpers shared by server and client components. In the static demo
 * build, sessions are addressed with query strings because sessions created in
 * the browser have no prerendered page.
 */
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function customerPath(token: string): string {
  return STATIC_DEMO ? `/assist/s/?t=${encodeURIComponent(token)}` : `/assist/${token}`;
}

export function consolePath(id: string): string {
  return STATIC_DEMO ? `/console/s/?id=${encodeURIComponent(id)}` : `/console/sessions/${id}`;
}
