import { getRuntime } from "./runtime";
import type { Actor } from "@/lib/session/orchestrator";

/** Resolve a customer access token to its session. The token is the only credential a customer holds. */
export async function resolveCustomer(params: Promise<{ token: string }>) {
  const { token } = await params;
  const rt = getRuntime();
  const id = rt.idForToken(token);
  if (!id) return null;
  const entry = rt.get(id)!;
  const actor: Actor = { type: "customer", id: `customer:${id}`, name: entry.state.session.customerLabel };
  return { rt, id, actor };
}
