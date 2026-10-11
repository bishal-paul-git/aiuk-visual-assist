import type { CostEvent } from "./types";

/**
 * Estimated unit costs (GBP) used for per-interaction cost attribution.
 * Placeholder rates until provider contracts are agreed; kept in one place so
 * the Cost Centre and session totals always agree.
 */
export const COST_RATES: Record<CostEvent["category"], number> = {
  media: 0.004, // per participant-minute on the SFU
  speech_to_text: 0.002, // per customer turn
  text_to_speech: 0.000015, // per character
  vision_inference: 0.012, // per analysed frame
  llm_turn: 0.004, // per reasoning turn
  workflow_action: 0.001, // per integration call
};
