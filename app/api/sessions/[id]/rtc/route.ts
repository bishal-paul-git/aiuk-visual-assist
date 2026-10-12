import { getRuntime } from "@/lib/server/runtime";
import { jsonError, readJson } from "@/lib/server/http";
import { sseMessages } from "@/lib/server/sse";
import { authorizeSession } from "@/lib/server/session-access";
import { getSignalRelay, relaySignal } from "@/lib/server/signal-relay";

/**
 * WebRTC signalling for the agent console (docs/02 §3.2). GET streams the
 * customer's offers and ICE candidates; POST sends the agent's answer and
 * candidates. Ephemeral: nothing here is stored, audited or transcribed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeSession(id, "session.join");
  if (!access.ok) return access.response;
  return sseMessages(request, (push) => getSignalRelay().subscribe(id, "agent", push));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeSession(id, "session.join");
  if (!access.ok) return access.response;
  const body = await readJson(request, 64_000);
  if (!body) return jsonError("Invalid JSON body");
  const r = relaySignal(getRuntime(), getSignalRelay(), { sessionId: id, from: "agent", agentUserId: access.user.id, body });
  return r.ok ? new Response(null, { status: 204 }) : jsonError(r.error, r.status);
}
