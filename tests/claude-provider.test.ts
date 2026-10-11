import { describe, expect, it, vi } from "vitest";
import { ClaudeReasoningProvider, validateObservations, vocabularyFor } from "@/lib/providers/claude/reasoning";
import { routerTroubleshootingV3 } from "@/lib/config/workflows/router-troubleshooting";
import { getStep } from "@/lib/workflow/engine";
import { routerHarness } from "./helpers";

const lights = getStep(routerTroubleshootingV3, "inspect_lights");
const vocab = vocabularyFor(routerTroubleshootingV3, lights);

function fakeClient(payload: unknown, stop_reason = "end_turn") {
  const create = vi.fn().mockResolvedValue({ stop_reason, content: [{ type: "text", text: JSON.stringify(payload) }] });
  return { client: { beta: { messages: { create } } } as never, create };
}

function evidenceInput() {
  const h = routerHarness("wan_down");
  h.runCustomer({ maxTurns: 3 });
  const ve = { ...h.state.visualEvents[0], checkpoint: "router_lights", stepKey: "inspect_lights" };
  return { state: h.state, visualEvent: ve, workflow: routerTroubleshootingV3, step: lights, frame: { mime: "image/jpeg", data: new Uint8Array([255, 216, 255]) } };
}

describe("observation validation", () => {
  it("drops unknown types, demotes out-of-vocabulary values, clamps confidence", () => {
    const out = validateObservations(
      [
        { observation_type: "internet_light", value: "purple", observation_text: "odd", status: "confirmed_visible", confidence: 1.4, requires_confirmation: false, recommended_next_action: "none" },
        { observation_type: "fridge", value: "on", observation_text: "x", status: "confirmed_visible", confidence: 0.9, requires_confirmation: false, recommended_next_action: "none" },
        { observation_type: "power_light", value: "on", observation_text: "Power on", status: "confirmed_visible", confidence: 0.95, requires_confirmation: false, recommended_next_action: "none" },
      ],
      vocab,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ observationType: "internet_light", value: undefined, status: "uncertain", confidence: 1, requiresConfirmation: true });
    expect(out[1]).toMatchObject({ observationType: "power_light", value: "on", status: "confirmed_visible", requiresConfirmation: false });
  });

  it("never lets a confident status stand without a value", () => {
    const [o] = validateObservations([{ observation_type: "wifi_light", value: null, observation_text: "?", status: "likely_visible", confidence: 0.8, requires_confirmation: false, recommended_next_action: "request_closer_view" }], vocab);
    expect(o.status).toBe("uncertain");
    expect(o.recommendedNextAction).toBe("request_closer_view");
  });
});

describe("Claude provider", () => {
  it("sends only the selected frame, a strict schema and fallbacks", async () => {
    const { client, create } = fakeClient({
      observations: [{ observation_type: "internet_light", value: "off", observation_text: "Internet light off", status: "confirmed_visible", confidence: 0.9, requires_confirmation: false, recommended_next_action: "none" }],
      sensitive_content: "none",
      reply: "I can see the internet light is off.",
    });
    const p = new ClaudeReasoningProvider(client);
    const r = await p.interpretEvidence(evidenceInput());
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    expect(req.output_config.format.schema.properties.observations.items.properties.observation_type.enum).toEqual(["power_light", "internet_light", "wifi_light"]);
    expect(r.observations[0]).toMatchObject({ value: "off", status: "confirmed_visible" });
    expect(r.modelVersion).toBe("claude-opus-5-5");
  });

  it("flags sensitive content as an observation", async () => {
    const { client } = fakeClient({ observations: [], sensitive_content: "payment_card", reply: null });
    const r = await new ClaudeReasoningProvider(client).interpretEvidence(evidenceInput());
    expect(r.observations).toEqual([expect.objectContaining({ observationType: "sensitive_content", value: "payment_card" })]);
  });

  it("throws on refusal, invalid JSON or a missing frame so the session escalates", async () => {
    await expect(new ClaudeReasoningProvider(fakeClient({}, "refusal").client).interpretEvidence(evidenceInput())).rejects.toThrow(/refusal/);
    const bad = { beta: { messages: { create: vi.fn().mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }) } } } as never;
    await expect(new ClaudeReasoningProvider(bad).interpretEvidence(evidenceInput())).rejects.toThrow(/invalid JSON/);
    await expect(new ClaudeReasoningProvider(fakeClient({}).client).interpretEvidence({ ...evidenceInput(), frame: undefined })).rejects.toThrow(/No analysable frame/);
  });

  it("restricts intents to the step's options", async () => {
    const h = routerHarness("wan_down");
    h.runCustomer({ maxTurns: 1 });
    const { client, create } = fakeClient({ intent: "made_up", customer_issue: null, reply: null });
    const r = await new ClaudeReasoningProvider(client).interpretUtterance({
      state: h.state,
      utterance: { ...h.state.transcript[0], text: "my wifi is down" },
      workflow: routerTroubleshootingV3,
      step: getStep(routerTroubleshootingV3, "intake"),
      expectedIntents: ["broadband_issue", "out_of_scope"],
    });
    expect(r.intent).toBe("unknown");
    expect(create.mock.calls[0][0].output_config.format.schema.properties.intent.enum).toEqual(["broadband_issue", "out_of_scope", "wait", "human_request", "unknown"]);
  });
});

describe("sensitive content policy", () => {
  it("escalates when a payment card is in frame (Northline policy: escalate)", () => {
    const h = routerHarness("card_in_frame");
    h.runCustomer();
    expect(h.state.escalation?.reason).toBe("safety_policy");
    expect(h.state.audit.some((a) => a.eventType === "policy.check" && a.payload.check === "sensitive_content")).toBe(true);
    expect(h.state.workflow.history.map((x) => x.stepKey)).not.toContain("inspect_lights");
  });
});
