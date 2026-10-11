import { cookies } from "next/headers";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { SESSION_COOKIE, currentUser } from "@/lib/server/auth";

export async function POST() {
  const user = await currentUser();
  (await cookies()).delete(SESSION_COOKIE);
  if (user) recordSecurityEvent({ eventType: "security.signed_out", user, payload: {} });
  return new Response(null, { status: 204 });
}
