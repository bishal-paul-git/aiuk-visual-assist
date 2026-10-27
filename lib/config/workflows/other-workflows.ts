import type { WorkflowDefinition } from "@/lib/domain/types";
import { routerTroubleshootingV3 } from "./router-troubleshooting";

/** Previous router version, kept for audit replay of historical sessions. */
export const routerTroubleshootingV2: WorkflowDefinition = {
  ...routerTroubleshootingV3,
  id: "wf_router_v2",
  version: 2,
  status: "retired",
  changeNote: "v2: initial lights check and power cycle; no rear-cable checkpoint.",
  publishedAt: "2026-06-18T10:00:00.000Z",
  publishedBy: "Priya Shah",
  steps: routerTroubleshootingV3.steps
    .filter((s) => s.key !== "show_cables" && s.key !== "guide_reseat_cable" && s.key !== "run_line_test")
    .map((s) => {
      if (s.key === "inspect_lights") {
        return {
          ...s,
          next: s.next.map((r) => (r.to === "show_cables" ? { ...r, to: "guide_power_cycle" } : r)),
        };
      }
      if (s.key === "recheck_lights" || s.key === "describe_lights_recheck") {
        return {
          ...s,
          next: s.next.map((r) => (r.to === "run_line_test" ? { ...r, to: "escalate_network" } : r)),
        };
      }
      return s;
    }),
};

export const boilerFaultV1: WorkflowDefinition = {
  id: "wf_boiler_v1",
  tenantId: "tnt_brightwater",
  key: "boiler-fault-code",
  name: "Boiler Fault Code Check",
  version: 1,
  status: "in_review",
  sector: "utilities",
  objective: "Read the boiler display fault code and pressure gauge, give approved safe guidance, and book an engineer where needed.",
  allowedScope: ["Read boiler display code", "Read pressure gauge", "Guide approved repressurising", "Book engineer via human"],
  prohibitedGuidance: [
    "Any guidance involving gas supply, flue or casing removal",
    "Bypassing safety devices",
    "Diagnosing carbon monoxide symptoms (always escalate as safety)",
  ],
  defaultConfidenceThreshold: 0.85,
  maxAiDurationSec: 720,
  policyId: "pol_brightwater_safety",
  startStep: "welcome",
  changeNote: "Initial draft for pilot review with Brightwater gas-safe team.",
  observationVocabulary: {
    fault_code: { description: "Code shown on the boiler display", values: ["F22", "E119", "F28", "E133", "none", "other"] },
    pressure_bar: { description: "Pressure gauge reading band", values: ["below_1", "normal", "above_2_5"] },
  },
  steps: [
    {
      key: "welcome",
      type: "start",
      title: "Welcome",
      instruction: "Hi, I'm the Brightwater visual assistant. Let's take a look at your boiler together.",
      customerPrompt: "Connected",
      next: [{ when: { kind: "always" }, to: "safety_check", label: "Begin" }],
    },
    {
      key: "safety_check",
      type: "question",
      title: "Safety screening",
      instruction: "Before we start: can you smell gas, or does anyone feel dizzy, sick or have a headache?",
      customerPrompt: "Any smell of gas or feeling unwell?",
      next: [
        { when: { kind: "intent", intents: ["affirm"] }, to: "escalate_safety", label: "Safety concern" },
        { when: { kind: "intent", intents: ["negate"] }, to: "show_display", label: "No safety concern" },
      ],
    },
    {
      key: "show_display",
      type: "visual_request",
      title: "Read display code",
      instruction: "Please show me the display on the front of the boiler, close enough to read any code.",
      customerPrompt: "Show me the boiler display",
      evidence: { checkpoint: "boiler_display", description: "Fault code legible", observationTypes: ["fault_code"], view: "close_up" },
      confidenceThreshold: 0.9,
      maxAttempts: 3,
      onFailure: { to: "escalate_unresolved", reason: "low_visual_confidence" },
      next: [
        { when: { kind: "observation", observationType: "fault_code", values: ["F22", "E119"] }, to: "show_gauge", label: "Low-pressure code" },
        { when: { kind: "observation", observationType: "fault_code", values: ["F28", "E133"] }, to: "book_engineer", label: "Ignition fault" },
        { when: { kind: "observation", observationType: "fault_code", values: ["none"] }, to: "escalate_unresolved", label: "No code shown" },
      ],
    },
    {
      key: "show_gauge",
      type: "visual_request",
      title: "Read pressure gauge",
      instruction: "That code usually relates to low pressure. Please show me the pressure gauge underneath.",
      customerPrompt: "Show me the pressure gauge",
      evidence: { checkpoint: "pressure_gauge", description: "Needle position legible", observationTypes: ["pressure_bar"], view: "close_up" },
      confidenceThreshold: 0.85,
      maxAttempts: 3,
      onFailure: { to: "escalate_unresolved", reason: "low_visual_confidence" },
      next: [
        { when: { kind: "observation", observationType: "pressure_bar", values: ["below_1"] }, to: "book_engineer", label: "Pressure low" },
        { when: { kind: "observation", observationType: "pressure_bar", values: ["normal"] }, to: "escalate_unresolved", label: "Pressure normal" },
      ],
    },
    {
      key: "book_engineer",
      type: "business_action",
      title: "Book engineer (human approval)",
      instruction: "I'll get a member of the team to arrange an engineer for you.",
      customerPrompt: "Arranging an engineer",
      action: { tool: "book_engineer", params: { priority: "standard" } },
      onFailure: { to: "escalate_unresolved", reason: "workflow_failure" },
      next: [{ when: { kind: "always" }, to: "resolved", label: "Booked" }],
    },
    {
      key: "resolved",
      type: "completion",
      title: "Complete",
      instruction: "That's everything booked in. Thanks for your help.",
      customerPrompt: "All done",
      completion: { outcome: "resolved_by_human" },
      next: [],
    },
    {
      key: "escalate_safety",
      type: "human_escalation",
      title: "Safety escalation",
      instruction: "Please leave the property and call the National Gas Emergency line on 0800 111 999. I'm alerting our team now.",
      customerPrompt: "Call 0800 111 999 now",
      escalation: { reason: "safety_policy", severity: "critical", humanOnly: true },
      next: [],
    },
    {
      key: "escalate_unresolved",
      type: "human_escalation",
      title: "Escalate to adviser",
      instruction: "I'm bringing in an adviser who can see everything we've checked.",
      customerPrompt: "Connecting you to an adviser",
      escalation: { reason: "unresolved_after_workflow", severity: "medium" },
      next: [],
    },
  ],
};

export const homeDamageV1: WorkflowDefinition = {
  id: "wf_home_damage_v1",
  tenantId: "tnt_harbour",
  key: "home-damage-evidence",
  name: "Home Damage Evidence Capture",
  version: 1,
  status: "draft",
  sector: "insurance",
  objective: "Capture clear, minimal evidence of reported property damage for a claims handler. No claim decisions are made by AI.",
  allowedScope: ["Capture damage wide and close-up views", "Capture scale reference", "Record customer description"],
  prohibitedGuidance: ["Any statement on claim validity or cover", "Repair advice", "Estimating settlement values"],
  defaultConfidenceThreshold: 0.7,
  maxAiDurationSec: 600,
  policyId: "pol_harbour_claims",
  startStep: "welcome",
  changeNote: "Draft; awaiting DPIA sign-off for private-interior capture.",
  observationVocabulary: {
    damage_area: { description: "Whole damaged area in frame", values: ["visible"] },
    damage_detail: { description: "Close-up detail of the damage", values: ["visible"] },
  },
  steps: [
    {
      key: "welcome",
      type: "start",
      title: "Welcome",
      instruction: "Hi, I'm Harbour's visual assistant. I'll help capture photos of the damage for your claims handler.",
      customerPrompt: "Connected",
      next: [{ when: { kind: "always" }, to: "describe", label: "Begin" }],
    },
    {
      key: "describe",
      type: "question",
      title: "Describe damage",
      instruction: "Briefly, what's been damaged and how did it happen?",
      customerPrompt: "Tell me what happened",
      next: [{ when: { kind: "always" }, to: "wide_view", label: "Described" }],
    },
    {
      key: "wide_view",
      type: "visual_request",
      title: "Wide view",
      instruction: "Please step back and show me the whole damaged area.",
      customerPrompt: "Show me the whole area",
      evidence: { checkpoint: "damage_wide", description: "Whole damaged area in frame", observationTypes: ["damage_area"], view: "wide" },
      maxAttempts: 3,
      onFailure: { to: "escalate_handler", reason: "low_visual_confidence" },
      next: [{ when: { kind: "observation", observationType: "damage_area", values: ["visible"] }, to: "close_view", label: "Captured" }],
    },
    {
      key: "close_view",
      type: "visual_request",
      title: "Close-up",
      instruction: "Now move closer to the most damaged part.",
      customerPrompt: "Move closer to the damage",
      evidence: { checkpoint: "damage_close", description: "Damage detail legible", observationTypes: ["damage_detail"], view: "detail" },
      maxAttempts: 3,
      onFailure: { to: "escalate_handler", reason: "low_visual_confidence" },
      next: [{ when: { kind: "observation", observationType: "damage_detail", values: ["visible"] }, to: "submit", label: "Captured" }],
    },
    {
      key: "submit",
      type: "business_action",
      title: "Attach evidence to claim",
      instruction: "Thanks. I'm attaching these to your claim now.",
      customerPrompt: "Attaching evidence…",
      action: { tool: "attach_claim_evidence", params: {} },
      onFailure: { to: "escalate_handler", reason: "workflow_failure" },
      next: [{ when: { kind: "always" }, to: "done", label: "Attached" }],
    },
    {
      key: "done",
      type: "completion",
      title: "Complete",
      instruction: "Your claims handler will review these and be in touch.",
      customerPrompt: "Evidence submitted",
      completion: { outcome: "resolved_by_ai" },
      next: [],
    },
    {
      key: "escalate_handler",
      type: "human_escalation",
      title: "Escalate to claims handler",
      instruction: "I'm connecting you to a claims handler.",
      customerPrompt: "Connecting you to a claims handler",
      escalation: { reason: "unresolved_after_workflow", severity: "low" },
      next: [],
    },
  ],
};
