import Anthropic from "@anthropic-ai/sdk";
import type { User } from "@/lib/domain/types";
import type { DomainEventType } from "@/lib/domain/types";
import { getQaStore, type QaStore } from "@/lib/qa/store";
import { normaliseRate, type SamplingConfig } from "@/lib/qa/sampling";
import type { Frame, RunOptions } from "@/lib/qa/evaluation";
import { SceneVisionProvider } from "@/lib/qa/scene-vision";
import { ClaudeReasoningProvider } from "@/lib/providers/claude/reasoning";
import { attachQaStore } from "@/lib/server/store/qa";
import { getProviderStats } from "@/lib/server/telemetry";
import { getRuntime } from "./runtime";
import { actorFor } from "./auth";

/**
 * Server wiring for QA tooling: the QA store (Postgres-backed when
 * DATABASE_URL is set, file-backed when DATA_DIR is set), the sampling configuration, audit events on the reviewed session, and
 * the providers an evaluation can run against.
 */

const g = globalThis as unknown as { __aiukQaAttached?: boolean };

export function qaStore(): QaStore {
  const store = getQaStore();
  if (!g.__aiukQaAttached) {
    g.__aiukQaAttached = true;
    const dir = process.env.DATA_DIR?.trim();
    if (process.env.STATIC_EXPORT === "1") {
      /* the static demo keeps QA records in memory */
    } else if (process.env.DATABASE_URL?.trim()) {
      // Postgres: the runtime loads QA records with the sessions (awaited by runtimeReady()).
      getRuntime();
    } else if (dir) attachQaStore(dir, store);
  }
  return store;
}

/**
 * Share of AI-resolved sessions sampled for review. QA_AI_RESOLVED_SAMPLE_RATE
 * accepts 0–1 or a percentage (e.g. 0.2 or 20). Default 20%.
 */
export function samplingConfig(): SamplingConfig {
  return { aiResolvedRate: normaliseRate(process.env.QA_AI_RESOLVED_SAMPLE_RATE), salt: process.env.QA_SAMPLE_SALT || undefined };
}

/** Record a QA event on the reviewed session's own audit trail (so it appears in the audit explorer and persists with the session). */
export function recordQaAudit(sessionId: string, eventType: Extract<DomainEventType, `qa.${string}`>, payload: Record<string, unknown>, user: User) {
  getRuntime().recordAudit(sessionId, eventType, payload, actorFor(user));
}

export type EvaluationProviderKind = "simulated" | "claude";

export function liveEvaluationAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** SVG frames are rendered to PNG for models that only accept bitmaps. */
async function rasterise(frame: Frame): Promise<Frame> {
  if (frame.mime !== "image/svg+xml") return frame;
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default;
  } catch {
    throw new Error("This case is a synthetic SVG scene and the image library needed to convert it for the model is not installed.");
  }
  const png = await sharp(Buffer.from(frame.data)).png().toBuffer();
  return { mime: "image/png", data: new Uint8Array(png) };
}

/** Provider, label and frame preparation for an evaluation run. Throws when the live model is not configured. */
export function evaluationProvider(kind: EvaluationProviderKind): Pick<RunOptions, "provider" | "providerLabel" | "prepareFrame" | "concurrency"> {
  if (kind === "claude") {
    if (!liveEvaluationAvailable()) throw new Error("No model credentials are configured (set ANTHROPIC_API_KEY).");
    const stats = getProviderStats();
    const provider = new ClaudeReasoningProvider(new Anthropic(), { model: process.env.VISUAL_ASSIST_MODEL || undefined, effort: "medium", observe: (r) => stats.record(r) });
    return { provider, providerLabel: `Claude (${provider.model})`, prepareFrame: rasterise, concurrency: 3 };
  }
  return { provider: new SceneVisionProvider(), providerLabel: "Simulated scene reader", concurrency: 1 };
}
