import type { CostEvent, ModelUsage, ModelUsageParts } from "./types";

/**
 * Estimated unit costs (GBP) used for per-interaction cost attribution.
 * Placeholder rates until provider contracts are agreed; kept in one place so
 * the Cost Centre and session totals always agree. Costs computed from these
 * rates are labelled "estimated".
 */
export const COST_RATES: Record<CostEvent["category"], number> = {
  media: 0.004, // per participant-minute on the SFU
  speech_to_text: 0.002, // per customer turn
  text_to_speech: 0.000015, // per character
  vision_inference: 0.012, // per analysed frame
  llm_turn: 0.004, // per reasoning turn
  workflow_action: 0.001, // per integration call
};

/**
 * Server speech-to-text list prices, USD per audio minute, keyed by the
 * provider id recorded on the cost event. A transcribed turn is priced from
 * its audio duration; the cost stays "estimated" because the rate is a list
 * price, not an invoice. Turns recognised in the browser use the flat
 * `speech_to_text` unit rate above. Review when contracts or prices change.
 */
export const STT_PRICES_USD_PER_MINUTE: Record<string, number> = {
  "elevenlabs-scribe": 0.4 / 60, // Scribe v1, $0.40 per audio hour
  "deepgram-nova-3": 0.0043, // Nova-3 pre-recorded, pay as you go
};

/** Estimated GBP cost of one server-transcribed turn, or undefined for an unpriced provider. */
export function speechToTextCost(provider: string, audioSeconds: number): number | undefined {
  const rate = STT_PRICES_USD_PER_MINUTE[provider];
  if (rate === undefined || !Number.isFinite(audioSeconds) || audioSeconds < 0) return undefined;
  return (audioSeconds / 60) * rate * usdToGbp();
}

/**
 * Model list prices, USD per million tokens (Anthropic first-party API,
 * standard speed). Cache writes are priced for the default 5-minute TTL
 * (1.25x input). Costs computed from these prices and provider-reported token
 * usage are labelled "measured". Review when contracts or prices change.
 */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok: number;
  cacheReadPerMTok: number;
}

function price(input: number, output: number, cacheRead = input / 10): ModelPrice {
  return { inputPerMTok: input, outputPerMTok: output, cacheWritePerMTok: input * 1.25, cacheReadPerMTok: cacheRead };
}

export const MODEL_PRICES_USD: Record<string, ModelPrice> = {
  "claude-fable-5-1": price(10, 50, 0.25),
  "claude-fable-5": price(10, 50),
  "claude-opus-5-5": price(4, 20, 0.2),
  "claude-opus-5": price(5, 25),
  "claude-opus-4-8": price(5, 25),
  "claude-opus-4-7": price(5, 25),
  "claude-opus-4-6": price(5, 25),
  "claude-sonnet-5-5": price(2, 10, 0.2),
  "claude-sonnet-5": price(2, 10),
  "claude-sonnet-4-6": price(3, 15),
  "claude-haiku-5-5": price(0.1, 0.5),
  "claude-haiku-4-5": price(1, 5),
};

/** Conversion used for GBP reporting. Override with USD_TO_GBP in the environment. */
export const DEFAULT_USD_TO_GBP = 0.79;

export function usdToGbp(): number {
  const env = typeof process !== "undefined" ? Number(process.env?.USD_TO_GBP) : NaN;
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_USD_TO_GBP;
}

/** Look up a price, tolerating dated or prefixed model ids (e.g. "anthropic.claude-opus-5-5"). */
export function modelPrice(model: string): ModelPrice | undefined {
  if (MODEL_PRICES_USD[model]) return MODEL_PRICES_USD[model];
  const key = Object.keys(MODEL_PRICES_USD)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.includes(k));
  return key ? MODEL_PRICES_USD[key] : undefined;
}

function partUsd(p: ModelUsageParts): number | undefined {
  const rate = modelPrice(p.model);
  if (!rate) return undefined;
  return (
    (p.inputTokens * rate.inputPerMTok +
      p.outputTokens * rate.outputPerMTok +
      p.cacheCreationInputTokens * rate.cacheWritePerMTok +
      p.cacheReadInputTokens * rate.cacheReadPerMTok) /
    1_000_000
  );
}

/**
 * Measured cost of one model call. Returns undefined when any model that ran
 * has no known price — callers then fall back to the estimated unit rate.
 */
export function measuredModelCost(usage: ModelUsage): { usd: number; gbp: number } | undefined {
  const parts = usage.parts?.length ? usage.parts : [usage];
  let usd = 0;
  for (const p of parts) {
    const c = partUsd(p);
    if (c === undefined) return undefined;
    usd += c;
  }
  return { usd, gbp: usd * usdToGbp() };
}
