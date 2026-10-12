import { randomBytes } from "node:crypto";

const g = globalThis as unknown as { __aiukAuthSecret?: string };

/**
 * HMAC secret for session and sign-in transaction cookies. Set AUTH_SECRET
 * (32+ characters) in every deployed environment. Without it a random
 * per-process secret is used, so sessions do not survive a restart, and a
 * warning is logged.
 */
export function authSecret(): string {
  const env = process.env.AUTH_SECRET;
  if (env && env.length >= 32) return env;
  if (!g.__aiukAuthSecret) {
    console.warn(
      env
        ? "[auth] AUTH_SECRET is shorter than 32 characters and was ignored; using a random per-process secret."
        : "[auth] AUTH_SECRET is not set; using a random per-process secret (development only). Set AUTH_SECRET in deployed environments.",
    );
    g.__aiukAuthSecret = randomBytes(32).toString("base64url");
  }
  return g.__aiukAuthSecret;
}
