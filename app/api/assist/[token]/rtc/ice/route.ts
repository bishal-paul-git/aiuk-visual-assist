import { resolveCustomer } from "@/lib/server/customer";
import { jsonError } from "@/lib/server/http";
import { iceServers } from "@/lib/server/signal-relay";

/** ICE servers for the customer's live video connection, only while the session is open. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await resolveCustomer(params);
  if (!c) return jsonError("Not found", 404);
  const status = c.rt.get(c.id)?.state.session.status;
  if (status === "completed" || status === "failed") return jsonError("Session has ended", 409);
  return Response.json({ iceServers: iceServers() }, { headers: { "Cache-Control": "no-store" } });
}
