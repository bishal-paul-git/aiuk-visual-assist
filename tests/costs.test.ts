import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USD_TO_GBP, measuredModelCost, modelPrice } from "@/lib/domain/pricing";
import { ClaudeReasoningProvider, extractUsage } from "@/lib/providers/claude/reasoning";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { RoutingReasoningProvider } from "@/lib/providers/routing";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import type { ProviderCallRecord } from "@/lib/providers/types";

const usage = (o: Partial<Record<string, unknown>> = {}) => ({
  input_tokens: 1000,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  ...o,
});

function client(payload: unknown, extra: Record<string, unknown> = {}) {
  const create = vi.fn().mockResolvedValue({ stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify(payload) }], usage: usage(), ...extra });
  return { client: { beta: { messages: { create } } } as never, create };
}

describe("model pricing", () => {
  it("prices tokens from the model table (USD per MTok, converted to GBP)", () => {
    const c = measuredModelCost({ model: "claude-opus-5-5", inputTokens: 1_000_000, outputTokens: 100_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 })!;
    expect(c.usd).toBeCloseTo(4 + 2, 6); // $4/MTok in, $20/MTok out
    expect(c.gbp).toBeCloseTo(6 * DEFAULT_USD_TO_GBP, 6);
  });

  it("prices cache writes at 1.25x input and cache reads at the cache rate", () => {
    const c = measuredModelCost({ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 1_000_000, cacheReadInputTokens: 1_000_000 })!;
    expect(c.usd).toBeCloseTo(5 + 0.2, 6);
  });

  it("sums per-model parts when a fallback model also ran", () => {
    const c = measuredModelCost({
      model: "claude-opus-4-8",
      inputTokens: 2_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      parts: [
        { model: "claude-opus-5-5", inputTokens: 1_000_000, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
        { model: "claude-opus-4-8", inputTokens: 1_000_000, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      ],
    })!;
    expect(c.usd).toBeCloseTo(4 + 5, 6);
  });

  it("returns undefined for unknown models and tolerates prefixed ids", () => {
    expect(measuredModelCost({ model: "some-other-model", inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 })).toBeUndefined();
    expect(modelPrice("anthropic.claude-sonnet-5-5")?.inputPerMTok).toBe(2);
    expect(modelPrice("claude-opus-5-5")?.inputPerMTok).toBe(4);
  });
});

describe("usage extraction", () => {
  it("reads top-level usage and the serving model", () => {
    const u = extractUsage({ model: "claude-opus-5-5", usage: usage({ cache_read_input_tokens: 50, cache_creation_input_tokens: null }) }, "claude-opus-5-5", 120)!;
    expect(u).toEqual({ model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 200, cacheCreationInputTokens: 0, cacheReadInputTokens: 50, latencyMs: 120 });
  });

  it("keeps a per-model breakdown when a server-side fallback ran", () => {
    const u = extractUsage(
      {
        model: "claude-opus-5",
        usage: usage({
          iterations: [
            { type: "message", model: "claude-opus-5-5", input_tokens: 400, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            { type: "fallback_message", model: "claude-opus-5", input_tokens: 600, output_tokens: 190, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            { type: "compaction", input_tokens: 99, output_tokens: 9 },
          ],
        }),
      },
      "claude-opus-5-5",
    )!;
    expect(u.model).toBe("claude-opus-5");
    expect(u.parts?.map((p) => p.model)).toEqual(["claude-opus-5-5", "claude-opus-5"]);
  });

  it("returns undefined when the response has no usage", () => {
    expect(extractUsage({ model: "x" }, "x")).toBeUndefined();
  });
});

describe("Claude provider usage capture", () => {
  it("returns usage with the interpretation and reports each call to the observer", async () => {
    const records: ProviderCallRecord[] = [];
    const { client: c } = client({ intent: "broadband_issue", customer_issue: "No internet", reply: null });
    const p = new ClaudeReasoningProvider(c, { observe: (r) => records.push(r) });
    const rt = new SessionRuntime(new RoutingReasoningProvider(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), p), new MockToolExecutor({ default: 0 }));
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Test" });
    const customer = { type: "customer" as const, id: "c", name: "Test" };
    rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
    rt.dispatch(id, { type: "customer.utterance", text: "my broadband is down" }, customer);
    await new Promise((r) => setTimeout(r, 10));

    const costs = rt.get(id)!.state.costs;
    const llm = costs.find((x) => x.category === "llm_turn")!;
    expect(llm.basis).toBe("measured");
    expect(llm.usage).toMatchObject({ model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 200 });
    expect(llm.estimatedCost).toBeCloseTo(((1000 * 4 + 200 * 20) / 1_000_000) * DEFAULT_USD_TO_GBP, 6);
    expect(llm.provider).toContain("claude-opus-5-5");
    // Non-model costs on the same session stay estimated.
    expect(costs.filter((x) => x.category !== "llm_turn").every((x) => x.basis === "estimated")).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ provider: "claude", operation: "utterance", ok: true });
  });

  it("reports refusals to the observer as failed calls", async () => {
    const records: ProviderCallRecord[] = [];
    const { client: c } = client({}, { stop_reason: "refusal" });
    const p = new ClaudeReasoningProvider(c, { observe: (r) => records.push(r) });
    await expect(
      p.interpretUtterance({ state: { transcript: [] } as never, utterance: { text: "hi" } as never, workflow: { name: "w", version: 1, objective: "o", prohibitedGuidance: [] } as never, expectedIntents: [] }),
    ).rejects.toThrow(/refusal/);
    expect(records[0]).toMatchObject({ ok: false, usage: expect.objectContaining({ inputTokens: 1000 }) });
  });

  it("keeps simulated sessions on estimated unit rates", async () => {
    const rt = new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Test", scenario: "power_cycle_fix" });
    const customer = { type: "customer" as const, id: "c", name: "Test" };
    rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
    rt.dispatch(id, { type: "customer.utterance", text: "my broadband is down" }, customer);
    await new Promise((r) => setTimeout(r, 10));
    const costs = rt.get(id)!.state.costs;
    expect(costs.length).toBeGreaterThan(0);
    expect(costs.every((c) => c.basis === "estimated" && !c.usage)).toBe(true);
  });
});
