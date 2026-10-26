import { toPublicUser } from "@/lib/auth/identity";
import { TRIAL_USER_ID } from "@/lib/auth/trial";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { authError, safeNextPath, startSession } from "@/lib/server/auth";
import { identityProviders } from "@/lib/server/identity-provider";
import { readJson, str } from "@/lib/server/http";
import { checkTrialCredentials, trialFailures } from "@/lib/server/trial";

/**
 * Trial login for client testers: an email and password (filled in for them on
 * the login page) that sign in as the trial supervisor of one client. Needs the
 * demo identity provider, so it is off when single sign-on is configured
 * (unless ALLOW_DEMO_SIGNIN=1). Wrong attempts are throttled per address.
 */
export async function POST(request: Request) {
  const { demo } = identityProviders();
  if (!demo) return authError(403, "Trial login is disabled; use single sign-on");
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (trialFailures.blocked(client)) return Response.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });

  const body = await readJson(request, 4_000);
  const email = str(body?.email, 200) ?? "";
  const password = str(body?.password, 200) ?? "";
  if (!checkTrialCredentials(email, password)) {
    trialFailures.record(client);
    recordSecurityEvent({ eventType: "security.sign_in_failed", payload: { provider: "trial", reason: "bad_credentials" } });
    return Response.json({ error: "That email or password isn't right." }, { status: 401 });
  }
  const result = await demo.completeSignIn({ userId: TRIAL_USER_ID });
  const user = result.ok ? demo.resolveUser(result.subject) : undefined;
  if (!user) return authError(401, "Trial account is not available");
  const claims = await startSession(user, demo, request);
  recordSecurityEvent({ eventType: "security.signed_in", user, payload: { provider: "trial", sessionId: claims.sid } });
  return Response.json({ user: toPublicUser(user), next: safeNextPath(body?.next) ?? "/client" });
}
