import { getPolicyRegistry, PolicyRegistryError, type PolicyDraftPatch } from "@/lib/policy/registry";
import { validatePolicy } from "@/lib/policy/engine";
import type { ToolPermission, ToolRisk } from "@/lib/domain/types";
import { jsonError, readJson } from "@/lib/server/http";
import { resolvePolicyAdmin } from "@/lib/server/config-admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPolicyRegistry().get(id);
  return p ? Response.json({ ...p, issues: validatePolicy(p) }) : jsonError("Policy not found", 404);
}

function toPatch(raw: unknown): PolicyDraftPatch | string {
  if (!raw || typeof raw !== "object") return "Invalid patch";
  const p = raw as Record<string, unknown>;
  const out: PolicyDraftPatch = {};
  if (p.changeNote !== undefined) out.changeNote = String(p.changeNote);
  if (p.minObservationConfidence !== undefined) out.minObservationConfidence = Number(p.minObservationConfidence);
  if (p.maxCaptureAttempts !== undefined) out.maxCaptureAttempts = Number(p.maxCaptureAttempts);
  if (p.maxAiDurationSec !== undefined) out.maxAiDurationSec = Number(p.maxAiDurationSec);
  if (p.allowReturnToAi !== undefined) out.allowReturnToAi = p.allowReturnToAi === true;
  if (p.tools !== undefined) {
    if (!Array.isArray(p.tools) || p.tools.length > 50) return "Invalid tools";
    out.tools = p.tools.map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      return {
        tool: String(x.tool ?? ""),
        mode: x.mode === undefined ? undefined : (String(x.mode) as ToolPermission["mode"]),
        risk: x.risk === undefined ? undefined : (String(x.risk) as ToolRisk),
        requiresIdempotencyKey: x.requiresIdempotencyKey === undefined ? undefined : x.requiresIdempotencyKey === true,
      };
    });
  }
  return out;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reg = getPolicyRegistry();
  const policy = reg.get(id);
  if (!policy) return jsonError("Policy not found", 404);
  const body = await readJson(request);
  const actor = resolvePolicyAdmin(body?.actorId, policy);
  if (!actor) return jsonError("Not permitted", 403);
  const patch = toPatch(body?.patch);
  if (typeof patch === "string") return jsonError(patch);
  try {
    const updated = reg.updateDraft(id, patch, actor);
    return Response.json({ ...updated, issues: validatePolicy(updated) });
  } catch (e) {
    if (e instanceof PolicyRegistryError) return jsonError(e.message, 422);
    throw e;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reg = getPolicyRegistry();
  const policy = reg.get(id);
  if (!policy) return jsonError("Policy not found", 404);
  const actor = resolvePolicyAdmin(new URL(request.url).searchParams.get("actorId") ?? undefined, policy);
  if (!actor) return jsonError("Not permitted", 403);
  try {
    reg.discardDraft(id, actor);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof PolicyRegistryError) return jsonError(e.message, 409);
    throw e;
  }
}
