import type { WorkflowDefinition } from "@/lib/domain/types";
import { routerTroubleshootingV3 } from "./router-troubleshooting";

/**
 * New router setup v1: a customer has a new router (new contract or a
 * replacement) and wants it online. The AI checks it is the router, guides
 * the two cables, waits for the first connection, reads the lights and helps
 * join the Wi-Fi. Low-risk guidance only; anything else goes to a person.
 */
const v3 = routerTroubleshootingV3;
const step = (key: string) => structuredClone(v3.steps.find((s) => s.key === key)!);

export const routerSetupV1: WorkflowDefinition = {
  id: "wf_router_setup_v1",
  tenantId: "tnt_northline",
  key: "router-setup",
  name: "New Router Setup",
  version: 1,
  status: "published",
  sector: "telecommunications",
  objective: "Get a customer's new router online: correct cables, first connection, lights checked and a device joined to the Wi-Fi, using approved low-risk steps only.",
  allowedScope: ["Setting up a new or replacement router", "Connecting the broadband and power cables", "Reading the router's status lights", "Joining a phone or laptop to the new Wi-Fi"],
  prohibitedGuidance: [...v3.prohibitedGuidance, "Moving or rewiring the phone or fibre socket on the wall", "Changing the router's settings page or admin password"],
  knowledge: [
    { question: "How long does a new router take to connect?", answer: "The first time, it can take up to 10 minutes, and the lights may flash while it updates. Leave it switched on and don't press any buttons." },
    { question: "Where is my Wi-Fi name and password?", answer: "On the sticker on the back or bottom of the router, or on the card that came in the box. The name is often called SSID and the password Wireless key." },
    { question: "Which cable goes where?", answer: "The grey or green broadband cable goes from the socket on the wall into the port marked Broadband, DSL or Internet. The power adapter goes into the round Power port. The yellow cables are for computers and aren't needed." },
    { question: "Do I need a filter?", answer: "If your broadband comes through a phone socket without a built-in filter, plug the small filter into the socket first, then the broadband cable into the filter's DSL side." },
    { question: "What do I do with my old router?", answer: "Unplug it and keep it to one side. Only one router can be plugged into the broadband socket at a time." },
    ...(v3.knowledge ?? []).filter((k) => /speak to a person|camera being recorded|safe to unplug/i.test(k.question)),
  ],
  aiNotes: [
    "{brand}'s new router is the {brand} Hub 4: black, four lights on the front (Power, Internet, WiFi, Voice), ports on the back (Power, LAN 1, LAN 2, Broadband).",
    "A new router can flash its lights for several minutes on first start while it updates. Report flashing, not a fault, unless the customer says it has been over 10 minutes.",
    "Customers sometimes leave the old router plugged into the wall socket. If two routers are visible, mention it in your observation text.",
    "The broadband cable for a fibre (FTTP) line goes from the fibre box (ONT) on the wall, not the phone socket: either is fine as long as it reaches the Broadband/WAN port.",
    ...(v3.aiNotes ?? []).filter((n) => /glare|other_device|describe the lights in words/i.test(n)),
  ],
  defaultConfidenceThreshold: 0.75,
  maxAiDurationSec: 1200,
  policyId: "pol_northline_standard",
  startStep: "welcome",
  changeNote: "v1: first version for customers setting up a new router.",
  observationVocabulary: structuredClone(v3.observationVocabulary),
  publishedAt: "2026-11-16T09:00:00.000Z",
  publishedBy: "Absolute Intelligence",
  steps: [
    {
      key: "welcome",
      type: "start",
      title: "Welcome",
      instruction: "Hi, I'm the {brand} visual assistant. Let's get your new router online together. It usually takes about ten minutes.",
      customerPrompt: "Let's set up your new router",
      next: [{ when: { kind: "always" }, to: "show_router", label: "Begin" }],
    },
    {
      ...step("show_router"),
      withoutCamera: "guide_connect_cables",
      instruction: "First, please point your camera at the new router so I can check it's the right box.",
      next: [
        { when: { kind: "observation", observationType: "device_identified", values: ["router"] }, to: "guide_connect_cables", label: "Router identified" },
        { when: { kind: "observation", observationType: "device_identified", values: ["other_device"] }, to: "show_router", label: "Different device shown" },
      ],
    },
    {
      key: "guide_connect_cables",
      type: "guidance",
      title: "Connect the cables",
      instruction:
        "If an old router is plugged in, unplug it first. Then plug the grey broadband cable from the socket on the wall into the port marked Broadband on the back of the new router, plug in the power adapter and switch it on. Say “done” when that's done.",
      customerPrompt: "Plug in the broadband and power cables, then say “done”",
      allowedGuidance: ["Unplug the old router", "Connect broadband cable to Broadband/DSL/WAN port", "Connect power adapter and switch on"],
      next: [
        { when: { kind: "intent", intents: ["done", "affirm"] }, to: "show_cables", label: "Cables connected" },
        { when: { kind: "intent", intents: ["negate", "cannot"] }, to: "escalate_unresolved", label: "Customer unable" },
      ],
    },
    {
      key: "show_cables",
      type: "visual_request",
      withoutCamera: "guide_wait",
      title: "Check the cables",
      instruction: "Thanks. Please show me the back of the router so I can check both cables are in the right ports.",
      customerPrompt: "Show me the cables at the back",
      evidence: { checkpoint: "setup_cables", description: "Broadband and power cables in the right ports", observationTypes: ["broadband_cable", "power_cable"], view: "rear" },
      confidenceThreshold: 0.75,
      maxAttempts: 3,
      onFailure: { to: "guide_wait", reason: "low_visual_confidence" },
      next: [
        { when: { kind: "observation", observationType: "broadband_cable", values: ["disconnected"] }, to: "guide_reseat_cable", label: "Broadband cable not in" },
        { when: { kind: "observation", observationType: "power_cable", values: ["disconnected"] }, to: "guide_reseat_cable", label: "Power cable not in" },
        { when: { kind: "observation", observationType: "broadband_cable", values: ["connected"] }, to: "guide_wait", label: "Cables correct" },
      ],
    },
    {
      key: "guide_reseat_cable",
      type: "guidance",
      title: "Fix the cable",
      instruction: "One cable isn't fully in yet. Push the grey cable firmly into the Broadband port until it clicks, and make sure the power plug is in. Say “done” when that's done.",
      customerPrompt: "Push the cables in firmly, then say “done”",
      allowedGuidance: ["Reseat broadband/DSL/fibre cable", "Check adapter seated in router"],
      next: [
        { when: { kind: "intent", intents: ["done", "affirm"] }, to: "guide_wait", label: "Cable fixed" },
        { when: { kind: "intent", intents: ["negate", "cannot"] }, to: "escalate_unresolved", label: "Customer unable" },
      ],
    },
    {
      key: "guide_wait",
      type: "guidance",
      title: "Wait for the first connection",
      instruction: "Great. The first time a new router starts, it can take up to ten minutes and the lights may flash while it updates. Please don't press any buttons. Say “ready” when the lights stop flashing.",
      customerPrompt: "Wait for the lights to settle, then say “ready”",
      allowedGuidance: ["Wait for first connection"],
      next: [
        { when: { kind: "intent", intents: ["done", "affirm"] }, to: "show_lights", label: "Lights settled" },
        { when: { kind: "intent", intents: ["negate", "cannot"] }, to: "escalate_unresolved", label: "Customer unable" },
      ],
    },
    {
      key: "show_lights",
      type: "visual_request",
      withoutCamera: "describe_lights",
      title: "Read the lights",
      instruction: "Please show me the lights on the front of the router, nice and close.",
      customerPrompt: "Show me the lights on the front",
      evidence: { checkpoint: "setup_lights", description: "Power, Internet and Wi-Fi indicators legible", observationTypes: ["power_light", "internet_light", "wifi_light"], view: "close_up" },
      confidenceThreshold: 0.75,
      maxAttempts: 3,
      onFailure: { to: "escalate_visual", reason: "low_visual_confidence" },
      next: [
        { when: { kind: "observation", observationType: "power_light", values: ["off"] }, to: "guide_power_supply", label: "No power" },
        { when: { kind: "observation", observationType: "internet_light", values: ["off", "red", "amber", "flashing"] }, to: "run_line_test", label: "Not connected yet" },
        { when: { kind: "observation", observationType: "internet_light", values: ["on"] }, to: "guide_join_wifi", label: "Connected" },
      ],
    },
    {
      key: "describe_lights",
      type: "question",
      title: "Describe the lights (no camera)",
      instruction: "No problem, we can do this without the camera. What colour is the internet light now? It may show a globe, or say Internet or Broadband.",
      customerPrompt: "Tell me the colour of the internet light",
      next: [
        { when: { kind: "intent", intents: ["power_light_off"] }, to: "guide_power_supply", label: "No power (customer report)" },
        { when: { kind: "intent", intents: ["internet_light_problem"] }, to: "run_line_test", label: "Not connected (customer report)" },
        { when: { kind: "intent", intents: ["internet_light_ok"] }, to: "guide_join_wifi", label: "Connected (customer report)" },
        { when: { kind: "intent", intents: ["cannot", "negate"] }, to: "escalate_unresolved", label: "Customer can't see the lights" },
      ],
    },
    {
      ...step("guide_power_supply"),
      next: [
        { when: { kind: "intent", intents: ["done", "affirm"] }, to: "guide_wait", label: "Customer checked power" },
        { when: { kind: "intent", intents: ["negate", "cannot"] }, to: "escalate_unresolved", label: "Customer unable" },
      ],
    },
    {
      key: "guide_join_wifi",
      type: "guidance",
      title: "Join the Wi-Fi",
      instruction: "Your router is connected. Now find the Wi-Fi name and password on the sticker on the back of the router or the card in the box, and join it from your phone's Wi-Fi settings. Say “done” when your phone is connected.",
      customerPrompt: "Join the new Wi-Fi, then say “done”",
      allowedGuidance: ["Find Wi-Fi name and password on the router sticker", "Join the Wi-Fi from a phone or laptop"],
      next: [
        { when: { kind: "intent", intents: ["done", "affirm"] }, to: "confirm_working", label: "Phone joined" },
        { when: { kind: "intent", intents: ["negate", "cannot"] }, to: "escalate_unresolved", label: "Can't join the Wi-Fi" },
      ],
    },
    { ...step("confirm_working"), instruction: "Could you open a web page on that phone — is the internet working?" },
    { ...step("close_case"), action: { tool: "update_case", params: { status: "resolved", resolution: "router_setup_visual" } } },
    { ...step("resolved"), instruction: "Your new router is all set up. Thanks for doing that with me — you can end the session whenever you're ready." },
    step("run_line_test"),
    step("escalate_network"),
    step("escalate_unresolved"),
    step("escalate_visual"),
  ],
};

/** Home Telecom pilot: the same setup flow under Home Telecom's own rules. */
export const homeTelecomRouterSetupV1: WorkflowDefinition = { ...routerSetupV1, id: "wf_ht_router_setup_v1", tenantId: "tnt_hometelecom", policyId: "pol_hometelecom_standard" };
