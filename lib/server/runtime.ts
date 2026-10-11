import Anthropic from "@anthropic-ai/sdk";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { RoutingReasoningProvider } from "@/lib/providers/routing";
import { ClaudeReasoningProvider } from "@/lib/providers/claude/reasoning";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import { seedSessions } from "@/lib/runtime/seed";

export { SessionRuntime, MAX_FRAME_BYTES } from "@/lib/runtime/session-runtime";

const GLOBAL_KEY = "__aiukVisualAssistRuntime";
export const RETENTION_INTERVAL_MS = 10 * 60_000;

/** Process-wide singleton (survives dev hot reloads). */
export function getRuntime(): SessionRuntime {
  const g = globalThis as unknown as Record<string, SessionRuntime | undefined>;
  let rt = g[GLOBAL_KEY];
  if (!rt) {
    rt = new SessionRuntime(new RoutingReasoningProvider(new MockReasoningProvider(), liveProvider()), new MockToolExecutor());
    seedSessions(rt);
    rt.runRetention();
    const timer = setInterval(() => {
      rt!.tick();
      // Retention job (docs/06 §3): delete expired evidence and transcripts.
      const last = rt!.retentionStatus ? Date.parse(rt!.retentionStatus.lastRunAt) : 0;
      if (Date.now() - last >= RETENTION_INTERVAL_MS) rt!.runRetention();
    }, 10_000);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    g[GLOBAL_KEY] = rt;
  }
  return rt;
}

/**
 * Real multimodal reasoning is enabled when Anthropic credentials are
 * configured (ANTHROPIC_API_KEY). VISUAL_ASSIST_MODEL overrides the model.
 */
function liveProvider(): ClaudeReasoningProvider | undefined {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return undefined;
  return new ClaudeReasoningProvider(new Anthropic(), { model: process.env.VISUAL_ASSIST_MODEL || undefined });
}
