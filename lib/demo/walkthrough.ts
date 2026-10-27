import type { SessionState } from "@/lib/domain/session";
import { getScenario } from "@/lib/providers/mock/scenarios";

/**
 * Walkthrough director for the demo stage.
 *
 * Given the authoritative session state, decides the next thing a scripted
 * customer or support agent would do, plus a plain-language caption of what
 * the product is doing at that moment. It never touches state itself: the
 * caller sends the returned command through the normal transport, so the
 * walkthrough exercises exactly the same orchestrator, policy and workflow
 * paths as a real session. Evidence capture is not scripted here — the
 * customer's demo camera answers evidence requests on its own.
 */

export type DirectorActor = "customer" | "agent";

export interface DirectorStep {
  /** Stable key so each scripted move is sent once. */
  key: string;
  actor: DirectorActor;
  command: Record<string, unknown>;
  /** Pause before acting so a viewer can follow along. */
  delayMs: number;
}

export interface DirectorDecision {
  stage: WalkthroughStage;
  caption: string;
  next?: DirectorStep;
  done?: boolean;
}

export type WalkthroughStage = "consent" | "problem" | "show_router" | "lights" | "cables" | "guidance" | "action" | "confirm" | "escalation" | "human" | "ended";

export const STAGES: { key: WalkthroughStage; label: string }[] = [
  { key: "consent", label: "Customer opens the link and consents" },
  { key: "problem", label: "AI asks what's wrong" },
  { key: "show_router", label: "Customer shows the router" },
  { key: "lights", label: "Closer view of the lights" },
  { key: "cables", label: "Rear cables checked" },
  { key: "guidance", label: "Approved steps, one at a time" },
  { key: "action", label: "Business action (line test)" },
  { key: "confirm", label: "Customer confirms" },
  { key: "escalation", label: "Escalation with full handover" },
  { key: "human", label: "Human joins and takes over" },
  { key: "ended", label: "Session closed and audited" },
];

const STEP_STAGE: Record<string, WalkthroughStage> = {
  welcome: "problem",
  intake: "problem",
  show_router: "show_router",
  inspect_lights: "lights",
  recheck_lights: "lights",
  show_cables: "cables",
  guide_power_supply: "guidance",
  guide_reseat_cable: "guidance",
  guide_power_cycle: "guidance",
  run_line_test: "action",
  confirm_working: "confirm",
  close_case: "confirm",
  resolved: "ended",
};

const STEP_CAPTION: Record<string, string> = {
  welcome: "The AI assistant greets the customer.",
  intake: "The AI asks the customer to describe the problem.",
  show_router:
    "The AI asks to see the router. The phone sends a single still only once the picture is steady. It doesn't stream video to the model.",
  inspect_lights: "The AI asks for a closer view of the lights and records each light as an observation with a confidence score.",
  recheck_lights: "The AI checks the lights again to see whether the step worked.",
  show_cables: "The internet light isn't right, so the AI asks to see the cables at the back.",
  guide_power_supply: "The AI gives one approved instruction: check the power supply.",
  guide_reseat_cable: "The broadband cable looks loose, so the AI guides the customer to push it back in.",
  guide_power_cycle: "The cables are fine, so the AI walks the customer through an approved power cycle.",
  run_line_test: "The AI runs a line test. It's a policy-checked, idempotent business action that runs outside the media loop.",
  confirm_working: "The AI asks the customer to confirm the internet is working.",
  close_case: "The case is updated in the CRM and the session is closed.",
};

function customerSaid(s: SessionState): number {
  return s.transcript.filter((t) => t.speaker === "customer").length;
}

function visits(s: SessionState, step: string): number {
  return s.workflow.history.filter((h) => h.stepKey === step).length;
}

/** Decide the next scripted move for the session. Pure. */
export function direct(s: SessionState, agentId: string): DirectorDecision {
  const step = s.workflow.currentStep ?? "";
  const scenario = s.session.scenario ? getScenario(s.session.scenario) : undefined;

  if (s.session.status === "completed" || s.session.status === "failed") {
    const how =
      s.session.outcome === "resolved_by_ai"
        ? "Resolved by the AI, with no human needed."
        : s.session.outcome === "resolved_by_human"
          ? "Resolved by the human agent, who started from the AI's full context."
          : "Session ended.";
    return { stage: "ended", caption: `${how} Every step, observation and action is in the audit trail in the platform.`, done: true };
  }

  if (s.customerState === "consent" || s.session.status === "awaiting_consent" || s.session.status === "created")
    return { stage: "consent", caption: "The customer opens the secure link (no app needed), reads the privacy notice and turns the camera on." };

  // --- Human path ----------------------------------------------------------
  if (s.escalation) {
    const me = s.participants.find((p) => p.type === "human_agent" && p.userId === agentId && !p.leftAt);
    if (s.session.ownerType !== "human") {
      if (!me)
        return {
          stage: "escalation",
          caption: `Escalated (${s.escalation.reasonDetail ?? s.escalation.reason}). The queue gets a structured handover: a summary, the evidence, the observations and the steps already tried.`,
          next: { key: "join", actor: "agent", command: { type: "human.join" }, delayMs: 3500 },
        };
      return {
        stage: "human",
        caption: "The agent joins. They see the live camera and the full AI context, and the customer sees that a person is connecting.",
        next: { key: "take_over", actor: "agent", command: { type: "human.take_over" }, delayMs: 2500 },
      };
    }
    const tool = s.workflow.toolFacts["line_test.status"] === "fault_detected" ? "book_engineer" : "create_ticket";
    const action = s.toolActions.find((t) => t.toolName === tool && t.requestedBy === "human");
    if (!action)
      return {
        stage: "human",
        caption:
          tool === "book_engineer"
            ? "The agent joined and took over, so the AI has stopped acting. The line test found a fault, so the agent books an engineer, which policy allows only a human to do."
            : "The agent joined and took over, so the AI has stopped acting. The agent raises a ticket with everything already captured.",
        next: { key: `action:${tool}`, actor: "agent", command: { type: "human.run_action", tool, params: {} }, delayMs: 3000 },
      };
    if (action.status === "requested" || action.status === "running") return { stage: "human", caption: "The business action is running…" };
    return {
      stage: "human",
      caption: "Done. The agent closes the session and records the outcome.",
      next: { key: "end", actor: "agent", command: { type: "session.end", outcome: "resolved_by_human" }, delayMs: 3000 },
    };
  }

  // --- AI path -------------------------------------------------------------
  const stage = STEP_STAGE[step] ?? "problem";
  const caption = STEP_CAPTION[step] ?? "The AI is working through the approved workflow.";

  if (s.customerState === "resolved" || step === "resolved")
    return {
      stage: "confirm",
      caption: "Resolved by the AI. The customer confirmed, the case is updated and the customer ends the call.",
      next: { key: "customer_end", actor: "customer", command: { type: "session.end" }, delayMs: 3500 },
    };

  if (s.customerState === "conversation" && step === "intake" && customerSaid(s) === 0)
    return {
      stage,
      caption,
      next: { key: "problem", actor: "customer", command: { type: "customer.utterance", text: "My broadband isn't working. The internet light is off.", confidence: 1 }, delayMs: 2500 },
    };

  if (s.customerState === "guidance")
    return {
      stage: "guidance",
      caption,
      next: { key: `done:${step}:${visits(s, step)}`, actor: "customer", command: { type: "customer.utterance", text: "Done", confidence: 1 }, delayMs: 3500 },
    };

  if (s.customerState === "conversation" && step === "confirm_working") {
    const yes = scenario?.confirmsWorking ?? true;
    return {
      stage: "confirm",
      caption,
      next: {
        key: `confirm:${visits(s, step)}`,
        actor: "customer",
        command: { type: "customer.utterance", text: yes ? "Yes, it's working now" : "No, still nothing", confidence: 1 },
        delayMs: 2500,
      },
    };
  }

  if (s.customerState === "need_closer_view" || s.customerState === "need_another_angle")
    return { stage, caption: "The picture wasn't clear enough, so the AI won't guess. It asks for a closer view instead." };
  if (s.customerState === "analysing") return { stage, caption: `${caption} Analysing the still…` };
  return { stage, caption };
}

/** Stages the session has passed through, for the progress checklist. */
export function reachedStages(s: SessionState): Set<WalkthroughStage> {
  const out = new Set<WalkthroughStage>();
  if (s.consent) out.add("consent");
  for (const h of s.workflow.history) {
    const st = STEP_STAGE[h.stepKey];
    if (st && st !== "ended") out.add(st);
  }
  if (s.toolActions.some((t) => t.toolName === "line_test")) out.add("action");
  if (s.escalation) out.add("escalation");
  if (s.participants.some((p) => p.type === "human_agent")) out.add("human");
  if (s.session.status === "completed" || s.session.status === "failed") out.add("ended");
  return out;
}
