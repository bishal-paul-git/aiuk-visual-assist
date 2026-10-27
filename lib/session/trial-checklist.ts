import type { SessionState } from "@/lib/domain/session";

/**
 * The tester's checklist for a trial conversation: each part of the product
 * worth trying, ticked off from the real session as it happens, so a tester
 * can see what they have covered and what is left, without a guide.
 */

export interface ChecklistItem {
  key: string;
  label: string;
  /** How to try it, shown while it is not yet done. */
  how: string;
  done: boolean;
}

export function checklistFor(state: SessionState | undefined): ChecklistItem[] {
  const s = state;
  const t = s?.transcript ?? [];
  const audit = new Set((s?.audit ?? []).map((a) => a.eventType));
  const human = (s?.participants ?? []).some((p) => p.type === "human_agent");
  const observations = s?.observations ?? [];
  const items: ChecklistItem[] = [
    {
      key: "joined",
      label: "The customer opened the link and agreed",
      how: "Open the customer view on your phone and tap Agree and continue.",
      done: Boolean(s?.consent?.acceptedAt),
    },
    {
      key: "told",
      label: "The customer described the problem",
      how: "Say or type what's wrong, for example “My broadband isn't working”.",
      done: t.some((x) => x.speaker === "customer"),
    },
    {
      key: "seen",
      label: "The AI read a picture from the camera",
      how: "Point the camera where the AI asks. A line saying “I saw: …” appears on the phone. Check it matches.",
      done: observations.length > 0,
    },
    {
      key: "unclear",
      label: "The AI asked for a better view instead of guessing",
      how: "Show something blurry, dark or too far away.",
      done: audit.has("ai.uncertain") || (s?.audit ?? []).some((a) => a.eventType === "ai.visual_request" && a.payload.reason !== "initial"),
    },
    {
      key: "no_camera",
      label: "The AI helped without the camera",
      how: "Turn the camera off, or say “I can't show you”. The AI asks you to describe it instead.",
      done: (s?.workflow.history ?? []).some((h) => h.stepKey.startsWith("describe_") || h.stepKey.endsWith("_by_touch")),
    },
    {
      key: "asked",
      label: "The customer asked for a person",
      how: "Tap Human help on the phone. The agent screen chimes.",
      done: Boolean(s?.escalation),
    },
    {
      key: "agent",
      label: "A person joined and talked to the customer",
      how: "On the agent screen press Join session, then send a message.",
      done: human && t.some((x) => x.speaker === "human_agent"),
    },
    {
      key: "ended",
      label: "The conversation was finished",
      how: "Press End on either side. The full record is then in Sessions.",
      done: s?.session.status === "completed" || s?.session.status === "failed",
    },
  ];
  return items;
}
