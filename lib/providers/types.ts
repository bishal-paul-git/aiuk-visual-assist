import type { ModelUsage, ToolAction, ToolCallOutcome, TranscriptEvent, VisualEvent, WorkflowDefinition, WorkflowStep } from "@/lib/domain/types";
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
  /** Provider-reported token usage; absent for simulated providers (costs stay estimated). */
  usage?: ModelUsage;
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
  /** Provider-reported token usage; absent for simulated providers (costs stay estimated). */
  usage?: ModelUsage;
}

/** One completed (or failed) call to a model provider, for latency/usage telemetry. */
export interface ProviderCallRecord {
  provider: string;
  model: string;
  operation: "utterance" | "evidence";
  latencyMs: number;
  ok: boolean;
  usage?: ModelUsage;
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

export interface ToolExecutionContext {
  tenantId: string;
  scenario?: string;
}

export interface ToolExecutor {
  readonly id: string;
  execute(action: ToolAction, ctx: ToolExecutionContext): Promise<Record<string, unknown>>;
  /**
   * Optional: executors that front client systems also report an audit-safe
   * outcome (provider, latency, external reference). On failure they throw a
   * ToolCallError (lib/integrations/contract.ts) carrying the outcome.
   */
  executeWithOutcome?(action: ToolAction, ctx: ToolExecutionContext): Promise<{ result: Record<string, unknown>; outcome: ToolCallOutcome }>;
}
