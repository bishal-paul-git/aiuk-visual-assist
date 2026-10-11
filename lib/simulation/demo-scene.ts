import type { SessionState } from "@/lib/domain/session";
import type { RouterScene } from "@/lib/media/router-svg";
import { getScenario } from "@/lib/providers/mock/scenarios";

/**
 * What the demo camera should show for a simulated session right now, so the
 * synthetic feed matches what the simulated vision provider reports.
 * Returns undefined for sessions without a simulation scenario.
 */
export function demoSceneFor(state: SessionState): RouterScene | undefined {
  if (!state.session.scenario) return undefined;
  const sc = getScenario(state.session.scenario);
  const after = state.workflow.history.some((h) => h.status === "completed" && h.stepKey.startsWith("guide_"));
  const lights = after ? sc.lightsAfter : sc.lightsBefore;
  const req = state.evidenceRequest;
  const checkpoint = req?.checkpoint ?? "none";
  const attempt = state.visualEvents.filter((v) => v.checkpoint === checkpoint).length + 1;
  return {
    view: (req?.view as RouterScene["view"]) ?? "front",
    power: lights.power,
    internet: lights.internet,
    wifi: lights.wifi,
    cable: sc.broadbandCable,
    glare: Boolean(sc.unclear?.[checkpoint]?.includes(attempt)),
    otherDevice: Boolean(sc.wrongDeviceFirst && checkpoint === "router_front" && attempt === 1),
  };
}

export function sceneToRef(scene: RouterScene): string {
  return `synthetic:${scene.view}:${scene.power}-${scene.internet}-${scene.wifi}:${scene.cable}${scene.glare ? ":glare" : ""}${scene.otherDevice ? ":other" : ""}`;
}
