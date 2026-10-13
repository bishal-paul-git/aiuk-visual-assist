import { describe, expect, it } from "vitest";
import { liveMaxRetries, liveSessionClient, liveTimeoutMs } from "@/lib/server/anthropic-client";

describe("live-session Anthropic client", () => {
  it("defaults to a 20 s timeout and one retry", () => {
    expect(liveTimeoutMs({})).toBe(20_000);
    expect(liveMaxRetries({})).toBe(1);
  });

  it("reads and bounds the environment", () => {
    expect(liveTimeoutMs({ VISUAL_ASSIST_MODEL_TIMEOUT_MS: "15000" })).toBe(15_000);
    expect(liveTimeoutMs({ VISUAL_ASSIST_MODEL_TIMEOUT_MS: "10" })).toBe(3_000);
    expect(liveTimeoutMs({ VISUAL_ASSIST_MODEL_TIMEOUT_MS: "nope" })).toBe(20_000);
    expect(liveMaxRetries({ VISUAL_ASSIST_MODEL_MAX_RETRIES: "9" })).toBe(3);
    expect(liveMaxRetries({ VISUAL_ASSIST_MODEL_MAX_RETRIES: "0" })).toBe(0);
  });

  it("passes the settings to the SDK client", () => {
    const client = liveSessionClient({ ANTHROPIC_API_KEY: "test", VISUAL_ASSIST_MODEL_TIMEOUT_MS: "12000", VISUAL_ASSIST_MODEL_MAX_RETRIES: "2" });
    expect(client.timeout).toBe(12_000);
    expect(client.maxRetries).toBe(2);
  });
});
