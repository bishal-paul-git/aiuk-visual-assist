import type { ProviderCallRecord } from "@/lib/providers/types";

export interface ProviderCallSummary {
  provider: string;
  model: string;
  operation: ProviderCallRecord["operation"];
  calls: number;
  errors: number;
  /** Seconds, over the most recent `window` calls. NaN when there are no samples. */
  p50: number;
  p95: number;
  p99: number;
  sumSeconds: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * In-process record of live model calls (latency, errors, tokens) for
 * /api/metrics and System Health. Counters are cumulative since boot;
 * percentiles use a sliding window of recent calls per provider/model/operation.
 */
export class ProviderStats {
  private rows = new Map<string, { base: Omit<ProviderCallSummary, "p50" | "p95" | "p99">; window: number[] }>();

  constructor(private readonly windowSize = 500) {}

  record(r: ProviderCallRecord) {
    const key = `${r.provider}|${r.model}|${r.operation}`;
    let row = this.rows.get(key);
    if (!row) {
      row = { base: { provider: r.provider, model: r.model, operation: r.operation, calls: 0, errors: 0, sumSeconds: 0, inputTokens: 0, outputTokens: 0 }, window: [] };
      this.rows.set(key, row);
    }
    const s = r.latencyMs / 1000;
    row.base.calls += 1;
    if (!r.ok) row.base.errors += 1;
    row.base.sumSeconds += s;
    row.base.inputTokens += (r.usage?.inputTokens ?? 0) + (r.usage?.cacheCreationInputTokens ?? 0) + (r.usage?.cacheReadInputTokens ?? 0);
    row.base.outputTokens += r.usage?.outputTokens ?? 0;
    row.window.push(s);
    if (row.window.length > this.windowSize) row.window.shift();
  }

  summary(): ProviderCallSummary[] {
    return [...this.rows.values()].map(({ base, window }) => {
      const xs = [...window].sort((a, b) => a - b);
      return { ...base, p50: quantile(xs, 0.5), p95: quantile(xs, 0.95), p99: quantile(xs, 0.99) };
    });
  }
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const GLOBAL_KEY = "__aiukVisualAssistProviderStats";

export function getProviderStats(): ProviderStats {
  const g = globalThis as unknown as Record<string, ProviderStats | undefined>;
  return (g[GLOBAL_KEY] ??= new ProviderStats());
}
