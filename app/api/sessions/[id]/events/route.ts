import { getRuntime } from "@/lib/server/runtime";
import { jsonError } from "@/lib/server/http";
import { sseResponse } from "@/lib/server/sse";
import { authorizeSession } from "@/lib/server/session-access";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rt = getRuntime();
  if (!rt.get(id)) return jsonError("Session not found", 404);
  const access = await authorizeSession(id, "session.view");
  if (!access.ok) return access.response;
  return sseResponse(request, (fn) => rt.subscribe(id, fn), () => rt.agentView(id));
}
