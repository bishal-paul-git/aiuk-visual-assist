import { bootedAt, getPersistence, getRuntime } from "@/lib/server/runtime";
import { getProviderStats } from "@/lib/server/telemetry";
import { renderPlatformMetrics } from "@/lib/server/metrics";
import { requestLogger } from "@/lib/server/log";

export const dynamic = "force-dynamic";

/**
 * Prometheus scrape endpoint (text exposition format 0.0.4). When
 * METRICS_TOKEN is set, scrapers must send `Authorization: Bearer <token>`.
 */
export async function GET(request: Request) {
  const token = process.env.METRICS_TOKEN;
  if (token && request.headers.get("authorization") !== `Bearer ${token}`) {
    return new Response("Unauthorized\n", { status: 401, headers: { "WWW-Authenticate": "Bearer", "Content-Type": "text/plain" } });
  }
  try {
    const body = renderPlatformMetrics({
      rt: getRuntime(),
      store: getPersistence().store.status(),
      providers: getProviderStats().summary(),
      bootedAt: bootedAt(),
    });
    return new Response(body, { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    const logger = requestLogger(request);
    logger.error("metrics.render_failed", { err });
    return new Response(`# metrics unavailable (requestId ${logger.requestId})\n`, { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}
