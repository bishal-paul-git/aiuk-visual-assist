import { liveSessionClient } from "./anthropic-client";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import type { ToolExecutor } from "@/lib/providers/types";
import { getConnectorRegistry } from "@/lib/integrations/config";
import { HttpToolExecutor } from "@/lib/integrations/http-executor";
import { RoutingToolExecutor } from "@/lib/integrations/routing-executor";
import { RoutingReasoningProvider } from "@/lib/providers/routing";
import { ClaudeReasoningProvider } from "@/lib/providers/claude/reasoning";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import { seedSessions } from "@/lib/runtime/seed";
import { attachStore, createStoreFromEnv, MemorySessionStore, PostgresSessionStore, type Persistence } from "@/lib/server/store";
import { attachConfigStore, attachPostgresConfigStore } from "@/lib/server/store/config";
import { attachPostgresQaStore } from "@/lib/server/store/qa";
import { getQaStore } from "@/lib/qa/store";
import { holdExitUntil } from "@/lib/server/shutdown";
import { getProviderStats } from "@/lib/server/telemetry";
import { log } from "@/lib/server/log";

export { SessionRuntime, MAX_FRAME_BYTES } from "@/lib/runtime/session-runtime";

const GLOBAL_KEY = "__aiukVisualAssistRuntime";
const PERSIST_KEY = "__aiukVisualAssistPersistence";
const BOOT_KEY = "__aiukVisualAssistBootedAt";

type Globals = Record<string, unknown>;
export const RETENTION_INTERVAL_MS = 10 * 60_000;

/** Process-wide singleton (survives dev hot reloads). */
export function getRuntime(): SessionRuntime {
  const g = globalThis as unknown as Globals;
  let rt = g[GLOBAL_KEY] as SessionRuntime | undefined;
  if (!rt) {
    rt = new SessionRuntime(new RoutingReasoningProvider(new MockReasoningProvider(), liveProvider()), toolExecutor());
    g[BOOT_KEY] = Date.now();
    // The static demo build prerenders from a fresh seeded runtime; it never touches DATA_DIR or DATABASE_URL.
    // Neither does `next build` of the server edition, so prerendering cannot seed a real store.
    const building = process.env.NEXT_PHASE === "phase-production-build";
    const store = process.env.STATIC_EXPORT === "1" || building ? new MemorySessionStore() : createStoreFromEnv();
    // Workflow and policy versions first, so sessions pinned to them restore.
    // DATABASE_URL takes precedence: config and QA records then live in Postgres too.
    if (store instanceof PostgresSessionStore) {
      const db = store.db;
      store.beforeLoad = async () => {
        await attachPostgresConfigStore(db);
        await attachPostgresQaStore(db, getQaStore());
      };
    } else if (store.durable && process.env.DATA_DIR) attachConfigStore(process.env.DATA_DIR);
    // SEED_SAMPLE_SESSIONS=0 starts a real-testing server empty, so reports show only real sessions.
    const seed = process.env.SEED_SAMPLE_SESSIONS === "0" && process.env.STATIC_EXPORT !== "1" ? undefined : seedSessions;
    const persistence = attachStore(rt, store, { seed, debounceMs: Number(process.env.PERSIST_DEBOUNCE_MS) || 250 });
    g[PERSIST_KEY] = persistence;
    if (store.durable && typeof process.on === "function") {
      // Writes are debounced; flush anything pending synchronously on the way out.
      process.once("exit", () => persistence.flushSync());
      // Hosts stop containers with SIGTERM/SIGINT; save pending writes first.
      for (const signal of ["SIGTERM", "SIGINT"] as const)
        process.once(signal, () => {
          if (store.saveSessionSync) return persistence.flushSync();
          // Postgres: flush asynchronously and hold the exit until done (or the timeout).
          const db = store instanceof PostgresSessionStore ? store.db : undefined;
          const work = persistence.flush().then(() => db?.idle());
          holdExitUntil(work, { signal, timeoutMs: Number(process.env.SHUTDOWN_FLUSH_TIMEOUT_MS) || 8000 });
        });
    }
    const r = rt;
    // Retention job (docs/06 §3): delete expired evidence and transcripts, once
    // persisted sessions are loaded, then every RETENTION_INTERVAL_MS.
    // A failed load is already logged and shown on /api/health (store.lastError, 503).
    persistence.ready.then(
      () => r.runRetention(),
      () => {},
    );
    const timer = setInterval(() => {
      r.tick();
      const last = r.retentionStatus ? Date.parse(r.retentionStatus.lastRunAt) : 0;
      if (Date.now() - last >= RETENTION_INTERVAL_MS) r.runRetention();
    }, 10_000);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    g[GLOBAL_KEY] = rt;
  }
  return rt;
}

/** Persistence attached to the runtime (store kind, readiness, flush). */
export function getPersistence(): Persistence {
  getRuntime();
  return (globalThis as unknown as Globals)[PERSIST_KEY] as Persistence;
}

/** Resolves once persisted sessions are loaded (immediate for memory and file stores). */
export function runtimeReady(): Promise<SessionRuntime> {
  const rt = getRuntime();
  return getPersistence().ready.then(() => rt);
}

export function bootedAt(): number {
  getRuntime();
  return (globalThis as unknown as Globals)[BOOT_KEY] as number;
}

/**
 * Business actions: per tenant and tool, the simulated sandbox (the default),
 * the platform's built-in records, or the client's own HTTPS endpoint
 * (INTEGRATIONS_CONFIG / config store, edited on Platform → Integrations;
 * docs/INTEGRATION-CONTRACT.md). The static demo always simulates.
 */
function toolExecutor(): ToolExecutor {
  const sandbox = new MockToolExecutor();
  if (process.env.STATIC_EXPORT === "1") return sandbox;
  const registry = getConnectorRegistry();
  for (const bad of registry.invalid()) log.error("integration.connector_invalid", { tenantId: bad.tenantId, tool: bad.tool, source: bad.source, error: bad.error });
  const http = new HttpToolExecutor((tenantId, tool) => {
    const r = registry.resolve(tenantId, tool);
    return r.kind === "configured" ? r.config : undefined;
  });
  return new RoutingToolExecutor(registry, sandbox, http, {
    observe: (o, info) => {
      if (o.mode === "simulated") return;
      const fields = { ...info, provider: o.provider, status: o.status, latencyMs: o.latencyMs, attempts: o.attempts, endpointHost: o.endpointHost, httpStatus: o.httpStatus, errorCode: o.errorCode };
      if (o.status === "failed") log.warn("integration.call_failed", fields);
      else log.info("integration.called", fields);
    },
  });
}

/**
 * Real multimodal reasoning is enabled when Anthropic credentials are
 * configured (ANTHROPIC_API_KEY). VISUAL_ASSIST_MODEL overrides the model.
 */
function liveProvider(): ClaudeReasoningProvider | undefined {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return undefined;
  const stats = getProviderStats();
  return new ClaudeReasoningProvider(liveSessionClient(), {
    model: process.env.VISUAL_ASSIST_MODEL || undefined,
    observe: (r) => {
      stats.record(r);
      if (!r.ok) log.warn("provider.call_failed", { provider: r.provider, model: r.model, operation: r.operation, latencyMs: r.latencyMs });
    },
  });
}
