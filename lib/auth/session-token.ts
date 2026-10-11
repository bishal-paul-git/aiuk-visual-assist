import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed session token carried in an HttpOnly cookie (server edition).
 *
 * Format: `v1.<base64url(JSON claims)>.<base64url(HMAC-SHA256(secret, "v1." + payload))>`.
 * The token only proves who signed in and when; roles and tenant are looked up
 * from the identity provider on every request, so a role change or disabled
 * account takes effect immediately.
 */

export const SESSION_TTL_SEC = 8 * 60 * 60;

export interface SessionClaims {
  /** User id (subject) in the identity provider. */
  sub: string;
  /** Identity provider that authenticated the user, e.g. "demo" or "oidc". */
  idp: string;
  /** Issued at / expires at, epoch seconds. */
  iat: number;
  exp: number;
  /** Random session id, for audit correlation. */
  sid: string;
}

const VERSION = "v1";

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function mac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signSession(claims: SessionClaims, secret: string): string {
  const payload = b64url(JSON.stringify(claims));
  return `${VERSION}.${payload}.${b64url(mac(secret, `${VERSION}.${payload}`))}`;
}

export type VerifyResult = { ok: true; claims: SessionClaims } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifySession(token: string | undefined | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): VerifyResult {
  if (!token || token.length > 2048) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "malformed" };
  const [, payload, sig] = parts;
  const expected = mac(secret, `${VERSION}.${payload}`);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims?.sub !== "string" || typeof claims.exp !== "number" || typeof claims.iat !== "number" || typeof claims.idp !== "string") {
    return { ok: false, reason: "malformed" };
  }
  if (claims.exp <= nowSec || claims.iat > nowSec + 60) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

export function newSessionClaims(sub: string, idp: string, nowSec = Math.floor(Date.now() / 1000), ttlSec = SESSION_TTL_SEC): SessionClaims {
  return { sub, idp, iat: nowSec, exp: nowSec + ttlSec, sid: globalThis.crypto.randomUUID() };
}
