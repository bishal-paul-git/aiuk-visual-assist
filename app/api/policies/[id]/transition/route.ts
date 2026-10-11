import { getPolicyRegistry, PolicyRegistryError } from "@/lib/policy/registry";
import { jsonError, readJson } from "@/lib/server/http";
import { authorizeConfig } from "@/lib/server/admin";

/**
 * Lifecycle transitions: submit (draft → in review), reopen (review → draft),
 * publish (review → active; previous active version retired). Publishing
 * requires a different administrator from the submitter (four-eyes).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reg = getPolicyRegistry();
  const policy = reg.get(id);
  if (!policy) return jsonError("Policy not found", 404);
  const body = await readJson(request);
  const auth = await authorizeConfig(body?.action === "publish" ? "policy.publish" : "policy.edit", policy, "policy");
  if (!auth.ok) return auth.response;
  const actor = auth.actor;
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
    if (e instanceof PolicyRegistryError) return jsonError(e.message, 422);
    throw e;
  }
}
