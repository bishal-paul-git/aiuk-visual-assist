import { resolveCustomer } from "@/lib/server/customer";
import { jsonError } from "@/lib/server/http";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await resolveCustomer(params);
  if (!c) return jsonError("This link is invalid or has expired", 404);
  return Response.json(c.rt.customerView(c.id));
}
