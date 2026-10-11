import type { SessionState } from "@/lib/domain/session";
import type { VisualEvent } from "@/lib/domain/types";
import type {
  EvidenceInput,
  EvidenceInterpretation,
  ReasoningProvider,
  UtteranceInput,
  UtteranceInterpretation,
} from "@/lib/providers/types";
import { describeReply, getScenario, scenarioObservations } from "./scenarios";

export const MOCK_VISION_MODEL = "aiuk-vision-sim-1";

const PATTERNS: Record<string, RegExp> = {
  out_of_scope: /\b(bill|billing|payment|pay|cancel|contract|price|refund|move house|moving house|upgrade)\b/i,
  broadband_issue: /\b(internet|broadband|wi-?fi|router|hub|connection|connect|online|offline|signal|slow|buffering|lights?)\b/i,
  cannot: /\b(can'?t|cannot|unable|won'?t|don'?t know how)\b/i,
  negate: /\b(no|nope|not|still|isn'?t|doesn'?t|didn'?t|nothing)\b/i,
  done: /\b(done|finished|did it|all done|restarted|ready|that'?s it|pushed|plugged|it'?s in|clicked|switched)\b/i,
  affirm: /\b(yes|yeah|yep|yup|working|works|sorted|perfect|great|correct|ok|okay|fine|loads|loading)\b/i,
};

/** Deterministic, step-aware intent classifier used by the simulated provider. */
export function classifyUtterance(text: string, expectedIntents: string[]): string {
  if (/\b(not yet|hold on|hang on|one (sec|second|moment|minute)|wait)\b/i.test(text)) return "wait";
  const order = [...expectedIntents];
  // Negative/inability intents must be checked before affirm/done so
  // "still not working" is not read as "working".
  order.sort((a, b) => rank(a) - rank(b));
  for (const intent of order) {
    const p = PATTERNS[intent];
    if (p && p.test(text)) return intent;
  }
  return "unknown";
}

function rank(intent: string): number {
  return ["out_of_scope", "cannot", "negate", "broadband_issue", "done", "affirm"].indexOf(intent) + 1 || 99;
}

export function isAfterIntervention(state: SessionState): boolean {
  return state.workflow.history.some((h) => h.status === "completed" && h.stepKey.startsWith("guide_"));
}

export function checkpointAttempt(state: SessionState, ve: VisualEvent): number {
  const idx = state.visualEvents.findIndex((v) => v.id === ve.id);
  return state.visualEvents.slice(0, idx + 1).filter((v) => v.checkpoint === ve.checkpoint).length;
}

export function simulateUtterance(input: UtteranceInput): UtteranceInterpretation {
  const text = input.utterance.text;
  const intent = classifyUtterance(text, input.expectedIntents);
  const issue = intent === "broadband_issue" ? summariseIssue(text) : undefined;
  let reply: string | undefined;
  if (intent === "wait") {
    reply = "No rush — take your time and let me know when you're ready.";
  } else if (intent === "unknown" && input.step) {
    reply =
      input.step.type === "guidance"
        ? "No problem — just say “done” once you've finished that step, or “I can't” if you're stuck."
        : input.step.type === "question" && input.step.key === "intake"
          ? "Sorry, I didn't catch that. Is it your broadband or Wi-Fi that's causing trouble?"
          : undefined;
  }
  return { intent, reply, customerIssue: issue };
}

function summariseIssue(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}

export function simulateEvidence(input: EvidenceInput): EvidenceInterpretation {
  const sc = getScenario(input.state.session.scenario);
  if (sc.visionOutage) throw new Error("Vision provider timeout after 8000ms (simulated outage)");
  const ve = input.visualEvent;
  const observations = scenarioObservations(sc, {
    checkpoint: ve.checkpoint ?? "none",
    attempt: checkpointAttempt(input.state, ve),
    afterIntervention: isAfterIntervention(input.state),
  });
  return { observations, modelVersion: MOCK_VISION_MODEL, latencyMs: 0, reply: describeReply(observations) };
}

/**
 * Simulated reasoning provider. Deterministic outputs keyed off the session's
 * scenario; latency is simulated so the customer UX states are realistic.
 */
export class MockReasoningProvider implements ReasoningProvider {
  readonly id = "mock-reasoning";
  readonly simulated = true;
  constructor(private readonly latency: { utteranceMs: number; visionMs: number } = { utteranceMs: 500, visionMs: 1400 }) {}

  async interpretUtterance(input: UtteranceInput): Promise<UtteranceInterpretation> {
    await sleep(jitter(this.latency.utteranceMs));
    return simulateUtterance(input);
  }

  async interpretEvidence(input: EvidenceInput): Promise<EvidenceInterpretation> {
    const started = Date.now();
    await sleep(jitter(this.latency.visionMs));
    const result = simulateEvidence(input);
    return { ...result, latencyMs: Date.now() - started };
  }
}

function jitter(ms: number): number {
  return ms <= 0 ? 0 : Math.round(ms * (0.8 + Math.random() * 0.4));
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}
