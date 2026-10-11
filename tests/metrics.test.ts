import { afterEach, describe, expect, it } from "vitest";
import { escapeLabelValue, formatValue, renderPrometheus, sessionMetricFamilies } from "@/lib/analytics/prometheus";
import { renderPlatformMetrics } from "@/lib/server/metrics";
import { ProviderStats } from "@/lib/server/telemetry";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import { seedSessions } from "@/lib/runtime/seed";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { log, requestLogger, setLogSink } from "@/lib/server/log";

const NOW = Date.parse("2026-10-11T12:00:00Z");

function seeded() {
  const rt = new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
  seedSessions(rt, NOW);
  return rt;
}

/** Minimal parser for the exposition format: "name{labels} value" lines. */
function parse(text: string) {
  const samples = new Map<string, number>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = /^([a-zA-Z_:][\w:]*)(\{.*\})? (\S+)$/.exec(line);
    if (!m) throw new Error(`Unparseable line: ${line}`);
    samples.set(`${m[1]}${m[2] ?? ""}`, Number(m[3]));
  }
  return samples;
}

describe("Prometheus rendering", () => {
  it("renders HELP/TYPE headers, labels and values", () => {
    const out = renderPrometheus([
      { name: "va_test", help: "A test\nmetric", type: "gauge", samples: [{ value: 1 }, { labels: { reason: 'a"b\\c' }, value: 2.5 }] },
      { name: "va_sum", help: "s", type: "summary", samples: [{ labels: { quantile: "0.5" }, value: NaN }, { suffix: "_count", value: 0 }] },
    ]);
    expect(out).toBe(
      [
        "# HELP va_test A test\\nmetric",
        "# TYPE va_test gauge",
        "va_test 1",
        'va_test{reason="a\\"b\\\\c"} 2.5',
        "# HELP va_sum s",
        "# TYPE va_sum summary",
        'va_sum{quantile="0.5"} NaN',
        "va_sum_count 0",
        "",
      ].join("\n"),
    );
  });

  it("formats special values and rejects invalid names", () => {
    expect(formatValue(Infinity)).toBe("+Inf");
    expect(formatValue(0.1 + 0.2)).toBe("0.3");
    expect(escapeLabelValue("x\ny")).toBe("x\\ny");
    expect(() => renderPrometheus([{ name: "bad-name", help: "", type: "gauge", samples: [] }])).toThrow(/Invalid metric name/);
    expect(() => renderPrometheus([{ name: "ok", help: "", type: "gauge", samples: [{ labels: { "bad-label": "x" }, value: 1 }] }])).toThrow(/Invalid label/);
  });
});

describe("session metrics", () => {
  it("derives sessions, escalations, resolution rate, queue wait and costs from session records", () => {
    const rt = seeded();
    const states = rt.states();
    const live = new Set(rt.liveSessionIds());
    const text = renderPrometheus(sessionMetricFamilies(states, { live: (s) => live.has(s.session.id), now: NOW }));
    const m = parse(text);

    const sessionsTotal = [...m.entries()].filter(([k]) => k.startsWith("va_sessions{")).reduce((n, [, v]) => n + v, 0);
    expect(sessionsTotal).toBe(states.length);
    expect(m.get('va_sessions{status="escalated",live="true"}')).toBeGreaterThanOrEqual(1);

    const escalated = states.filter((s) => s.escalation).length;
    const escalations = [...m.entries()].filter(([k]) => k.startsWith("va_escalations_total{")).reduce((n, [, v]) => n + v, 0);
    expect(escalations).toBe(escalated);

    const ratio = m.get("va_ai_resolution_ratio")!;
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
    expect(m.get("va_queue_wait_seconds_avg")).toBeGreaterThan(0);
    expect(m.get("va_queue_waiting_sessions")).toBe(1);
    // The waiting demo session started 7 minutes before NOW and escalated part-way through.
    expect(m.get("va_queue_longest_wait_seconds")).toBeGreaterThan(60);
    expect(m.get("va_queue_longest_wait_seconds")).toBeLessThan(7 * 60);

    const costTotal = states.reduce((n, s) => n + s.costs.reduce((x, c) => x + c.estimatedCost, 0), 0);
    const costs = [...m.entries()].filter(([k]) => k.startsWith("va_cost_gbp_total{")).reduce((n, [, v]) => n + v, 0);
    expect(costs).toBeCloseTo(costTotal, 4);
    expect([...m.keys()].filter((k) => k.startsWith("va_cost_gbp_total{")).every((k) => k.includes('basis="estimated"'))).toBe(true);
    expect(m.get("va_vision_latency_seconds_count")).toBeGreaterThan(0);
  });

  it("counts link deliveries from the audit trail", () => {
    const rt = seeded();
    const id = rt.liveSessionIds()[0];
    const sys = { type: "system" as const, id: "notifications", name: "Link delivery" };
    rt.recordAudit(id, "notification.sent", { channel: "sms", provider: "twilio", to: "+44•••123" }, sys);
    rt.recordAudit(id, "notification.failed", { channel: "email", provider: "resend", to: "j•••@x.co" }, sys);
    const m = parse(renderPrometheus(sessionMetricFamilies(rt.states(), { now: NOW })));
    expect(m.get('va_notifications_total{channel="sms",status="sent",provider="twilio"}')).toBe(1);
    expect(m.get('va_notifications_total{channel="email",status="failed",provider="resend"}')).toBe(1);
  });
});

describe("platform metrics endpoint body", () => {
  it("includes provider latency summaries and store gauges", () => {
    const rt = seeded();
    const stats = new ProviderStats();
    for (const ms of [800, 1200, 1500, 2000]) stats.record({ provider: "claude", model: "claude-opus-5-5", operation: "evidence", latencyMs: ms, ok: true, usage: { model: "claude-opus-5-5", inputTokens: 100, outputTokens: 20, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } });
    stats.record({ provider: "claude", model: "claude-opus-5-5", operation: "evidence", latencyMs: 300, ok: false });
    const text = renderPlatformMetrics({
      rt,
      store: { kind: "file", durable: true, sessions: 3, frames: 1, pendingWrites: 2, lastWriteAt: "2026-10-11T11:59:00.000Z" },
      providers: stats.summary(),
      bootedAt: NOW - 60_000,
      now: NOW,
    });
    const m = parse(text);
    const l = 'provider="claude",model="claude-opus-5-5",operation="evidence"';
    expect(m.get("va_up")).toBe(1);
    expect(m.get(`va_provider_call_duration_seconds{${l},quantile="0.5"}`)).toBe(1.2);
    expect(m.get(`va_provider_call_duration_seconds_count{${l}}`)).toBe(5);
    expect(m.get(`va_provider_call_errors_total{${l}}`)).toBe(1);
    expect(m.get(`va_provider_tokens_total{${l},direction="output"}`)).toBe(80);
    expect(m.get('va_store_durable{store="file"}')).toBe(1);
    expect(m.get('va_store_pending_writes{store="file"}')).toBe(2);
    expect(m.get('va_store_last_write_timestamp_seconds{store="file"}')).toBe(Date.parse("2026-10-11T11:59:00.000Z") / 1000);
    // Every line is either a comment or a well-formed sample (parse() throws otherwise).
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("structured logger", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("writes one JSON object per line with correlation ids and never the customer token", () => {
    const lines: string[] = [];
    restore = setLogSink((_level, line) => lines.push(line));
    const req = new Request("https://va.example.com/api/assist/SECRET_TOKEN/commands", { method: "POST", headers: { "x-request-id": "abc-123" } });
    const logger = requestLogger(req, { sessionId: "ses_1" });
    logger.error("command.rejected", { err: new Error("boom"), command: "customer.utterance" });
    log.debug("hidden at default level");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ level: "error", msg: "command.rejected", service: "visual-assist", requestId: "abc-123", sessionId: "ses_1", method: "POST", route: "/api/assist/[token]/commands", err: { name: "Error", message: "boom" } });
    expect(lines[0]).not.toContain("SECRET_TOKEN");
  });

  it("mints a request id when none (or an unsafe one) is supplied", () => {
    const logger = requestLogger(new Request("https://x/api/sessions", { headers: { "x-request-id": "bad id with spaces" } }));
    expect(logger.requestId).toMatch(/^req_[0-9a-f-]{12}$/);
  });
});
