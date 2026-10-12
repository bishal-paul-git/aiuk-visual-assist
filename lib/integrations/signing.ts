import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing for client integrations (docs/INTEGRATION-CONTRACT.md §4).
 *
 *   X-VA-Timestamp: <unix seconds>
 *   X-VA-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
 *
 * The timestamp is inside the signed payload, so a captured request cannot be
 * replayed outside the receiver's tolerance window.
 */

export const SIGNATURE_VERSION = "v1";
export const DEFAULT_TOLERANCE_SEC = 300;

export function computeSignature(secret: string, timestamp: number | string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, timestamp: number, body: string): string {
  return `${SIGNATURE_VERSION}=${computeSignature(secret, timestamp, body)}`;
}

/** Receiver-side check (used by tests; the reference client API has its own copy). */
export function verifySignature(
  secret: string,
  header: string | null | undefined,
  timestamp: string | null | undefined,
  body: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = DEFAULT_TOLERANCE_SEC,
): boolean {
  if (!header || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) return false;
  const expected = Buffer.from(computeSignature(secret, timestamp, body), "hex");
  return header
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${SIGNATURE_VERSION}=`))
    .some((p) => {
      const got = Buffer.from(p.slice(SIGNATURE_VERSION.length + 1), "hex");
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}
