import type { SessionState } from "@/lib/domain/session";
import { computeMetrics, latencyStats } from "./metrics";

/**
 * Prometheus text exposition (format 0.0.4). Pure functions, so the metric
 * set is unit-tested without a server.
 */

export type Labels = Record<string, string>;

export interface Sample {
  labels?: Labels;
  value: number;
  /** Appended to the family name, e.g. "_sum" / "_count" for summaries. */
  suffix?: string;
}

export interface MetricFamily {
  name: string;
  help: string;
  type: "gauge" | "counter" | "summary" | "untyped";
  samples: Sample[];
}

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function escapeHelp(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

export function formatValue(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (n === Infinity) return "+Inf";
  if (n === -Infinity) return "-Inf";
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
}

export function renderPrometheus(families: MetricFamily[]): string {
  const lines: string[] = [];
  for (const f of families) {
    if (!NAME.test(f.name)) throw new Error(`Invalid metric name: ${f.name}`);
    lines.push(`# HELP ${f.name} ${escapeHelp(f.help)}`);
    lines.push(`# TYPE ${f.name} ${f.type}`);
    for (const s of f.samples) {
      const labels = Object.entries(s.labels ?? {});
      for (const [k] of labels) if (!LABEL.test(k)) throw new Error(`Invalid label name: ${k}`);
      const rendered = labels.length ? `{${labels.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(",")}}` : "";
      lines.push(`${f.name}${s.suffix ?? ""}${rendered} ${formatValue(s.value)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function countBy<T>(items: T[], key: (t: T) => string | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) {
    const k = key(i);
    if (k !== undefined) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const samplesFrom = (m: Map<string, number>, label: string): Sample[] =>
  [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ labels: { [label]: k }, value: v }));

/**
 * Operational metrics derived from session records (the same source as the
 * platform's analytics, so dashboards and the UI always agree).
 */
export function sessionMetricFamilies(states: SessionState[], opts: { live?: (s: SessionState) => boolean; now?: number } = {}): MetricFamily[] {
  const now = opts.now ?? Date.now();
  const m = computeMetrics(states);
  const lat = latencyStats(states);

  const byStatus = new Map<string, number>();
  for (const s of states) {
    const key = `${s.session.status}|${opts.live ? String(opts.live(s)) : "unknown"}`;
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }

  const waiting = states.filter((s) => s.escalation && !s.escalation.acceptedAt && s.session.status === "escalated");
  const longestWait = waiting.reduce((mx, s) => Math.max(mx, (now - Date.parse(s.escalation!.requestedAt)) / 1000), 0);

  const costs = new Map<string, { category: string; basis: string; value: number }>();
  for (const s of states)
    for (const c of s.costs) {
      const basis = c.basis ?? "estimated";
      const k = `${c.category}|${basis}`;
      const row = costs.get(k) ?? { category: c.category, basis, value: 0 };
      row.value += c.estimatedCost;
      costs.set(k, row);
    }

  const notif = new Map<string, { channel: string; status: string; provider: string; value: number }>();
  for (const s of states)
    for (const a of s.audit) {
      if (a.eventType !== "notification.sent" && a.eventType !== "notification.failed") continue;
      const channel = String(a.payload.channel ?? "unknown");
      const provider = String(a.payload.provider ?? "unknown");
      const status = a.eventType === "notification.sent" ? "sent" : "failed";
      const k = `${channel}|${status}|${provider}`;
      const row = notif.get(k) ?? { channel, status, provider, value: 0 };
      row.value += 1;
      notif.set(k, row);
    }

  return [
    {
      name: "va_sessions",
      help: "Sessions held by the runtime, by status and whether they are live (not seeded history).",
      type: "gauge",
      samples: [...byStatus.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          const [status, live] = k.split("|");
          return { labels: { status, live }, value: v };
        }),
    },
    {
      name: "va_escalations_total",
      help: "Sessions escalated to a human, by escalation reason.",
      type: "counter",
      samples: samplesFrom(countBy(states, (s) => s.escalation?.reason), "reason"),
    },
    {
      name: "va_session_outcomes_total",
      help: "Ended sessions by outcome.",
      type: "counter",
      samples: samplesFrom(countBy(states.filter((s) => s.session.outcome), (s) => s.session.outcome), "outcome"),
    },
    { name: "va_ai_resolution_ratio", help: "Share of ended sessions resolved by AI without a human (0-1).", type: "gauge", samples: [{ value: m.aiResolutionRate }] },
    { name: "va_escalation_ratio", help: "Share of started sessions escalated to a human (0-1).", type: "gauge", samples: [{ value: m.escalationRate }] },
    { name: "va_queue_wait_seconds_avg", help: "Average time from escalation to a human accepting, over accepted escalations.", type: "gauge", samples: [{ value: m.avgQueueWaitSec }] },
    { name: "va_queue_waiting_sessions", help: "Escalated sessions currently waiting for a human.", type: "gauge", samples: [{ value: waiting.length }] },
    { name: "va_queue_longest_wait_seconds", help: "Longest current wait for a human.", type: "gauge", samples: [{ value: longestWait }] },
    {
      name: "va_vision_latency_seconds",
      help: "Visual evidence interpretation latency recorded on observations (includes simulated provider sessions).",
      type: "summary",
      samples: [
        { labels: { quantile: "0.5" }, value: lat.visionP50 / 1000 },
        { labels: { quantile: "0.95" }, value: lat.visionP95 / 1000 },
        { suffix: "_count", value: lat.samples },
      ],
    },
    {
      name: "va_cost_gbp_total",
      help: "Attributed cost in GBP by category and basis (measured = provider-reported tokens, estimated = unit rate).",
      type: "counter",
      samples: [...costs.values()].sort((a, b) => `${a.category}${a.basis}`.localeCompare(`${b.category}${b.basis}`)).map((r) => ({ labels: { category: r.category, basis: r.basis }, value: r.value })),
    },
    {
      name: "va_notifications_total",
      help: "Customer link deliveries recorded in session audit, by channel, outcome and provider.",
      type: "counter",
      samples: [...notif.values()].map((r) => ({ labels: { channel: r.channel, status: r.status, provider: r.provider }, value: r.value })),
    },
  ];
}
