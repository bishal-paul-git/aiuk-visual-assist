import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/lib/domain/types";
import { can, denialMessage, type Permission, type TenantResource } from "@/lib/auth/rbac";
import type { IdentityProvider } from "@/lib/auth/identity";
import { newSessionClaims, signSession, verifySession, SESSION_TTL_SEC, type SessionClaims } from "@/lib/auth/session-token";
import { actorTypeFor, recordSecurityEvent } from "@/lib/auth/security-log";
import { authSecret } from "@/lib/server/auth-secret";
import { getIdentityProvider } from "@/lib/server/identity-provider";
import type { Actor } from "@/lib/session/orchestrator";

/**
 * Server-side authentication and authorisation (server edition only; the
 * static demo excludes route handlers and uses a browser demo identity).
 */

export const SESSION_COOKIE = "va_session";
const STATIC_EXPORT = process.env.STATIC_EXPORT === "1";

export { authSecret };

export interface CurrentSession {
  user: User;
  provider: IdentityProvider;
  claims: SessionClaims;
}

/**
 * Resolve a raw cookie value to an active user. Roles and tenant always come
 * from the identity provider, and only from a provider that is still enabled
 * (a demo session stops working once OIDC is configured).
 */
export function sessionFromToken(token: string | undefined): CurrentSession | null {
  const v = verifySession(token, authSecret());
  if (!v.ok) return null;
  const provider = getIdentityProvider(v.claims.idp);
  const user = provider?.resolveUser(v.claims.sub);
  return provider && user ? { user, provider, claims: v.claims } : null;
}

export function userFromToken(token: string | undefined): User | null {
  return sessionFromToken(token)?.user ?? null;
}

export async function currentSession(): Promise<CurrentSession | null> {
  const jar = await cookies();
  return sessionFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function currentUser(): Promise<User | null> {
  return (await currentSession())?.user ?? null;
}

/** True when the request reached us over HTTPS (directly or through a TLS-terminating proxy). */
export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

/** Public origin plus base path. PUBLIC_BASE_URL wins (correct behind proxies); otherwise the request's own origin. */
export function publicBaseUrl(request: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return `${configured || new URL(request.url).origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
}

/** Issue the signed, HttpOnly session cookie for `user`. */
export async function startSession(user: User, provider: IdentityProvider, request: Request): Promise<SessionClaims> {
  const claims = newSessionClaims(user.id, provider.id);
  (await cookies()).set(SESSION_COOKIE, signSession(claims, authSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return claims;
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
export async function requirePageUser(permission: Permission, next: string, resource?: TenantResource, signInPath = "/sign-in"): Promise<User | null> {
  if (STATIC_EXPORT) return null;
  const user = await currentUser();
  const target = safeNextPath(next) ?? "/";
  if (!user) redirect(`${signInPath}?next=${encodeURIComponent(target)}`);
  if (!can(user, permission, resource)) {
    recordSecurityEvent({ eventType: "security.permission_denied", user, payload: { permission, page: target, resourceTenantId: resource?.tenantId } });
    redirect(`${signInPath}?denied=${encodeURIComponent(permission)}&next=${encodeURIComponent(target)}`);
  }
  return user;
}
