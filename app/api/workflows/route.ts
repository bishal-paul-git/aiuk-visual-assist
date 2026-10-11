import { getWorkflowRegistry, WorkflowRegistryError } from "@/lib/workflow/registry";
import { jsonError, readJson, str } from "@/lib/server/http";
import { resolveAdmin } from "@/lib/server/admin";

/** Create a new draft version from an existing version. */
export async function POST(request: Request) {
  const body = await readJson(request);
  const fromId = str(body?.fromId, 100);
  if (!fromId) return jsonError("fromId is required");
  const reg = getWorkflowRegistry();
  const base = reg.get(fromId);
  if (!base) return jsonError("Workflow not found", 404);
  const actor = resolveAdmin(body?.actorId, base);
  if (!actor) return jsonError("Not permitted", 403);
  try {
    const draft = reg.createDraft(fromId, actor);
    return Response.json({ id: draft.id, version: draft.version }, { status: 201 });
  } catch (e) {
    if (e instanceof WorkflowRegistryError) return jsonError(e.message, 409);
    throw e;
  }
}
