import { getRuntime } from "@/lib/server/runtime";
import { jsonError } from "@/lib/server/http";
import { authorizeSession } from "@/lib/server/session-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeSession(id, "session.view");
  if (!access.ok) return access.response;
  const view = getRuntime().agentView(id);
  if (!view) return jsonError("Session not found", 404);
  return Response.json(view);
}
