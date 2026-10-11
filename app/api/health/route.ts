import { bootedAt, getPersistence, getRuntime } from "@/lib/server/runtime";
import { getNotifications } from "@/lib/server/notifications";
import { getProviderStats } from "@/lib/server/telemetry";
import { requestLogger } from "@/lib/server/log";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness (docs/10 §3).
 *   GET /api/health?probe=live   → 200 while the process can serve requests.
 *   GET /api/health              → readiness + component status; 503 until
 *                                   persisted sessions are loaded.
 * Status is "degraded" (still 200) when the store has an unresolved write error.
 */
export async function GET(request: Request) {
  const probe = new URL(request.url).searchParams.get("probe");
  const started = bootedAt();
  if (probe === "live") return Response.json({ status: "ok", uptimeSec: Math.round((Date.now() - started) / 1000) }, { headers: { "Cache-Control": "no-store" } });

  try {
    const rt = getRuntime();
    const persistence = getPersistence();
    const ready = persistence.isReady();
    const store = persistence.store.status();
    const live = rt.liveSessionIds();
    const reasoning = rt.liveReasoning;
    const providerCalls = getProviderStats().summary();
    const recentErrors = providerCalls.reduce((n, r) => n + r.errors, 0);
    const status = !ready ? "starting" : store.lastError ? "degraded" : "ok";

    const body = {
      status,
      ready,
      uptimeSec: Math.round((Date.now() - started) / 1000),
      startedAt: new Date(started).toISOString(),
      edition: "server",
      store: {
        kind: store.kind,
        durable: store.durable,
        location: store.location,
        restoredAtBoot: persistence.restored,
        seededAtBoot: persistence.seeded,
        pendingWrites: store.pendingWrites,
        lastWriteAt: store.lastWriteAt ?? null,
        lastError: store.lastError ?? null,
        lastErrorAt: store.lastErrorAt ?? null,
      },
      sessions: { total: rt.allSessionIds().length, live: live.length },
      providers: {
        reasoning: { live: reasoning.available, model: reasoning.model ?? null, simulator: "available", calls: providerCalls.reduce((n, r) => n + r.calls, 0), errors: recentErrors },
        notifications: getNotifications().status(),
      },
    };
    return Response.json(body, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const logger = requestLogger(request);
    logger.error("health.check_failed", { err });
    return Response.json({ status: "error", ready: false, requestId: logger.requestId }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
