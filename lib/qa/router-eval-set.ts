import type { RouterScene } from "@/lib/media/router-svg";
import { sceneToRef } from "@/lib/simulation/demo-scene";
import type { EvalCase, EvaluationSet } from "./evaluation";

/**
 * Seeded evaluation set for Router Troubleshooting, generated from synthetic
 * router scenes (lib/media/router-svg.ts). Each case pairs a scene with the
 * observations a correct reader should report at a workflow checkpoint.
 * `null` means the item cannot be determined from the image, so the right
 * answer is to decline (unreadable, uncertain or not visible).
 */

type Lights = `${string}-${string}-${string}`;

function scene(view: RouterScene["view"], lights: Lights, cable: RouterScene["cable"] = "connected", flags: { glare?: boolean; other?: boolean } = {}): string {
  const [power, internet, wifi] = lights.split("-");
  return sceneToRef({ view, power, internet, wifi, cable, glare: flags.glare, otherDevice: flags.other });
}

function c(id: string, title: string, tags: string[], ref: string, checkpoint: string, expected: Record<string, string | null>): EvalCase {
  return { id, title, tags, image: { kind: "synthetic", ref }, checkpoint, expected };
}

export const EVAL_TAG_LABELS: Record<string, string> = {
  clear: "Clear evidence",
  lights_on: "Lights on",
  lights_off: "Lights off",
  light_red: "Red indicator",
  light_amber: "Amber indicator",
  glare: "Glare",
  wrong_device: "Wrong device",
  wrong_view: "Wrong view",
  cable_connected: "Cable connected",
  cable_disconnected: "Cable disconnected",
};

const LIGHTS = "router_lights";
const FRONT = "router_front";
const REAR = "router_rear";

export const ROUTER_EVAL_SET: EvaluationSet = {
  id: "router-synthetic-v1",
  name: "Router evidence — synthetic scenes",
  description:
    "Labelled router frames rendered from synthetic scenes: indicator lights on, off, red and amber; glare; the wrong device; the wrong view; and a disconnected broadband cable. Expected values use the Router Troubleshooting observation vocabulary.",
  workflowId: "wf_router_v3",
  version: 1,
  cases: [
    c("front-router", "Router front, clear", ["clear"], scene("front", "on-on-on"), FRONT, { device_identified: "router" }),
    c("wide-router", "Router in a wide shot", ["clear"], scene("wide", "on-off-on"), FRONT, { device_identified: "router" }),
    c("front-router-glare", "Router front with glare", ["glare"], scene("front", "on-off-on", "connected", { glare: true }), FRONT, { device_identified: "router" }),
    c("front-tv-box", "TV set-top box instead of the router", ["wrong_device"], scene("front", "on-off-on", "connected", { other: true }), FRONT, { device_identified: "other_device" }),

    c("lights-all-on", "All lights on", ["clear", "lights_on"], scene("close_up", "on-on-on"), LIGHTS, { power_light: "on", internet_light: "on", wifi_light: "on" }),
    c("lights-internet-off", "Internet light off", ["clear", "lights_off"], scene("close_up", "on-off-on"), LIGHTS, { power_light: "on", internet_light: "off", wifi_light: "on" }),
    c("lights-wifi-off", "Wi-Fi light off", ["clear", "lights_off"], scene("close_up", "on-on-off"), LIGHTS, { power_light: "on", internet_light: "on", wifi_light: "off" }),
    c("lights-all-off", "Router powered off", ["clear", "lights_off"], scene("close_up", "off-off-off"), LIGHTS, { power_light: "off", internet_light: "off", wifi_light: "off" }),
    c("lights-internet-red", "Internet light red", ["clear", "light_red"], scene("close_up", "on-red-on"), LIGHTS, { power_light: "on", internet_light: "red", wifi_light: "on" }),
    c("lights-internet-amber", "Internet light amber", ["light_amber"], scene("close_up", "on-amber-on"), LIGHTS, { power_light: "on", internet_light: "amber", wifi_light: "on" }),
    c("lights-amber-wifi-off", "Internet amber, Wi-Fi off", ["light_amber", "lights_off"], scene("close_up", "on-amber-off"), LIGHTS, { power_light: "on", internet_light: "amber", wifi_light: "off" }),
    c("lights-power-amber", "Power light amber", ["light_amber"], scene("close_up", "amber-off-on"), LIGHTS, { power_light: "amber", internet_light: "off", wifi_light: "on" }),
    c("lights-glare-internet-off", "Glare over the lights (internet off)", ["glare"], scene("close_up", "on-off-on", "connected", { glare: true }), LIGHTS, {
      power_light: "on",
      internet_light: null,
      wifi_light: null,
    }),
    c("lights-glare-all-on", "Glare over the lights (all on)", ["glare"], scene("close_up", "on-on-on", "connected", { glare: true }), LIGHTS, {
      power_light: "on",
      internet_light: null,
      wifi_light: null,
    }),
    c("lights-tv-box", "TV box shown when asked for the lights", ["wrong_device"], scene("close_up", "on-off-on", "connected", { other: true }), LIGHTS, {
      power_light: null,
      internet_light: null,
      wifi_light: null,
    }),
    c("lights-rear-view", "Rear of the router shown when asked for the lights", ["wrong_view"], scene("rear", "on-off-on"), LIGHTS, {
      power_light: null,
      internet_light: null,
      wifi_light: null,
    }),

    c("rear-connected", "Rear, broadband cable connected", ["clear", "cable_connected"], scene("rear", "on-on-on"), REAR, { broadband_cable: "connected", power_cable: "connected" }),
    c("rear-disconnected", "Rear, broadband cable disconnected", ["cable_disconnected"], scene("rear", "on-red-on", "disconnected"), REAR, {
      broadband_cable: "disconnected",
      power_cable: "connected",
    }),
    c("rear-front-view", "Front shown when asked for the rear", ["wrong_view"], scene("front", "on-off-on"), REAR, { broadband_cable: null, power_cable: null }),
    c("rear-tv-box", "TV box shown when asked for the rear", ["wrong_device"], scene("rear", "on-off-on", "connected", { other: true }), REAR, { broadband_cable: null, power_cable: null }),
  ],
};
