import { describe, expect, it } from "vitest";
import { AI } from "@/lib/simulation/harness";
import { AGENT, routerHarness, stepPath } from "./helpers";

function start(camera: boolean) {
  const h = routerHarness("wan_down");
  h.send({ type: "media.update", media: { camera, microphone: true } });
  h.send({ type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" });
  h.send({ type: "customer.utterance", text: "My broadband isn't working", confidence: 0.95 });
  return h;
}

/** Stands in for the AI having read the customer's words as `intent` (the simulator only knows the common intents). */
function says(h: ReturnType<typeof start>, _text: string, intent: string) {
  const t = h.state.transcript.filter((x) => x.speaker === "customer").at(-1)!;
  h.send({ type: "utterance.interpreted", transcriptId: t.id, intent }, AI);
}

describe("helping a customer without a camera", () => {
  it("asks for a description instead of a picture when the camera is off", () => {
    const h = start(false);
    expect(h.state.workflow.currentStep).toBe("describe_lights");
    expect(h.state.evidenceRequest).toBeUndefined();
    expect(h.state.instruction.text).toMatch(/without the camera/);

    says(h, "It's yellow", "internet_light_problem");
    expect(h.state.workflow.currentStep).toBe("guide_cables_by_touch");
    says(h, "Done", "done");
    expect(h.state.workflow.currentStep).toBe("guide_power_cycle");
    says(h, "Done", "done");
    expect(h.state.workflow.currentStep).toBe("describe_lights_recheck");
    says(h, "Green now", "internet_light_ok");
    expect(h.state.workflow.currentStep).toBe("confirm_working");
  });

  it("moves to a description when the customer says they can't show it", () => {
    const h = start(true);
    expect(h.state.workflow.currentStep).toBe("show_router");
    h.send({ type: "customer.utterance", text: "Sorry, I can't show it", confidence: 0.95 });
    expect(h.state.transcript.filter((x) => x.speaker === "customer").at(-1)!.intent).toMatch(/^(cannot|no_camera)$/);
    expect(h.state.workflow.currentStep).toBe("describe_lights");
    expect(h.state.evidenceRequest).toBeUndefined();
  });

  it("moves to a description when the camera is turned off mid-step", () => {
    const h = start(true);
    expect(h.state.evidenceRequest).toBeDefined();
    h.send({ type: "media.update", media: { camera: false } });
    expect(h.state.workflow.currentStep).toBe("describe_lights");
    expect(stepPath(h)).toContain("show_router");
  });
});

describe("the words customers use, read by the simulator", () => {
  it("follows the camera-free route from plain words", () => {
    const h = start(false);
    const say = (text: string) => h.send({ type: "customer.utterance", text, confidence: 0.95 });
    say("The internet light is yellow");
    expect(h.state.workflow.currentStep).toBe("guide_cables_by_touch");
    say("Done, it's pushed in");
    say("Okay, done");
    expect(h.state.workflow.currentStep).toBe("describe_lights_recheck");
    say("It's green now");
    expect(h.state.workflow.currentStep).toBe("confirm_working");
  });

  it("hears 'my camera is broken' as no camera", () => {
    const h = start(true);
    h.send({ type: "customer.utterance", text: "My camera is broken", confidence: 0.95 });
    expect(h.state.workflow.currentStep).toBe("describe_lights");
  });
});

describe("a person answering a customer who asked for help", () => {
  it("takes over and says hello as soon as they join", () => {
    const h = start(true);
    h.send({ type: "customer.request_human" });
    h.send({ type: "human.join" }, AGENT);
    expect(h.state.session.ownerType).toBe("human");
    expect(h.state.session.status).toBe("human_active");
    expect(h.state.customerState).toBe("human_connected");
    expect(h.state.instruction.from).toBe("human");
    expect(h.state.transcript.at(-1)).toMatchObject({ speaker: "human_agent", speakerName: "Sarah Jennings" });
    expect(h.state.transcript.at(-1)!.text).toMatch(/^Hi, it's Sarah/);
  });

  it("joining a session nobody escalated only watches; the AI carries on", () => {
    const h = start(true);
    h.send({ type: "human.join" }, AGENT);
    expect(h.state.session.ownerType).toBe("ai");
  });
});

describe("answering questions mid-step", () => {
  it("answers from the approved answers and stays on the step", () => {
    const h = start(false);
    const step = h.state.workflow.currentStep;
    h.send({ type: "customer.utterance", text: "Will restarting the router lose my settings?", confidence: 0.95 });
    expect(h.state.workflow.currentStep).toBe(step);
    expect(h.state.transcript.at(-1)!.text).toMatch(/keeps all your settings/);
  });
});
