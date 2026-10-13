import { authorizeSession } from "@/lib/server/session-access";
import { resolveIceServers } from "@/lib/server/turn";

/** ICE servers for the agent's live video connection. TURN credentials are only served to authorised users. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeSession(id, "session.join");
  if (!access.ok) return access.response;
  return Response.json({ iceServers: await resolveIceServers() }, { headers: { "Cache-Control": "no-store" } });
}
