import type { ObservationInput } from "@/lib/session/orchestrator";

/**
 * Scenario scripts for the simulated vision provider. These exist so the full
 * product loop (including uncertainty, escalation and failure paths) can be
 * exercised end-to-end before a real multimodal model is connected. Every
 * observation produced here is labelled with a "-sim" model version.
 */

export type RouterLights = { power: "on" | "off"; internet: "on" | "off" | "red"; wifi: "on" | "off" };

export interface ScenarioDefinition {
  key: string;
  name: string;
  description: string;
  expectedOutcome: string;
  /** Light states before and after the customer's intervention. */
  lightsBefore: RouterLights;
  lightsAfter: RouterLights;
  broadbandCable: "connected" | "disconnected";
  lineTest: "fault_detected" | "no_fault" | "error";
  /** Attempts (1-based) on which a checkpoint returns unreadable evidence. */
  unclear?: Partial<Record<string, number[]>>;
  wrongDeviceFirst?: boolean;
  visionOutage?: boolean;
  /** Sensitive content visible in the first router frame. */
  sensitiveFirst?: "payment_card" | "person";
  /** Simulated customer answer to "is it working now?" */
  confirmsWorking: boolean;
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    key: "wan_down",
    name: "Internet light off — line fault",
    description: "Power and Wi-Fi on, internet off. Cables fine, power cycle doesn't help, line test finds a fault.",
    expectedOutcome: "Escalates to Level 2 with full context",
    lightsBefore: { power: "on", internet: "off", wifi: "on" },
    lightsAfter: { power: "on", internet: "off", wifi: "on" },
    broadbandCable: "connected",
    lineTest: "fault_detected",
    confirmsWorking: false,
  },
  {
    key: "power_cycle_fix",
    name: "Resolved by power cycle",
    description: "Internet light off; after a guided restart it comes back on and the customer confirms.",
    expectedOutcome: "Resolved by AI",
    lightsBefore: { power: "on", internet: "off", wifi: "on" },
    lightsAfter: { power: "on", internet: "on", wifi: "on" },
    broadbandCable: "connected",
    lineTest: "no_fault",
    confirmsWorking: true,
  },
  {
    key: "loose_cable",
    name: "Loose broadband cable",
    description: "Rear view shows the broadband cable is not seated; reseating restores service.",
    expectedOutcome: "Resolved by AI",
    lightsBefore: { power: "on", internet: "red", wifi: "on" },
    lightsAfter: { power: "on", internet: "on", wifi: "on" },
    broadbandCable: "disconnected",
    lineTest: "no_fault",
    confirmsWorking: true,
  },
  {
    key: "glare_then_clear",
    name: "Glare — needs closer view",
    description: "First close-up is unreadable due to glare; AI asks for a closer view before continuing.",
    expectedOutcome: "Recovers evidence, then escalates to Level 2",
    lightsBefore: { power: "on", internet: "off", wifi: "on" },
    lightsAfter: { power: "on", internet: "off", wifi: "on" },
    broadbandCable: "connected",
    lineTest: "fault_detected",
    unclear: { router_lights: [1] },
    confirmsWorking: false,
  },
  {
    key: "persistently_unclear",
    name: "Evidence never clear",
    description: "Status lights stay unreadable after the maximum number of attempts.",
    expectedOutcome: "Escalates — visual evidence unclear",
    lightsBefore: { power: "on", internet: "off", wifi: "on" },
    lightsAfter: { power: "on", internet: "off", wifi: "on" },
    broadbandCable: "connected",
    lineTest: "no_fault",
    unclear: { router_lights: [1, 2, 3] },
    confirmsWorking: false,
  },
  {
    key: "wrong_device",
    name: "Wrong device shown first",
    description: "Customer first shows a TV box; AI asks again for the router, then the issue resolves.",
    expectedOutcome: "Resolved by AI",
    lightsBefore: { power: "on", internet: "off", wifi: "on" },
    lightsAfter: { power: "on", internet: "on", wifi: "on" },
    broadbandCable: "connected",
    lineTest: "no_fault",
    wrongDeviceFirst: true,
    confirmsWorking: true,
  },
  {
    key: "card_in_frame",
    name: "Bank card in view",
    description: "A payment card is visible next to the router; tenant policy says this must go to a person.",
    expectedOutcome: "Escalates — safety policy",
    lightsBefore: { power: "on", internet: "off", wifi: "on" },
    lightsAfter: { power: "on", internet: "off", wifi: "on" },
    broadbandCable: "connected",
    lineTest: "no_fault",
    sensitiveFirst: "payment_card",
    confirmsWorking: false,
  },
  {
    key: "vision_outage",
    name: "Vision model outage",
    description: "The visual reasoning provider fails; the session falls back to a human without losing context.",
    expectedOutcome: "Escalates — AI model failure",
    lightsBefore: { power: "on", internet: "off", wifi: "on" },
    lightsAfter: { power: "on", internet: "off", wifi: "on" },
    broadbandCable: "connected",
    lineTest: "no_fault",
    visionOutage: true,
    confirmsWorking: false,
  },
];

export const DEFAULT_SCENARIO = "wan_down";

export function getScenario(key: string | undefined): ScenarioDefinition {
  return SCENARIOS.find((s) => s.key === key) ?? SCENARIOS.find((s) => s.key === DEFAULT_SCENARIO)!;
}

const LIGHT_TEXT: Record<string, string> = { on: "on (solid)", off: "off", red: "red", amber: "amber" };

function light(type: "power_light" | "internet_light" | "wifi_light", label: string, value: string, confidence: number): ObservationInput {
  return {
    observationType: type,
    value,
    observationText: `${label} light: ${LIGHT_TEXT[value] ?? value}`,
    confidence,
    status: confidence >= 0.85 ? "confirmed_visible" : "likely_visible",
    requiresConfirmation: confidence < 0.85,
  };
}

export interface FrameContext {
  checkpoint: string;
  attempt: number;
  /** Whether the customer has completed the intervention (power cycle / reseat). */
  afterIntervention: boolean;
}

export function scenarioObservations(sc: ScenarioDefinition, f: FrameContext): ObservationInput[] {
  const lights = f.afterIntervention ? sc.lightsAfter : sc.lightsBefore;
  const unclear = sc.unclear?.[f.checkpoint]?.includes(f.attempt) ?? false;

  switch (f.checkpoint) {
    case "router_front":
      if (sc.sensitiveFirst && f.attempt === 1) {
        return [
          {
            observationType: "device_identified",
            value: "router",
            observationText: "X Telecom Hub 4 router identified (front panel)",
            confidence: 0.92,
            status: "confirmed_visible",
            requiresConfirmation: false,
          },
          {
            observationType: "sensitive_content",
            value: sc.sensitiveFirst,
            observationText: `Sensitive content may be visible: ${sc.sensitiveFirst.replace("_", " ")}`,
            confidence: 0.81,
            status: "likely_visible",
            requiresConfirmation: true,
          },
        ];
      }
      if (sc.wrongDeviceFirst && f.attempt === 1) {
        return [
          {
            observationType: "device_identified",
            value: "other_device",
            observationText: "Device appears to be a TV set-top box, not a broadband router",
            confidence: 0.86,
            status: "confirmed_visible",
            requiresConfirmation: false,
          },
        ];
      }
      return [
        {
          observationType: "device_identified",
          value: "router",
          observationText: "X Telecom Hub 4 router identified (front panel)",
          confidence: 0.94,
          status: "confirmed_visible",
          requiresConfirmation: false,
        },
      ];
    case "router_lights":
    case "router_lights_recheck":
    case "human_request": {
      if (unclear) {
        return [
          { ...light("power_light", "Power", lights.power, 0.72), status: "likely_visible", requiresConfirmation: true },
          {
            observationType: "internet_light",
            observationText: "Internet indicator cannot be read — strong glare across the lower panel",
            confidence: 0.31,
            status: "unreadable",
            requiresConfirmation: true,
            recommendedNextAction: "request_closer_view",
          },
          {
            observationType: "wifi_light",
            observationText: "Wi-Fi indicator partially obscured",
            confidence: 0.44,
            status: "uncertain",
            requiresConfirmation: true,
            recommendedNextAction: "request_closer_view",
          },
        ];
      }
      return [
        light("power_light", "Power", lights.power, 0.97),
        light("internet_light", "Internet", lights.internet, lights.internet === "red" ? 0.83 : 0.91),
        light("wifi_light", "Wi-Fi", lights.wifi, 0.9),
      ];
    }
    case "router_rear":
      return [
        {
          observationType: "broadband_cable",
          value: sc.broadbandCable,
          observationText:
            sc.broadbandCable === "connected"
              ? "Grey broadband cable seated in the Broadband port"
              : "Broadband cable appears partly out of the Broadband port",
          confidence: sc.broadbandCable === "connected" ? 0.88 : 0.86,
          status: sc.broadbandCable === "connected" ? "confirmed_visible" : "likely_visible",
          requiresConfirmation: sc.broadbandCable !== "connected",
        },
        {
          observationType: "power_cable",
          value: "connected",
          observationText: "Power adapter connected",
          confidence: 0.93,
          status: "confirmed_visible",
          requiresConfirmation: false,
        },
      ];
    default:
      return [
        {
          observationType: "general_scene",
          observationText: "Frame captured; no workflow checkpoint active",
          confidence: 0.5,
          status: "uncertain",
          requiresConfirmation: true,
        },
      ];
  }
}

export function describeReply(obs: ObservationInput[]): string | undefined {
  const clear = obs.filter((o) => o.status === "confirmed_visible" || o.status === "likely_visible");
  if (clear.length === 0 || clear.length < obs.length) return undefined;
  const lights = clear.filter((o) => o.observationType.endsWith("_light"));
  if (lights.length >= 2) {
    const text = lights.map((o) => `the ${o.observationType.replace("_light", "").replace("wifi", "Wi-Fi")} light is ${o.value}`).join(", ");
    return `Thanks, that's clear — ${text}.`;
  }
  return undefined;
}
