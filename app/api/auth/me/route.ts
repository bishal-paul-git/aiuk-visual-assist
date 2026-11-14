import { toPublicUser } from "@/lib/auth/identity";
import { currentSession } from "@/lib/server/auth";
import { identityProviders } from "@/lib/server/identity-provider";
import { staffPasswordRequired } from "@/lib/server/staff-password";
import { storedClients } from "@/lib/config/clients";

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
        staffPassword: Boolean(demo) && staffPasswordRequired(),
        // Staff of demo clients added on the platform (the page's built-in list doesn't know them).
        addedUsers: demo
          ? storedClients()
              .filter((c) => !c.tenant.featureFlags.private_client)
              .flatMap((c) => c.users.filter((u) => u.status === "active").map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, tenantId: u.tenantId, status: u.status, tenantName: c.tenant.name })))
          : [],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
