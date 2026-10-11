import { getWorkflowRegistry, WorkflowRegistryError } from "@/lib/workflow/registry";
import { jsonError, readJson } from "@/lib/server/http";
import { resolveAdmin } from "@/lib/server/admin";

/** Lifecycle transitions: submit (draft → in review), reopen (review → draft), publish (review → published). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reg = getWorkflowRegistry();
  const wf = reg.get(id);
  if (!wf) return jsonError("Workflow not found", 404);
  const body = await readJson(request);
  const actor = resolveAdmin(body?.actorId, wf);
  if (!actor) return jsonError("Not permitted", 403);
  try {
    switch (body?.action) {
      case "submit":
        return Response.json(reg.submitForReview(id, actor));
      case "reopen":
        return Response.json(reg.reopen(id, actor));
      case "publish":
        return Response.json(reg.publish(id, actor));
      default:
        return jsonError("Unknown action");
    }
  } catch (e) {
    if (e instanceof WorkflowRegistryError) return jsonError(e.message, 422);
    throw e;
  }
}
