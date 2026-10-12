import { cookies } from "next/headers";
import { OIDC_ID_TOKEN_COOKIE } from "@/lib/auth/oidc";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { SESSION_COOKIE, currentSession, publicBaseUrl } from "@/lib/server/auth";
import { identityProviders } from "@/lib/server/identity-provider";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Local sign-out: clears the session cookie. For an OIDC session, also returns
 * the issuer's RP-initiated logout URL (when it advertises one) so the browser
 * can end the IdP session too.
 */
export async function POST(request: Request) {
  const session = await currentSession();
  const jar = await cookies();
  const idTokenHint = jar.get(OIDC_ID_TOKEN_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  jar.delete({ name: OIDC_ID_TOKEN_COOKIE, path: `${BASE_PATH}/api/auth` });

  let logoutUrl: string | undefined;
  const { oidc } = identityProviders();
  if (oidc && session?.provider.id === oidc.id) {
    logoutUrl = await oidc.logoutUrl({ idTokenHint, baseUrl: publicBaseUrl(request) });
  }
  if (session) {
    recordSecurityEvent({
      eventType: "security.signed_out",
      user: session.user,
      payload: { provider: session.provider.id, sessionId: session.claims.sid, idpLogout: Boolean(logoutUrl) },
    });
  }
  return Response.json({ ok: true, ...(logoutUrl ? { logoutUrl } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
