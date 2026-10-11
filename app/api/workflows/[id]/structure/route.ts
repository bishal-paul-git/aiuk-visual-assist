import { getWorkflowRegistry, WorkflowRegistryError } from "@/lib/workflow/registry";
import { parseStructuralOp } from "@/lib/workflow/structure";
import { jsonError, readJson } from "@/lib/server/http";
import { resolveAdmin } from "@/lib/server/admin";

/**
 * Structural edit on a draft: add_step, remove_step, move_step, set_rules,
 * update_step. Responds with the updated definition and the re-run publish
 * checks so the builder can show issues inline.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reg = getWorkflowRegistry();
  const wf = reg.get(id);
  if (!wf) return jsonError("Workflow not found", 404);
  const body = await readJson(request);
  const actor = resolveAdmin(body?.actorId, wf);
  if (!actor) return jsonError("Not permitted", 403);
  const op = parseStructuralOp(body?.op);
  if (typeof op === "string") return jsonError(op);
  try {
    return Response.json(reg.applyStructure(id, op, actor));
  } catch (e) {
    if (e instanceof WorkflowRegistryError) return jsonError(e.message, 422);
    throw e;
  }
}
