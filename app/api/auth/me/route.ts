import { toPublicUser } from "@/lib/auth/identity";
import { currentSession } from "@/lib/server/auth";
import { identityProviders } from "@/lib/server/identity-provider";

/**
 * The signed-in user (or null), the provider of the current session, and the
 * sign-in methods enabled on this deployment (for the sign-in page).
 */
export async function GET() {
  const session = await currentSession();
  const { oidc, demo } = identityProviders();
  const provider = session?.provider ?? oidc ?? demo!;
  return Response.json(
    {
      user: session ? toPublicUser(session.user) : null,
      provider: { id: provider.id, name: provider.displayName, demo: provider.demo },
      signIn: {
        sso: oidc ? { name: oidc.displayName, mfa: oidc.config.requireMfa } : null,
        demo: Boolean(demo),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
