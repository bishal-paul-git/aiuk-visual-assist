import { cookies } from "next/headers";
import { getIdentityProvider, toPublicUser } from "@/lib/auth/identity";
import { homePathFor } from "@/lib/auth/rbac";
import { newSessionClaims, signSession, SESSION_TTL_SEC } from "@/lib/auth/session-token";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { SESSION_COOKIE, authError, authSecret, safeNextPath } from "@/lib/server/auth";
import { readJson, str } from "@/lib/server/http";

/**
 * Demo sign-in: no password, the user picks a catalog identity. An OIDC
 * provider would redirect to the IdP here and complete in a callback route.
 */
export async function POST(request: Request) {
  const body = await readJson(request, 4_000);
  const idp = getIdentityProvider();
  const userId = str(body?.userId, 80) ?? undefined;
  const result = await idp.completeSignIn({ userId });
  if (!result.ok) {
    recordSecurityEvent({ eventType: "security.sign_in_failed", payload: { provider: idp.id, attemptedUserId: userId ?? null, reason: result.reason } });
    return authError(401, "Sign-in failed");
  }
  const user = idp.resolveUser(result.subject)!;
  const claims = newSessionClaims(user.id, idp.id);
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_COOKIE, signSession(claims, authSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  recordSecurityEvent({ eventType: "security.signed_in", user, payload: { provider: idp.id, sessionId: claims.sid } });
  return Response.json({ user: toPublicUser(user), next: safeNextPath(body?.next) ?? homePathFor(user) });
}
