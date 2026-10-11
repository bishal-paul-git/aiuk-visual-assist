import { renderPrometheus, sessionMetricFamilies, type MetricFamily } from "@/lib/analytics/prometheus";
import type { StoreStatus } from "@/lib/server/store";
import type { ProviderCallSummary } from "@/lib/server/telemetry";
import type { SessionRuntime } from "@/lib/runtime/session-runtime";

export interface PlatformMetricsInput {
  rt: SessionRuntime;
  store: StoreStatus;
  providers: ProviderCallSummary[];
  bootedAt: number;
  now?: number;
}

export function providerFamilies(rows: ProviderCallSummary[]): MetricFamily[] {
  const labels = (r: ProviderCallSummary) => ({ provider: r.provider, model: r.model, operation: r.operation });
  return [
    {
      name: "va_provider_call_duration_seconds",
      help: "Live model provider call latency (quantiles over the most recent calls).",
      type: "summary",
      samples: rows.flatMap((r) => [
        { labels: { ...labels(r), quantile: "0.5" }, value: r.p50 },
        { labels: { ...labels(r), quantile: "0.95" }, value: r.p95 },
        { labels: { ...labels(r), quantile: "0.99" }, value: r.p99 },
        { labels: labels(r), suffix: "_sum", value: r.sumSeconds },
        { labels: labels(r), suffix: "_count", value: r.calls },
      ]),
    },
    { name: "va_provider_call_errors_total", help: "Live model provider calls that failed, refused or were truncated.", type: "counter", samples: rows.map((r) => ({ labels: labels(r), value: r.errors })) },
    {
      name: "va_provider_tokens_total",
      help: "Provider-reported tokens on live model calls (input includes cache reads and writes).",
      type: "counter",
      samples: rows.flatMap((r) => [
        { labels: { ...labels(r), direction: "input" }, value: r.inputTokens },
        { labels: { ...labels(r), direction: "output" }, value: r.outputTokens },
      ]),
    },
  ];
}

export function storeFamilies(s: StoreStatus): MetricFamily[] {
  const l = { store: s.kind };
  return [
    { name: "va_store_durable", help: "1 when sessions survive a restart.", type: "gauge", samples: [{ labels: l, value: s.durable ? 1 : 0 }] },
    { name: "va_store_pending_writes", help: "Session/frame writes queued but not yet on disk.", type: "gauge", samples: [{ labels: l, value: s.pendingWrites }] },
    { name: "va_store_last_write_timestamp_seconds", help: "Unix time of the last successful write.", type: "gauge", samples: [{ labels: l, value: s.lastWriteAt ? Date.parse(s.lastWriteAt) / 1000 : 0 }] },
    { name: "va_store_error", help: "1 when the most recent store error is unresolved (see /api/health).", type: "gauge", samples: [{ labels: l, value: s.lastError ? 1 : 0 }] },
  ];
}

export function renderPlatformMetrics(input: PlatformMetricsInput): string {
  const { rt, store, providers, bootedAt } = input;
  const now = input.now ?? Date.now();
  const live = new Set(rt.liveSessionIds());
  return renderPrometheus([
    { name: "va_up", help: "1 when the server edition is serving.", type: "gauge", samples: [{ value: 1 }] },
    { name: "va_process_start_time_seconds", help: "Unix time the runtime started.", type: "gauge", samples: [{ value: Math.floor(bootedAt / 1000) }] },
    ...sessionMetricFamilies(rt.states(), { live: (s) => live.has(s.session.id), now }),
    ...providerFamilies(providers),
    ...storeFamilies(store),
  ]);
}
