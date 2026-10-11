import type { ToolAction, TranscriptEvent, VisualEvent, WorkflowDefinition, WorkflowStep } from "@/lib/domain/types";
import type { SessionState } from "@/lib/domain/session";
import type { ObservationInput } from "@/lib/session/orchestrator";

/**
 * Provider abstractions (docs/02 §7). The orchestrator never talks to a vendor
 * SDK directly; the runtime resolves these interfaces per tenant/agent.
 */

export interface UtteranceInterpretation {
  intent: string;
  reply?: string;
  customerIssue?: string;
}

export interface UtteranceInput {
  state: SessionState;
  utterance: TranscriptEvent;
  workflow: WorkflowDefinition;
  step?: WorkflowStep;
  /** Intents the current step can branch on, in priority order. */
  expectedIntents: string[];
}

export interface EvidenceInterpretation {
  observations: ObservationInput[];
  modelVersion: string;
  latencyMs: number;
  reply?: string;
}

export interface EvidenceInput {
  state: SessionState;
  visualEvent: VisualEvent;
  workflow: WorkflowDefinition;
  step?: WorkflowStep;
  /** Compressed frame (JPEG/PNG/SVG) — only the selected frame, never the stream. */
  frame?: { mime: string; data: Uint8Array };
}

export interface ReasoningProvider {
  readonly id: string;
  readonly simulated: boolean;
  interpretUtterance(input: UtteranceInput): Promise<UtteranceInterpretation>;
  interpretEvidence(input: EvidenceInput): Promise<EvidenceInterpretation>;
}

export interface ToolExecutor {
  readonly id: string;
  execute(action: ToolAction, ctx: { tenantId: string; scenario?: string }): Promise<Record<string, unknown>>;
}
