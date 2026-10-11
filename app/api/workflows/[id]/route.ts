import { getWorkflowRegistry, WorkflowRegistryError, type DraftPatch } from "@/lib/workflow/registry";
import { jsonError, readJson } from "@/lib/server/http";
import { resolveAdmin } from "@/lib/server/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wf = getWorkflowRegistry().get(id);
  return wf ? Response.json(wf) : jsonError("Workflow not found", 404);
}

function toPatch(raw: unknown): DraftPatch | string {
  if (!raw || typeof raw !== "object") return "Invalid patch";
  const p = raw as Record<string, unknown>;
  const out: DraftPatch = {};
  if (p.objective !== undefined) out.objective = String(p.objective);
  if (p.changeNote !== undefined) out.changeNote = String(p.changeNote);
  if (p.defaultConfidenceThreshold !== undefined) out.defaultConfidenceThreshold = Number(p.defaultConfidenceThreshold);
  if (p.maxAiDurationSec !== undefined) out.maxAiDurationSec = Number(p.maxAiDurationSec);
  if (p.steps !== undefined) {
    if (!Array.isArray(p.steps) || p.steps.length > 100) return "Invalid steps";
    out.steps = p.steps.map((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      return {
        key: String(x.key ?? ""),
        instruction: x.instruction === undefined ? undefined : String(x.instruction),
        customerPrompt: x.customerPrompt === undefined ? undefined : String(x.customerPrompt),
        confidenceThreshold: x.confidenceThreshold === undefined ? undefined : x.confidenceThreshold === null ? null : Number(x.confidenceThreshold),
        maxAttempts: x.maxAttempts === undefined ? undefined : x.maxAttempts === null ? null : Number(x.maxAttempts),
      };
    });
  }
  return out;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reg = getWorkflowRegistry();
  const wf = reg.get(id);
  if (!wf) return jsonError("Workflow not found", 404);
  const body = await readJson(request);
  const actor = resolveAdmin(body?.actorId, wf);
  if (!actor) return jsonError("Not permitted", 403);
  const patch = toPatch(body?.patch);
  if (typeof patch === "string") return jsonError(patch);
  try {
    return Response.json(reg.updateDraft(id, patch, actor));
  } catch (e) {
    if (e instanceof WorkflowRegistryError) return jsonError(e.message, 422);
    throw e;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reg = getWorkflowRegistry();
  const wf = reg.get(id);
  if (!wf) return jsonError("Workflow not found", 404);
  const actor = resolveAdmin(new URL(request.url).searchParams.get("actorId") ?? undefined, wf);
  if (!actor) return jsonError("Not permitted", 403);
  try {
    reg.discardDraft(id, actor);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof WorkflowRegistryError) return jsonError(e.message, 409);
    throw e;
  }
}
