import { resolveCustomer } from "@/lib/server/customer";
import { jsonError } from "@/lib/server/http";
import { sseResponse } from "@/lib/server/sse";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await resolveCustomer(params);
  if (!c) return jsonError("This link is invalid or has expired", 404);
  return sseResponse(request, (fn) => c.rt.subscribe(c.id, fn), () => c.rt.customerView(c.id));
}
