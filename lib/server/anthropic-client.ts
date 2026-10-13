import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic client for live customer sessions.
 *
 * The SDK defaults (10-minute timeout, 2 retries) suit batch work, not a
 * customer waiting on a phone. A live call is cut off after
 * VISUAL_ASSIST_MODEL_TIMEOUT_MS (default 20 s) and retried
 * VISUAL_ASSIST_MODEL_MAX_RETRIES times (default 1) on the errors the SDK
 * treats as transient: timeouts, connection errors, 408, 409, 429 and 5xx.
 * If that still fails the provider throws and the orchestrator escalates the
 * session to a human (ai_model_failure), so the worst case is about 40 s.
 */
export function liveSessionClient(env: Record<string, string | undefined> = process.env): Anthropic {
  return new Anthropic({ timeout: liveTimeoutMs(env), maxRetries: liveMaxRetries(env) });
}

export function liveTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  return bounded(env.VISUAL_ASSIST_MODEL_TIMEOUT_MS, 20_000, 3_000, 120_000);
}

export function liveMaxRetries(env: Record<string, string | undefined> = process.env): number {
  return bounded(env.VISUAL_ASSIST_MODEL_MAX_RETRIES, 1, 0, 3);
}

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
