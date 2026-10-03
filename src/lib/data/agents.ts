import type { ClientId } from "../types";

export interface AiAgent {
  id: string;
  name: string;
  title: string;
  clientId: ClientId;
  status: "active" | "draft" | "paused";
  voice: string;
  voiceProvider: string;
  language: string;
  languages: string[];
  model: string;
  workflowIds: string[];
  version: string;
  greeting: string;
  knowledge: { name: string; type: string; updated: string }[];
  tools: { name: string; scope: string; risk: "low" | "medium" | "high" }[];
  escalationRules: string[];
  sessions30d: number;
  resolution: number;
  persona: string;
}

export const agents: AiAgent[] = [
  {
    id: "ava", name: "Ava", title: "Telecom Support", clientId: "clearwave", status: "active",
    voice: "Charlotte (en-GB)", voiceProvider: "ElevenLabs (demo)", language: "English (UK)", languages: ["English (UK)", "Welsh", "Polish"],
    model: "Multimodal reasoning model · v4 (demo)", workflowIds: ["router-troubleshooting"], version: "v3.2.0",
    greeting: "Hello, I'm Ava from ClearWave support. I can see and hear you, so if you're able to show me your router, I'll help you work out what's going on.",
    knowledge: [
      { name: "ClearWave Router Hub 5 — Status Light Guide", type: "Product manual", updated: "12 Sep 2026" },
      { name: "Broadband Fault Triage SOP", type: "SOP", updated: "28 Aug 2026" },
      { name: "Approved Customer Scripts — Connectivity", type: "Scripts", updated: "02 Sep 2026" },
      { name: "Engineer Visit Eligibility Rules", type: "Policy", updated: "19 Sep 2026" },
    ],
    tools: [
      { name: "create_support_case", scope: "Ticketing", risk: "low" },
      { name: "lookup_line_status", scope: "Network OSS (read-only)", risk: "low" },
      { name: "trigger_remote_line_reset", scope: "Network OSS", risk: "medium" },
      { name: "book_engineer_visit", scope: "Field service", risk: "high" },
      { name: "send_sms_summary", scope: "Messaging", risk: "low" },
    ],
    escalationRules: ["Visual confidence below 0.70 on a required checkpoint, twice", "Customer asks for a person", "Any request to open hardware or touch mains power", "Booking an engineer visit requires human confirmation"],
    sessions30d: 4218, resolution: 71, persona: "Calm, concise, UK English. Never speculates about faults it cannot see.",
  },
  {
    id: "sophie", name: "Sophie", title: "Utilities Support", clientId: "northstar", status: "active",
    voice: "Matilda (en-GB)", voiceProvider: "ElevenLabs (demo)", language: "English (UK)", languages: ["English (UK)", "Welsh"],
    model: "Multimodal reasoning model · v4 (demo)", workflowIds: ["boiler-visual-triage"], version: "v2.7.1",
    greeting: "Hi, I'm Sophie from Northstar Utilities. Let's take a look at your boiler together — please stay at a safe distance and don't open any panels.",
    knowledge: [
      { name: "Boiler Display Fault Codes — Approved Subset", type: "Reference", updated: "03 Sep 2026" },
      { name: "Gas Safety Escalation Policy", type: "Policy", updated: "15 Aug 2026" },
      { name: "Meter Reading Guidance", type: "SOP", updated: "21 Jul 2026" },
    ],
    tools: [
      { name: "create_work_order", scope: "Field service", risk: "medium" },
      { name: "lookup_account", scope: "CRM (read-only)", risk: "low" },
      { name: "book_engineer_visit", scope: "Field service", risk: "high" },
      { name: "send_safety_advice", scope: "Messaging", risk: "low" },
    ],
    escalationRules: ["Any mention of gas smell, carbon monoxide or smoke → immediate human + safety advice", "Pressure reading outside approved range", "Visual confidence below 0.75 on display fault code", "Customer vulnerability flag on account"],
    sessions30d: 2954, resolution: 63, persona: "Reassuring, safety-first. Never advises opening or repairing appliances.",
  },
  {
    id: "ella", name: "Ella", title: "Insurance Visual Assist", clientId: "horizon", status: "active",
    voice: "Alice (en-GB)", voiceProvider: "ElevenLabs (demo)", language: "English (UK)", languages: ["English (UK)"],
    model: "Multimodal reasoning model · v4 (demo)", workflowIds: ["property-damage-capture"], version: "v1.4.0",
    greeting: "Hello, I'm Ella from Horizon Insurance. I'll guide you through capturing the damage so we can progress your claim quickly. Are you somewhere safe?",
    knowledge: [
      { name: "FNOL Evidence Standards", type: "Policy", updated: "09 Sep 2026" },
      { name: "Property Damage Triage Guide", type: "SOP", updated: "01 Sep 2026" },
      { name: "Vulnerable Customer Handling", type: "Policy", updated: "11 Aug 2026" },
    ],
    tools: [
      { name: "create_claim_fnol", scope: "Claims", risk: "medium" },
      { name: "attach_evidence", scope: "Claims", risk: "low" },
      { name: "schedule_loss_adjuster", scope: "Claims", risk: "high" },
      { name: "send_claim_reference", scope: "Messaging", risk: "low" },
    ],
    escalationRules: ["Any indication of injury or ongoing danger", "Liability or coverage questions are never answered by AI", "Bystanders / faces in frame → request reposition, flag redaction", "Claims over £10,000 estimated → human review"],
    sessions30d: 612, resolution: 48, persona: "Empathetic, structured. Captures evidence; never comments on cover or liability.",
  },
  {
    id: "ava-cy", name: "Ava (Cymraeg)", title: "Telecom Support — Welsh", clientId: "clearwave", status: "draft",
    voice: "Charlotte (cy)", voiceProvider: "ElevenLabs (demo)", language: "Welsh", languages: ["Welsh"],
    model: "Multimodal reasoning model · v4 (demo)", workflowIds: ["router-troubleshooting"], version: "v0.3.0-draft",
    greeting: "Helo, Ava ydw i o gymorth ClearWave.",
    knowledge: [{ name: "Welsh Language Scripts", type: "Scripts", updated: "24 Sep 2026" }],
    tools: [{ name: "create_support_case", scope: "Ticketing", risk: "low" }],
    escalationRules: ["Hand over to English-speaking human if language confidence is low"],
    sessions30d: 0, resolution: 0, persona: "Draft variant for Welsh-language pilot.",
  },
];

export const agentById = (id: string) => agents.find((a) => a.id === id);
