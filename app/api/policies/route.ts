import { getPolicyRegistry, PolicyRegistryError } from "@/lib/policy/registry";
import { jsonError, readJson, str } from "@/lib/server/http";
import { resolvePolicyAdmin } from "@/lib/server/config-admin";

/** Create a new draft policy version from an existing version. */
export async function POST(request: Request) {
  const body = await readJson(request);
  const fromId = str(body?.fromId, 100);
  if (!fromId) return jsonError("fromId is required");
  const reg = getPolicyRegistry();
  const base = reg.get(fromId);
  if (!base) return jsonError("Policy not found", 404);
  const actor = resolvePolicyAdmin(body?.actorId, base);
  if (!actor) return jsonError("Not permitted", 403);
  try {
    const draft = reg.createDraft(fromId, actor);
    return Response.json({ id: draft.id, version: draft.version }, { status: 201 });
  } catch (e) {
    if (e instanceof PolicyRegistryError) return jsonError(e.message, 409);
    throw e;
  }
}
