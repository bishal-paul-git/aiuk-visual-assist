import { getWorkflowRegistry, WorkflowRegistryError } from "@/lib/workflow/registry";
import { jsonError, readJson, str } from "@/lib/server/http";
import { authorizeConfig } from "@/lib/server/admin";

/** Create a new draft version from an existing version. */
export async function POST(request: Request) {
  const body = await readJson(request);
  const fromId = str(body?.fromId, 100);
  if (!fromId) return jsonError("fromId is required");
  const reg = getWorkflowRegistry();
  const base = reg.get(fromId);
  if (!base) return jsonError("Workflow not found", 404);
  const auth = await authorizeConfig("workflow.edit", base);
  if (!auth.ok) return auth.response;
  const actor = auth.actor;
  try {
    const draft = reg.createDraft(fromId, actor);
    return Response.json({ id: draft.id, version: draft.version }, { status: 201 });
  } catch (e) {
    if (e instanceof WorkflowRegistryError) return jsonError(e.message, 409);
    throw e;
  }
}
