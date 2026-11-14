import { createHash, timingSafeEqual } from "node:crypto";
import { tenants, users } from "@/lib/config/catalog";
import type { User } from "@/lib/domain/types";

/**
 * Private clients hold real customer data (e.g. a live pilot). Their staff are
 * never listed on the demo sign-in pickers and can only sign in with their
 * email plus the client's own password, or through company single sign-on.
 *
 * CLIENT_SIGNIN_PASSWORDS = {"tnt_hometelecom": "<12+ characters>"}. A private
 * client without a password configured cannot be signed in to at all (fails closed).
 */

type Env = Record<string, string | undefined>;
export const MIN_CLIENT_PASSWORD = 12;

export function isPrivateTenant(tenantId: string | undefined): boolean {
  return Boolean(tenantId && tenants.find((t) => t.id === tenantId)?.featureFlags.private_client);
}

export function isPrivateUser(user: Pick<User, "tenantId"> | undefined): boolean {
  return Boolean(user && isPrivateTenant(user.tenantId));
}

function passwords(env: Env): Record<string, string> {
  try {
    const parsed = JSON.parse(env.CLIENT_SIGNIN_PASSWORDS ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

export function clientPasswordConfigured(tenantId: string, env: Env = process.env): boolean {
  return (passwords(env)[tenantId]?.length ?? 0) >= MIN_CLIENT_PASSWORD;
}

export function checkClientPassword(tenantId: string, password: string, env: Env = process.env): boolean {
  const expected = passwords(env)[tenantId] ?? "";
  if (expected.length < MIN_CLIENT_PASSWORD) return false;
  const sha = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(sha(password), sha(expected));
}

/** The active private-client user with this email, if any. */
export function privateUserByEmail(email: string): User | undefined {
  const e = email.trim().toLowerCase();
  if (!e) return undefined;
  return users.find((u) => u.status === "active" && u.email.toLowerCase() === e && isPrivateUser(u));
}

/** Any private clients configured on this server (shows the client staff sign-in form). */
export function anyPrivateClient(): boolean {
  return tenants.some((t) => t.featureFlags.private_client);
}
