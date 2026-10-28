import { authorize } from "@/lib/server/auth";
import { jsonError, readJson, str } from "@/lib/server/http";
import { liveEvaluationAvailable } from "@/lib/server/qa";
import { liveSessionClient } from "@/lib/server/anthropic-client";
import { getProviderStats } from "@/lib/server/telemetry";
import { SlidingWindow } from "@/lib/server/trial";
import { ClaudeReasoningProvider } from "@/lib/providers/claude/reasoning";
import { evaluationState } from "@/lib/qa/evaluation";
import { getStep } from "@/lib/workflow/engine";
import { getWorkflow } from "@/lib/config/catalog";
import type { VisualEvent } from "@/lib/domain/types";

/**
 * Reads one photo exactly as a live session would (same model, prompt,
 * reading guides and effort) and returns the AI's observations. Used by the
 * photo evaluation (`npm run eval:photos -- --remote <url>`) so accuracy is
 * measured against the live configuration. QA staff only, rate-limited.
 *   { workflowId, stepKey, mime, data (base64) }
 */
const MAX_BYTES = 1_500_000;
const g = globalThis as unknown as { __aiukPhotoChecks?: SlidingWindow };
const windowed = (g.__aiukPhotoChecks ??= new SlidingWindow(200, 60 * 60_000));

export async function POST(request: Request) {
  const auth = await authorize("qa.evaluate");
  if (!auth.ok) return auth.response;
  if (!liveEvaluationAvailable()) return jsonError("No model credentials are configured (set ANTHROPIC_API_KEY).", 422);
  if (windowed.blocked(auth.user.id)) return jsonError("Too many photo checks this hour", 429);

  const body = await readJson(request, 2_200_000);
  const workflow = getWorkflow(str(body?.workflowId, 80) ?? "wf_router_v3");
  if (!workflow) return jsonError("Unknown workflow", 404);
  let step;
  try {
    step = getStep(workflow, str(body?.stepKey, 80) ?? "");
  } catch {
    return jsonError("Unknown step", 400);
  }
  if (step.type !== "visual_request") return jsonError("That step does not take a photo", 400);
  const mime = str(body?.mime, 40) ?? "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return jsonError("Send a JPEG, PNG or WebP image", 400);
  const data = Buffer.from(str(body?.data, 3_000_000) ?? "", "base64");
  if (data.byteLength === 0 || data.byteLength > MAX_BYTES) return jsonError("Image missing or too large", 400);
  windowed.record(auth.user.id);

  const now = new Date().toISOString();
  const state = evaluationState(workflow, "photo_check", now);
  const visualEvent: VisualEvent = {
    id: "ve_photo_check",
    sessionId: "photo_check",
    triggerType: "workflow_checkpoint",
    timestamp: now,
    frameReference: "photo:check",
    checkpoint: step.evidence?.checkpoint,
    stepKey: step.key,
    width: 0,
    height: 0,
    bytes: data.byteLength,
    processingStatus: "analysing",
  };
  const stats = getProviderStats();
  const provider = new ClaudeReasoningProvider(liveSessionClient(), { model: process.env.VISUAL_ASSIST_MODEL || undefined, observe: (r) => stats.record(r) });
  try {
    const out = await provider.interpretEvidence({ state, visualEvent, workflow, step, frame: { mime, data: new Uint8Array(data) } });
    return Response.json({ ...out, modelVersion: out.modelVersion ?? provider.model });
  } catch (e) {
    return jsonError(`The AI could not read the photo: ${(e as Error).message}`, 502);
  }
}
