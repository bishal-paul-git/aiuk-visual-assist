import { getRuntime } from "@/lib/server/runtime";
import { sseResponse } from "@/lib/server/sse";
import { scopeTenantFilter } from "@/lib/auth/rbac";
import { authorize, authError } from "@/lib/server/auth";

/** Live operations stream: summaries of in-flight sessions. */
export async function GET(request: Request) {
  const auth = await authorize("session.view");
  if (!auth.ok) return auth.response;
  const rt = getRuntime();
  const tenantId = scopeTenantFilter(auth.user, new URL(request.url).searchParams.get("tenant") ?? undefined);
  if (tenantId === null) return authError(403, "This belongs to another client organisation.");
  return sseResponse(
    request,
    (fn) => rt.subscribeAll(fn),
    () => ({
      sessions: rt.summaries({ tenantId }).filter((s) => s.live),
      at: new Date().toISOString(),
    }),
  );
}
