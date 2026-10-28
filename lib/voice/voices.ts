/**
 * Voices for spoken output (ElevenLabs, British English). The AI assistant has
 * one voice; human agents have their own so customers hear the handover.
 * Override with ELEVENLABS_VOICE_ID / ELEVENLABS_AGENT_VOICE_ID(_MALE).
 */

export const VOICES = {
  assistant: { id: "bGnz83yTAb7caZSC7BBz", name: "Georgia K (British female, warm and clear)" },
  agentFemale: { id: "EKpKHSkyNegCyjBRc55p", name: "Ali (British female)" },
  agentMale: { id: "MnTN9XubPKNlI4AwhLj5", name: "Craig (British male)" },
  /** Demo walkthroughs only: the pretend customer speaks too, in a clearly different voice. */
  customer: { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (British male, the demo customer)" },
} as const;

/**
 * Stock British voices every ElevenLabs plan can use. Tried when the main voice
 * is refused for plan or availability reasons, so the line is still spoken.
 */
export const FALLBACK_VOICES = {
  assistant: "Xb7hH8MSUJpSbSDYk0k2", // Alice, British female
  agentFemale: "Xb7hH8MSUJpSbSDYk0k2",
  agentMale: "JBFqnCBsd6RMkjVDRZzb", // George, British male
  customer: "JBFqnCBsd6RMkjVDRZzb",
} as const;

export type VoiceRole = keyof typeof VOICES;

/** Demo agents by first name; anyone else gets the female agent voice. */
const MALE_AGENTS = new Set(["marcus", "tom", "james", "owen"]);

export function voiceRoleFor(speaker: string, speakerName?: string): VoiceRole {
  if (speaker === "customer") return "customer";
  if (speaker !== "human_agent") return "assistant";
  const first = (speakerName ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return MALE_AGENTS.has(first) ? "agentMale" : "agentFemale";
}

/** Stable key for a spoken line: voice role + normalised text (FNV-1a, 32-bit hex). */
export function clipKey(role: VoiceRole, text: string): string {
  const s = `${role}|${text.replace(/\s+/g, " ").trim()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
