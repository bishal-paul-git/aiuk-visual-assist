import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Optional password for the demo person-picker (the staff and team accounts
 * on the sign-in pages). Without it anyone who finds the address can pick any
 * account, which is fine for a closed demo but not for a server with live AI
 * and text messaging behind it. Set STAFF_SIGNIN_PASSWORD (8+ characters) and
 * every pick needs it. The trial login has its own ready-made password and is
 * not affected.
 */

type Env = Record<string, string | undefined>;

export function staffPasswordRequired(env: Env = process.env): boolean {
  return (env.STAFF_SIGNIN_PASSWORD?.length ?? 0) >= 8;
}

export function checkStaffPassword(password: string, env: Env = process.env): boolean {
  const expected = env.STAFF_SIGNIN_PASSWORD ?? "";
  const sha = (v: string) => createHash("sha256").update(v).digest();
  return expected.length >= 8 && timingSafeEqual(sha(password), sha(expected));
}
