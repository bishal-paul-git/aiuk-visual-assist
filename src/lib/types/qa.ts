import type { QaState } from "../store";
export type { QaState };
export type ObsVerdict = "correct" | "incorrect" | "unsure";
export type FlagKind = "hallucination" | "low_confidence" | "conflicting_evidence" | "unreadable";

export interface QaFlag { sessionId: string; observationId: string; kind: FlagKind; text: string; confidence: number }
export interface QaMetrics {
  sessionId: string;
  score: number; // 0..100
  accuracy: number; // 0..100
  compliance: number;
  escalation: number;
  flags: QaFlag[];
  baseState: QaState;
}
