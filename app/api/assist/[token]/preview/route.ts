import { resolveCustomer } from "@/lib/server/customer";
import { decodeImageDataUrl, jsonError, readJson } from "@/lib/server/http";

/**
 * Low-rate live preview relay for the agent console while a human is present.
 * Stand-in for the WebRTC media layer (docs/02 §3.2): not analysed, not
 * audited, not retained beyond the latest frame.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await resolveCustomer(params);
  if (!c) return jsonError("Not found", 404);
  const view = c.rt.customerView(c.id);
  if (!view?.previewRequested || view.status === "completed") return jsonError("Preview not requested", 409);
  const body = await readJson(request, 300_000);
  const image = decodeImageDataUrl(body?.dataUrl);
  if (!image) return jsonError("Invalid preview frame");
  c.rt.setPreview(c.id, image.mime, image.data);
  return new Response(null, { status: 204 });
}
