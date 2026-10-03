import type { ConnectionQuality, SceneKind } from "@/lib/types";

export type AssistStateId =
  | "connecting"
  | "permission"
  | "greeting"
  | "show_router"
  | "hold_steady"
  | "analysing"
  | "closer_view"
  | "human_joining"
  | "complete";

export type VoiceStatus = "Connecting" | "AI connected" | "AI speaking" | "Listening" | "Analysing" | "Human joining" | "Human connected" | "Ended";
export type CameraOverlay = "none" | "framing_guide" | "steady" | "scan" | "move_closer" | "handover";

export interface CaptionLine { speaker: "ai" | "customer" | "system" | "human"; text: string }

export interface AssistState {
  id: AssistStateId;
  title: string; // reviewer-facing name
  description: string; // reviewer-facing note
  instruction: string; // AI instruction card (customer-facing)
  instructionHint?: string;
  captions: CaptionLine[];
  voice: VoiceStatus;
  voiceTone: "neutral" | "ok" | "brand" | "info" | "warn" | "human";
  overlay: CameraOverlay;
  scene: SceneKind;
  showBoxes: boolean;
  connection: ConnectionQuality;
  /** Seconds the auto-play dwells on this state. */
  dwell: number;
}

export const ASSIST_STATES: AssistState[] = [
  {
    id: "connecting", title: "Connecting", description: "Secure session is being established after the customer scans the QR code.",
    instruction: "Connecting you to ClearWave support", instructionHint: "This usually takes a few seconds.",
    captions: [{ speaker: "system", text: "Establishing a secure connection…" }],
    voice: "Connecting", voiceTone: "neutral", overlay: "none", scene: "router_front", showBoxes: false, connection: "fair", dwell: 3,
  },
  {
    id: "permission", title: "Requesting camera permission", description: "Browser permission prompt for camera and microphone. The session cannot continue until the customer allows access.",
    instruction: "Allow camera and microphone access", instructionHint: "Your camera lets the adviser see the problem. You stay in control and can turn it off at any time.",
    captions: [{ speaker: "system", text: "Waiting for camera and microphone permission." }],
    voice: "Connecting", voiceTone: "neutral", overlay: "none", scene: "router_front", showBoxes: false, connection: "good", dwell: 4,
  },
  {
    id: "greeting", title: "AI speaking (greeting)", description: "Voice agent introduces itself and confirms the problem.",
    instruction: "Listening to Ava", instructionHint: "Ava will guide you step by step.",
    captions: [
      { speaker: "ai", text: "Hello, I'm Ava from ClearWave support. I can see and hear you." },
      { speaker: "ai", text: "I understand your internet isn't working. Let's take a look together." },
    ],
    voice: "AI speaking", voiceTone: "brand", overlay: "framing_guide", scene: "router_front", showBoxes: false, connection: "excellent", dwell: 4,
  },
  {
    id: "show_router", title: "Please show the router", description: "AI requests the first workflow checkpoint view.",
    instruction: "Please show me the front of your router", instructionHint: "Point the camera at the lights on the front panel.",
    captions: [
      { speaker: "ai", text: "Could you show me the front of the router, so I can see the lights?" },
      { speaker: "customer", text: "Sure, here it is." },
    ],
    voice: "Listening", voiceTone: "ok", overlay: "framing_guide", scene: "router_front", showBoxes: false, connection: "excellent", dwell: 4,
  },
  {
    id: "hold_steady", title: "Hold steady", description: "Router detected. AI asks the customer to hold still so a clear still can be selected.",
    instruction: "Hold steady", instructionHint: "Keep the router in the frame for a moment.",
    captions: [{ speaker: "ai", text: "That's a Hub 5, perfect. Please hold steady for a moment." }],
    voice: "AI speaking", voiceTone: "brand", overlay: "steady", scene: "router_front", showBoxes: true, connection: "excellent", dwell: 3,
  },
  {
    id: "analysing", title: "Analysing", description: "Selected still images are analysed. Scan animation indicates work in progress.",
    instruction: "Looking at the status lights", instructionHint: "You can keep the camera where it is.",
    captions: [{ speaker: "ai", text: "Power is solid green and the DSL light is flashing amber. I'm looking at the Internet light now." }],
    voice: "Analysing", voiceTone: "info", overlay: "scan", scene: "router_lights", showBoxes: true, connection: "good", dwell: 4,
  },
  {
    id: "closer_view", title: "Need a closer view", description: "Confidence below threshold; AI asks for a better view rather than guessing.",
    instruction: "Move a little closer and tilt away from the window", instructionHint: "There is some glare on the lights.",
    captions: [
      { speaker: "ai", text: "I can't quite read the Internet light. Could you move a little closer and tilt it away from the window?" },
      { speaker: "customer", text: "Okay, is that better?" },
    ],
    voice: "Listening", voiceTone: "warn", overlay: "move_closer", scene: "router_blur", showBoxes: true, connection: "fair", dwell: 4,
  },
  {
    id: "human_joining", title: "Human joining", description: "Policy threshold not met; session escalates with the evidence package attached.",
    instruction: "Connecting you to a colleague", instructionHint: "They can already see what you have shown so far. You won't need to repeat yourself.",
    captions: [
      { speaker: "ai", text: "I'm not confident I can see everything I need, so I'm bringing in a colleague who can see exactly what we've covered. One moment." },
      { speaker: "system", text: "Priya Nair is joining the session." },
    ],
    voice: "Human joining", voiceTone: "human", overlay: "handover", scene: "router_blur", showBoxes: false, connection: "good", dwell: 4,
  },
  {
    id: "complete", title: "Session complete", description: "Summary and feedback request. Case reference is sent by SMS.",
    instruction: "Session complete", instructionHint: "Thank you for showing us the problem.",
    captions: [{ speaker: "system", text: "Session ended. Summary sent to your mobile." }],
    voice: "Ended", voiceTone: "neutral", overlay: "none", scene: "router_lights", showBoxes: false, connection: "good", dwell: 0,
  },
];

export const STATE_INDEX: Record<AssistStateId, number> = Object.fromEntries(ASSIST_STATES.map((s, i) => [s.id, i])) as Record<AssistStateId, number>;
