import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/lib/domain/types";
import { can, denialMessage, type Permission, type TenantResource } from "@/lib/auth/rbac";
import { getIdentityProvider } from "@/lib/auth/identity";
import { verifySession } from "@/lib/auth/session-token";
import { actorTypeFor, recordSecurityEvent } from "@/lib/auth/security-log";
import type { Actor } from "@/lib/session/orchestrator";

/**
 * Server-side authentication and authorisation (server edition only; the
 * static demo excludes route handlers and uses a browser demo identity).
 */

export const SESSION_COOKIE = "va_session";
const STATIC_EXPORT = process.env.STATIC_EXPORT === "1";

const g = globalThis as unknown as { __aiukAuthSecret?: string };

/**
 * HMAC secret for session cookies. Set AUTH_SECRET (32+ characters) in every
 * deployed environment. Without it a random per-process secret is used, so
 * sessions do not survive a restart, and a warning is logged.
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

/** Resolve a raw cookie value to an active user. Roles and tenant always come from the identity provider. */
export function userFromToken(token: string | undefined): User | null {
  const v = verifySession(token, authSecret());
  if (!v.ok) return null;
  const idp = getIdentityProvider();
  if (v.claims.idp !== idp.id) return null;
  return idp.resolveUser(v.claims.sub) ?? null;
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export function actorFor(user: User): Actor {
  return { type: actorTypeFor(user), id: user.id, name: user.name };
}

export function authError(status: 401 | 403, message: string): Response {
  return Response.json({ error: message, code: status === 401 ? "unauthenticated" : "forbidden" }, { status });
}

export type AuthResult = { ok: true; user: User } | { ok: false; response: Response };

/**
 * Authorise the signed-in user for `permission` (optionally on a tenant-owned
 * resource). Returns a 401/403 JSON response to send back when not allowed;
 * denials are recorded in the security audit trail.
 */
export async function authorize(permission: Permission, resource?: TenantResource, context: Record<string, unknown> = {}): Promise<AuthResult> {
  const user = await currentUser();
  return checkUser(user, permission, resource, context);
}

export function checkUser(user: User | null, permission: Permission, resource?: TenantResource, context: Record<string, unknown> = {}): AuthResult {
  if (!user) return { ok: false, response: authError(401, "Sign in required") };
  if (can(user, permission, resource)) return { ok: true, user };
  recordSecurityEvent({
    eventType: "security.permission_denied",
    user,
    payload: { permission, resourceTenantId: resource?.tenantId, ...context },
  });
  return { ok: false, response: authError(403, denialMessage(user, permission, resource)) };
}

/** Accept only same-origin relative paths as post-sign-in destinations (no open redirects). */
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
  return value.length > 300 ? undefined : value;
}

/**
 * Guard for server-rendered pages. Redirects to sign-in when signed out or not
 * permitted. A no-op in the static demo build (no server, demo identity).
 */
export async function requirePageUser(permission: Permission, next: string, resource?: TenantResource): Promise<User | null> {
  if (STATIC_EXPORT) return null;
  const user = await currentUser();
  const target = safeNextPath(next) ?? "/";
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(target)}`);
  if (!can(user, permission, resource)) {
    recordSecurityEvent({ eventType: "security.permission_denied", user, payload: { permission, page: target, resourceTenantId: resource?.tenantId } });
    redirect(`/sign-in?denied=${encodeURIComponent(permission)}&next=${encodeURIComponent(target)}`);
  }
  return user;
}
