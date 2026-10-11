import { getRuntime } from "@/lib/server/runtime";
import { jsonError } from "@/lib/server/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = getRuntime().agentView(id);
  if (!view) return jsonError("Session not found", 404);
  return Response.json(view);
}
