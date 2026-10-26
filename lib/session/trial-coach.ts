import type { SessionState } from "@/lib/domain/session";
import { OUTCOME_LABELS } from "@/lib/domain/labels";

/**
 * What a trial tester should do next, worked out from the live session. Pure,
 * so every state has a test. "actor" says which side of the call needs
 * attention: the customer's screen or the agent's.
 */

export interface CoachStep {
  key: string;
  title: string;
  detail: string;
  actor: "customer" | "agent" | "nobody";
  tone: "wait" | "go" | "done";
}

const CLEAR = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function coachFor(state: SessionState | undefined): CoachStep {
  if (!state) return { key: "loading", title: "Setting things up…", detail: "This takes a moment.", actor: "nobody", tone: "wait" };
  const s = state.session;

  if (s.status === "completed" || s.status === "failed") {
    return {
      key: "finished",
      title: "The conversation has finished",
      detail: `${s.outcome ? OUTCOME_LABELS[s.outcome] : "Ended"}. Open the full record to see what was said, what the AI saw and what was done.`,
      actor: "nobody",
      tone: "done",
    };
  }

  if (s.ownerType === "human") {
    return {
      key: "agent_in_control",
      title: "The human agent is in control",
      detail: "On the agent screen, type a message, ask the customer for a photo, or run an action. Messages appear on the customer's screen at once. When you're done, press End, then Resolved.",
      actor: "agent",
      tone: "go",
    };
  }

  const agentJoined = state.participants.some((p) => p.type === "human_agent" && !p.leftAt);
  if (s.status === "escalated" || state.customerState === "escalating" || state.customerState === "human_connected") {
    return agentJoined
      ? {
          key: "agent_joined",
          title: "You've joined the session",
          detail: "You can see everything, but the AI is still in charge. Press Take over to talk to the customer yourself.",
          actor: "agent",
          tone: "go",
        }
      : {
          key: "needs_agent",
          title: "The customer asked for a person",
          detail: "On the agent screen press Join session, then Take over. You'll see the whole conversation and every photo, so the customer repeats nothing.",
          actor: "agent",
          tone: "go",
        };
  }

  switch (state.customerState) {
    case "consent":
      return {
        key: "waiting_customer",
        title: "Waiting for the customer",
        detail: "Open the customer view, ideally on your phone. Tap Agree and continue, then allow the camera and microphone.",
        actor: "customer",
        tone: "wait",
      };
    case "conversation":
      return {
        key: "talk",
        title: "The AI is listening",
        detail: state.transcript.some((t) => t.speaker === "customer")
          ? "On the customer screen, answer the AI, or show it the problem with the camera."
          : "On the customer screen, say or type what's wrong, for example “My internet isn't working”.",
        actor: "customer",
        tone: "go",
      };
    case "show_object":
      return { key: "show", title: "The AI wants to see it", detail: "Point the customer's camera at the problem and hold it steady for a moment.", actor: "customer", tone: "go" };
    case "need_closer_view":
    case "need_another_angle":
      return {
        key: "better_view",
        title: "The AI wasn't sure what it saw",
        detail: "It asked for a better view instead of guessing. Move closer, add light, or change the angle.",
        actor: "customer",
        tone: "go",
      };
    case "analysing":
      return { key: "analysing", title: "The AI is looking at the picture", detail: "It checks what it can see and how sure it is. Wait a moment.", actor: "nobody", tone: "wait" };
    case "guidance":
    case "waiting_action":
      return {
        key: "instruction",
        title: "The AI gave an instruction",
        detail: `“${CLEAR(state.instruction.text)}” Do it, then tap Done on the customer screen. To bring in a person instead, tap Human help.`,
        actor: "customer",
        tone: "go",
      };
    case "resolved":
      return { key: "resolved", title: "The AI thinks it's fixed", detail: "Confirm on the customer screen, or tap Human help if it isn't.", actor: "customer", tone: "go" };
    default:
      return { key: "running", title: "The conversation is running", detail: "Carry on with the customer screen.", actor: "customer", tone: "go" };
  }
}
