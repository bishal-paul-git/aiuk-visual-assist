import { cookies } from "next/headers";
import { toPublicUser } from "@/lib/auth/identity";
import { OIDC_TX_COOKIE, OIDC_TX_TTL_SEC } from "@/lib/auth/oidc";
import { homePathFor, needsStaffPassword } from "@/lib/auth/rbac";
import { users } from "@/lib/config/catalog";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { authError, isSecureRequest, publicBaseUrl, safeNextPath, startSession } from "@/lib/server/auth";
import { identityProviders } from "@/lib/server/identity-provider";
import { readJson, str } from "@/lib/server/http";
import { TRIAL_USER_ID } from "@/lib/auth/trial";
import { checkStaffPassword, staffPasswordRequired } from "@/lib/server/staff-password";
import { trialFailures } from "@/lib/server/trial";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Workforce single sign-on (OIDC): `GET /api/auth/sign-in?next=/platform`
 * redirects to the identity provider. The sign-in attempt (state, nonce, PKCE
 * verifier) is kept in a short-lived, encrypted and signed, HttpOnly cookie and completed in
 * /api/auth/callback.
 */
export async function GET(request: Request) {
  const { oidc } = identityProviders();
  if (!oidc) return authError(401, "Single sign-on is not configured");
  const returnTo = safeNextPath(new URL(request.url).searchParams.get("next"));
  let start;
  try {
    start = await oidc.beginSignIn({ returnTo, baseUrl: publicBaseUrl(request) });
  } catch (e) {
    recordSecurityEvent({ eventType: "security.sign_in_failed", payload: { provider: oidc.id, code: "idp_unavailable", reason: (e as Error).message } });
    return new Response(null, { status: 303, headers: { Location: `${BASE_PATH}/sign-in?error=idp_unavailable`, "Cache-Control": "no-store" } });
  }
  if (start.kind !== "redirect") return authError(401, "Sign-in failed");
  (await cookies()).set(OIDC_TX_COOKIE, start.transaction, {
    httpOnly: true,
    // Lax: the IdP returns with a top-level GET, which carries Lax cookies.
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: `${BASE_PATH}/api/auth`,
    maxAge: OIDC_TX_TTL_SEC,
  });
  return new Response(null, { status: 303, headers: { Location: start.url, "Cache-Control": "no-store" } });
}

/**
 * Demo sign-in: no password, the user picks a catalog identity. Disabled when
 * OIDC is configured, unless ALLOW_DEMO_SIGNIN=1.
 */
export async function POST(request: Request) {
  const { demo } = identityProviders();
  if (!demo) return authError(403, "Demo sign-in is disabled; use single sign-on");
  const body = await readJson(request, 4_000);
  const userId = str(body?.userId, 80) ?? undefined;
  // With STAFF_SIGNIN_PASSWORD set, picking an admin account needs the password. Agents, supervisors and reviewers don't.
  const picked = users.find((u) => u.id === userId);
  if (staffPasswordRequired() && userId !== TRIAL_USER_ID && (!picked || needsStaffPassword(picked.role))) {
    const client = `staff:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"}`;
    if (trialFailures.blocked(client)) return Response.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
    if (!checkStaffPassword(str(body?.password, 200) ?? "")) {
      trialFailures.record(client);
      recordSecurityEvent({ eventType: "security.sign_in_failed", payload: { provider: demo.id, attemptedUserId: userId ?? null, reason: "staff_password" } });
      return Response.json({ error: "Admin accounts need the staff password. To test, pick an agent, supervisor or reviewer instead: they need no password." }, { status: 401 });
    }
  }
  const result = await demo.completeSignIn({ userId });
  if (!result.ok) {
    recordSecurityEvent({ eventType: "security.sign_in_failed", payload: { provider: demo.id, attemptedUserId: userId ?? null, reason: result.reason } });
    return authError(401, "Sign-in failed");
  }
  const user = demo.resolveUser(result.subject)!;
  const claims = await startSession(user, demo, request);
  recordSecurityEvent({ eventType: "security.signed_in", user, payload: { provider: demo.id, sessionId: claims.sid } });
  return Response.json({ user: toPublicUser(user), next: safeNextPath(body?.next) ?? homePathFor(user) });
}
