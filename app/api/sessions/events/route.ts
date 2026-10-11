import { getRuntime } from "@/lib/server/runtime";
import { sseResponse } from "@/lib/server/sse";

/** Live operations stream: summaries of in-flight sessions. */
export async function GET(request: Request) {
  const rt = getRuntime();
  const tenantId = new URL(request.url).searchParams.get("tenant") ?? undefined;
  return sseResponse(
    request,
    (fn) => rt.subscribeAll(fn),
    () => ({
      sessions: rt.summaries({ tenantId }).filter((s) => s.live),
      at: new Date().toISOString(),
    }),
  );
}
