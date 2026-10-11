import { getRuntime } from "@/lib/server/runtime";
import { jsonError } from "@/lib/server/http";
import { parseSyntheticRef, renderRouterSvg } from "@/lib/media/router-svg";
import { authorizeSession } from "@/lib/server/session-access";

/** Serves a selected evidence frame. Only frames recorded as visual events are reachable. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; frameId: string }> }) {
  const { id, frameId } = await params;
  const rt = getRuntime();
  const entry = rt.get(id);
  const ve = entry?.state.visualEvents.find((v) => v.id === frameId);
  if (!entry || !ve) return jsonError("Not found", 404);
  const access = await authorizeSession(id, "session.view");
  if (!access.ok) return access.response;
  const headers = { "Cache-Control": "private, max-age=3600" };
  const synthetic = parseSyntheticRef(ve.frameReference);
  if (synthetic) return new Response(renderRouterSvg(synthetic), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  const frame = rt.getFrame(id, ve.frameReference);
  if (!frame) return jsonError("Evidence no longer retained", 410);
  return new Response(Buffer.from(frame.data), { headers: { ...headers, "Content-Type": frame.mime } });
}
