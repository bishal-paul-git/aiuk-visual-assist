import { cookies } from "next/headers";
import { OIDC_ID_TOKEN_COOKIE, OIDC_TX_COOKIE, unsealTransaction } from "@/lib/auth/oidc";
import { homePathFor } from "@/lib/auth/rbac";
import { SESSION_TTL_SEC } from "@/lib/auth/session-token";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { authSecret, isSecureRequest, safeNextPath, startSession } from "@/lib/server/auth";
import { identityProviders } from "@/lib/server/identity-provider";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Keep the ID token for the logout hint only while it fits comfortably in a cookie. */
const MAX_ID_TOKEN_COOKIE = 3500;

function redirectTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${BASE_PATH}${path}`, "Cache-Control": "no-store" } });
}

/**
 * OIDC redirect URI: `GET /api/auth/callback?code=…&state=…`. Completes the
 * sign-in started by `GET /api/auth/sign-in`, issues the session cookie and
 * sends the user on. Failures go back to /sign-in with a stable error code.
 */
export async function GET(request: Request) {
  const { oidc } = identityProviders();
  if (!oidc) return redirectTo("/sign-in?error=invalid_request");
  const jar = await cookies();
  const transaction = jar.get(OIDC_TX_COOKIE)?.value;
  // One attempt per transaction, whatever the outcome.
  jar.delete({ name: OIDC_TX_COOKIE, path: `${BASE_PATH}/api/auth` });

  const q = new URL(request.url).searchParams;
  const result = await oidc.completeSignIn({
    code: q.get("code") ?? undefined,
    state: q.get("state") ?? undefined,
    error: q.get("error") ?? undefined,
    error_description: q.get("error_description") ?? undefined,
    transaction,
  });

  if (!result.ok) {
    recordSecurityEvent({ eventType: "security.sign_in_failed", payload: { provider: oidc.id, code: result.code, reason: result.reason } });
    return redirectTo(`/sign-in?error=${encodeURIComponent(result.code)}`);
  }

  const user = oidc.resolveUser(result.subject)!;
  const claims = await startSession(user, oidc, request);
  if (result.idToken && result.idToken.length <= MAX_ID_TOKEN_COOKIE) {
    jar.set(OIDC_ID_TOKEN_COOKIE, result.idToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(request),
      path: `${BASE_PATH}/api/auth`,
      maxAge: SESSION_TTL_SEC,
    });
  }
  recordSecurityEvent({
    eventType: "security.signed_in",
    user,
    payload: { provider: oidc.id, sessionId: claims.sid, ...result.claims },
  });

  const returnTo = safeNextPath(unsealTransaction(transaction, authSecret(), Math.floor(Date.now() / 1000))?.returnTo);
  return redirectTo(returnTo ?? homePathFor(user));
}
