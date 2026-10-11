import { resolveCustomer } from "@/lib/server/customer";
import { decodeImageDataUrl, jsonError, readJson, str } from "@/lib/server/http";
import { MAX_FRAME_BYTES } from "@/lib/server/runtime";
import type { FrameTrigger } from "@/lib/domain/types";

const TRIGGERS: FrameTrigger[] = ["ai_request", "workflow_checkpoint", "customer_capture", "scene_change", "human_request", "uncertainty_confirmation", "scheduled_sample"];

/**
 * Selected-evidence upload. The client sends one compressed still that answers
 * an evidence request — never a continuous stream (docs/01 §3.3).
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await resolveCustomer(params);
  if (!c) return jsonError("This link is invalid or has expired", 404);
  const body = await readJson(request, MAX_FRAME_BYTES * 1.4);
  if (!body) return jsonError("Frame too large or invalid", 413);
  const image = decodeImageDataUrl(body.dataUrl);
  if (!image) return jsonError("Expected a base64 JPEG/PNG/WebP data URL");
  if (image.data.length > MAX_FRAME_BYTES) return jsonError("Frame too large", 413);
  const trigger = (str(body.trigger, 40) ?? "customer_capture") as FrameTrigger;
  if (!TRIGGERS.includes(trigger)) return jsonError("Invalid trigger");
  const width = Number(body.width) || 0;
  const height = Number(body.height) || 0;
  const frameId = c.rt.storeFrame(c.id, image.mime, image.data);
  const { error } = c.rt.dispatch(
    c.id,
    {
      type: "frame.captured",
      trigger,
      frameReference: `mem:${frameId}`,
      width,
      height,
      bytes: image.data.length,
      evidenceRequestId: str(body.evidenceRequestId, 80) ?? undefined,
    },
    c.actor,
  );
  if (error) return jsonError(error, 409);
  return Response.json({ ok: true });
}
