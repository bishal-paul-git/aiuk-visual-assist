import { getIdentityProvider, toPublicUser } from "@/lib/auth/identity";
import { currentUser } from "@/lib/server/auth";

/** The signed-in user (or null) and the identity provider in use. */
export async function GET() {
  const user = await currentUser();
  const idp = getIdentityProvider();
  return Response.json(
    { user: user ? toPublicUser(user) : null, provider: { id: idp.id, name: idp.displayName, demo: idp.demo } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
