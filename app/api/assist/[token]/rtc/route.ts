import { resolveCustomer } from "@/lib/server/customer";
import { jsonError, readJson } from "@/lib/server/http";
import { sseMessages } from "@/lib/server/sse";
import { getSignalRelay, relaySignal } from "@/lib/server/signal-relay";

/**
 * WebRTC signalling for the customer (docs/02 §3.2). GET streams the agent's
 * answers and ICE candidates; POST sends the customer's offer and candidates.
 * Ephemeral: nothing here is stored, audited or transcribed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await resolveCustomer(params);
  if (!c) return jsonError("This link is invalid or has expired", 404);
  return sseMessages(request, (push) => getSignalRelay().subscribe(c.id, "customer", push));
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await resolveCustomer(params);
  if (!c) return jsonError("Not found", 404);
  const body = await readJson(request, 64_000);
  if (!body) return jsonError("Invalid JSON body");
  const r = relaySignal(c.rt, getSignalRelay(), { sessionId: c.id, from: "customer", body });
  return r.ok ? new Response(null, { status: 204 }) : jsonError(r.error, r.status);
}
