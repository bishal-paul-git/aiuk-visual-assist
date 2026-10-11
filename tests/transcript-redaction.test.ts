import { describe, expect, it } from "vitest";
import { REDACTION_MARKERS as M } from "@/lib/privacy/redact";
import { toAgentView, toCustomerView } from "@/lib/session/projections";
import { getWorkflow } from "@/lib/config/catalog";
import { AGENT, routerHarness } from "./helpers";

describe("transcript redaction in the orchestrator", () => {
  it("stores customer speech with personal data removed and audits the redaction", () => {
    const h = routerHarness("power_cycle_fix");
    h.send({ type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" });
    h.send({ type: "customer.utterance", text: "My broadband is down, I'm at SW1A 1AA and my number is 07700 900123" });
    const t = h.state.transcript.filter((x) => x.speaker === "customer").at(-1)!;
    expect(t.text).toBe(`My broadband is down, I'm at ${M.postcode} and my number is ${M.phone}`);
    expect(t.redactions).toEqual([
      { type: "phone", count: 1 },
      { type: "postcode", count: 1 },
    ]);
    const audit = h.state.audit.find((a) => a.eventType === "privacy.redacted")!;
    expect(audit.payload).toMatchObject({ transcriptId: t.id, speaker: "customer", types: "phone, postcode", count: 2 });
    // The raw values appear nowhere in the stored state.
    const json = JSON.stringify(h.state);
    expect(json).not.toContain("07700 900123");
    expect(json).not.toContain("SW1A 1AA");
  });

  it("does not mark or audit utterances with nothing to remove", () => {
    const h = routerHarness("power_cycle_fix");
    h.send({ type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" });
    h.send({ type: "customer.utterance", text: "The internet light is red" });
    const t = h.state.transcript.filter((x) => x.speaker === "customer").at(-1)!;
    expect(t.text).toBe("The internet light is red");
    expect(t.redactions).toBeUndefined();
    expect(h.state.audit.some((a) => a.eventType === "privacy.redacted")).toBe(false);
  });

  it("still escalates when the customer asks for a person in the same sentence", () => {
    const h = routerHarness("power_cycle_fix");
    h.send({ type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" });
    h.send({ type: "customer.utterance", text: "can I speak to a person, card 4111 1111 1111 1111" });
    expect(h.state.escalation?.reason).toBe("customer_requested");
    expect(h.state.transcript.some((t) => t.text.includes(M.card_number))).toBe(true);
  });

  it("redacts agent messages, the customer instruction and capture prompts", () => {
    const h = routerHarness("wan_down");
    h.runCustomer();
    h.send({ type: "human.join" }, AGENT);
    h.send({ type: "human.take_over" }, AGENT);
    h.send({ type: "human.message", text: "I'll email the summary to sam@example.com" }, AGENT);
    expect(h.state.transcript.at(-1)!.text).toBe(`I'll email the summary to ${M.email}`);
    expect(h.state.instruction.text).toBe(`I'll email the summary to ${M.email}`);
    h.send({ type: "human.request_capture", prompt: "Show me the label with account number 12345678" }, AGENT);
    expect(h.state.evidenceRequest?.prompt).toBe(`Show me the label with account number ${M.account_number}`);
    expect(h.state.instruction.text).toBe(`Show me the label with account number ${M.account_number}`);
    const customer = toCustomerView(h.state, { name: "Northline", color: "#000" }, "retained_evidence");
    expect(JSON.stringify(customer)).not.toContain("sam@example.com");
    const agent = toAgentView(h.state, getWorkflow("wf_router_v3")!, {
      live: true,
      previewAvailable: false,
      tenantName: "Northline",
      allowedHumanTools: [],
      returnToAiAllowed: { allowed: false, reason: "test" },
      simulatedProvider: true,
    });
    expect(JSON.stringify(agent)).not.toContain("12345678");
  });
});
