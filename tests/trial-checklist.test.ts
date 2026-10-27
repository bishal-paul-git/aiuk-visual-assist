import { describe, expect, it } from "vitest";
import { checklistFor } from "@/lib/session/trial-checklist";
import { AGENT, routerHarness } from "./helpers";

const done = (h: ReturnType<typeof routerHarness>) => checklistFor(h.state).filter((i) => i.done).map((i) => i.key);

describe("tester checklist", () => {
  it("starts empty and ticks off what really happened", () => {
    expect(checklistFor(undefined).every((i) => !i.done)).toBe(true);
    const h = routerHarness("glare_then_clear");
    h.runCustomer({ maxTurns: 6 });
    expect(done(h)).toEqual(expect.arrayContaining(["joined", "told", "seen", "unclear"]));
    expect(done(h)).not.toContain("asked");
  });

  it("ticks the hand-over, the person talking and the end", () => {
    const h = routerHarness("wan_down");
    h.runCustomer();
    h.send({ type: "human.join" }, AGENT);
    h.send({ type: "session.end", outcome: "resolved_by_human" }, AGENT);
    expect(done(h)).toEqual(expect.arrayContaining(["asked", "agent", "ended"]));
  });

  it("ticks help without a camera", () => {
    const h = routerHarness("wan_down");
    h.send({ type: "media.update", media: { camera: false, microphone: true } });
    h.send({ type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" });
    h.send({ type: "customer.utterance", text: "My broadband isn't working", confidence: 0.95 });
    expect(done(h)).toContain("no_camera");
  });
});
