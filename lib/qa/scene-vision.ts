import { parseSyntheticRef, type RouterScene } from "@/lib/media/router-svg";
import { simulateUtterance } from "@/lib/providers/mock/reasoning";
import type { EvidenceInput, EvidenceInterpretation, ReasoningProvider, UtteranceInput, UtteranceInterpretation } from "@/lib/providers/types";
import type { ObservationInput } from "@/lib/session/orchestrator";
import { hashUnit } from "./sampling";

export const SCENE_VISION_MODEL = "aiuk-vision-scene-sim-1";

/**
 * Simulated vision provider for evaluation runs. It "reads" a synthetic router
 * scene from the frame reference (synthetic:<view>:<lights>:<cable>[:glare][:other])
 * and answers for the observation types the workflow step asks about.
 *
 * It is deliberately imperfect, the way a real model is, so the evaluation
 * pipeline has something to measure:
 * - amber indicators are often read as red (a colour confusion);
 * - glare hides the lower lights, and the power light is read at lower confidence;
 * - a device that is not a router hides every light and port.
 * Confidence carries a small deterministic jitter per scene and item.
 *
 * Real captured frames have no scene to read, so they are rejected.
 */
export class SceneVisionProvider implements ReasoningProvider {
  readonly id = "scene-vision-sim";
  readonly simulated = true;
  readonly modelVersion = SCENE_VISION_MODEL;

  async interpretUtterance(input: UtteranceInput): Promise<UtteranceInterpretation> {
    return simulateUtterance(input);
  }

  async interpretEvidence(input: EvidenceInput): Promise<EvidenceInterpretation> {
    const ref = input.visualEvent.frameReference;
    const scene = parseSyntheticRef(ref);
    if (!scene) throw new Error("The simulated provider can only read synthetic scenes; run this case against a real model.");
    const types = input.step?.evidence?.observationTypes ?? Object.keys(input.workflow.observationVocabulary ?? {});
    const observations = types.map((t) => readScene(scene, t, ref)).filter((o): o is ObservationInput => Boolean(o));
    return { observations, modelVersion: SCENE_VISION_MODEL, latencyMs: 0 };
  }
}

function jitter(ref: string, type: string): number {
  return (hashUnit(`${ref}|${type}`) - 0.5) * 0.06;
}

function clamp(n: number): number {
  return Math.round(Math.min(0.99, Math.max(0.05, n)) * 100) / 100;
}

function seen(type: string, value: string, text: string, confidence: number): ObservationInput {
  return {
    observationType: type,
    value,
    observationText: text,
    confidence,
    status: confidence >= 0.85 ? "confirmed_visible" : "likely_visible",
    requiresConfirmation: confidence < 0.85,
  };
}

function notSeen(type: string, text: string, status: ObservationInput["status"], confidence: number, next?: string): ObservationInput {
  return { observationType: type, observationText: text, confidence, status, requiresConfirmation: true, recommendedNextAction: next };
}

const LIGHT_LABEL: Record<string, string> = { power_light: "Power", internet_light: "Internet", wifi_light: "Wi-Fi" };
const LIGHT_KEY: Record<string, keyof Pick<RouterScene, "power" | "internet" | "wifi">> = { power_light: "power", internet_light: "internet", wifi_light: "wifi" };

function readScene(scene: RouterScene, type: string, ref: string): ObservationInput | undefined {
  const j = jitter(ref, type);
  if (type === "device_identified") {
    return scene.otherDevice
      ? seen(type, "other_device", "Device appears to be a TV set-top box, not a broadband router", clamp(0.86 + j))
      : seen(type, "router", "Broadband router identified", clamp((scene.glare ? 0.84 : 0.94) + j));
  }

  if (type in LIGHT_KEY) {
    const label = LIGHT_LABEL[type];
    if (scene.otherDevice) return notSeen(type, `${label} light not visible — this is not a router`, "not_visible", clamp(0.9 + j));
    if (scene.view === "rear") return notSeen(type, `${label} light not visible from the rear`, "not_visible", clamp(0.92 + j));
    const actual = scene[LIGHT_KEY[type]];
    if (scene.glare && type !== "power_light") {
      return type === "internet_light"
        ? notSeen(type, "Internet indicator cannot be read — glare across the lower panel", "unreadable", clamp(0.31 + j), "request_closer_view")
        : notSeen(type, "Wi-Fi indicator partially obscured by glare", "uncertain", clamp(0.44 + j), "request_closer_view");
    }
    if (actual === "amber") {
      // Known weakness: amber and red are confused under warm lighting.
      return type === "internet_light"
        ? seen(type, "red", `${label} light: red`, clamp(0.78 + j))
        : seen(type, "amber", `${label} light: amber`, clamp(0.7 + j));
    }
    const base = scene.glare ? 0.72 : actual === "red" ? 0.83 : actual === "off" ? 0.88 : 0.93;
    return seen(type, actual, `${label} light: ${actual === "on" ? "on (solid)" : actual}`, clamp(base + j));
  }

  if (type === "broadband_cable" || type === "power_cable") {
    const label = type === "broadband_cable" ? "Broadband cable" : "Power adapter";
    if (scene.otherDevice) return notSeen(type, `${label} not visible — this is not a router`, "not_visible", clamp(0.88 + j));
    if (scene.view !== "rear") return notSeen(type, `${label} not visible from the front`, "not_visible", clamp(0.9 + j), "request_another_angle");
    if (type === "power_cable") return seen(type, "connected", "Power adapter connected", clamp(0.93 + j));
    return scene.cable === "connected"
      ? seen(type, "connected", "Broadband cable seated in the Broadband port", clamp(0.88 + j))
      : seen(type, "disconnected", "Broadband cable appears partly out of the Broadband port", clamp(0.8 + j));
  }
  return undefined;
}
