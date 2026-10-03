import type { Integration, IntegrationStatus } from "../types/integrations";

export const statusLabel: Record<IntegrationStatus, string> = { demo: "Demo", not_configured: "Not configured", connected: "Connected", requires_setup: "Requires setup" };
export const statusTone: Record<IntegrationStatus, "info" | "neutral" | "ok" | "warn"> = { demo: "info", not_configured: "neutral", connected: "ok", requires_setup: "warn" };
export const statusOrder: IntegrationStatus[] = ["demo", "connected", "requires_setup", "not_configured"];

const MASK = "••••••••••••••••";

export const integrations: Integration[] = [
  {
    id: "twilio", name: "Twilio Video", vendor: "Twilio", icon: "video", category: "Real-time media", defaultStatus: "demo",
    purpose: "WebRTC video and audio transport between the customer, the AI and human advisers.",
    role: "Real-time communications: WebRTC session, camera/microphone transport, participant management, human join and takeover.",
    region: "EU West (IE1)", environment: "Sandbox (demo)",
    fields: [
      { label: "Account SID", value: "AC" + "••••••••••••••••••••••••••••••", kind: "secret" },
      { label: "API key secret", value: MASK, kind: "secret" },
      { label: "Status callback URL", value: "https://example.invalid/hooks/twilio/room-events", kind: "url" },
      { label: "Room type", value: "group (small)", kind: "text" },
    ],
    capabilities: ["Rooms and participants", "Track subscription", "Recording rules (off)", "TURN relay"],
  },
  {
    id: "elevenlabs", name: "ElevenLabs", vendor: "ElevenLabs", icon: "mic", category: "Voice", defaultStatus: "demo",
    purpose: "Conversational voice layer: speech-to-text, text-to-speech and turn handling.",
    role: "Speech layer (STT/TTS, VAD, turn-taking, spoken responses). Not the primary visual-analysis engine.",
    region: "EU (residency)", environment: "Sandbox (demo)",
    fields: [
      { label: "API key", value: "xi_" + MASK, kind: "secret" },
      { label: "Agent voice ID", value: "voice_••••••••", kind: "secret" },
      { label: "Post-call webhook", value: "https://example.invalid/hooks/voice/post-call", kind: "url" },
    ],
    capabilities: ["Streaming STT", "Streaming TTS", "Voice activity detection", "Interruption handling"],
  },
  {
    id: "anthropic", name: "Claude (multimodal)", vendor: "Anthropic", icon: "brain", category: "AI model", defaultStatus: "demo",
    purpose: "Interprets selected frames with transcript context and reasons against approved workflow policy.",
    role: "Conversation, vision and policy reasoning: structured observations, uncertainty handling, next permitted step, escalation decisions.",
    region: "EU / UK routing (demo)", environment: "Evaluation (demo)",
    fields: [
      { label: "API key", value: "sk-ant-" + MASK, kind: "secret" },
      { label: "Model alias", value: "vision-4.2 (demo)", kind: "text" },
      { label: "Max frames per call", value: "4", kind: "text" },
    ],
    capabilities: ["Image + text input", "Structured JSON observations", "Tool use", "Event-driven calls only"],
  },
  {
    id: "n8n", name: "n8n", vendor: "n8n", icon: "workflow", category: "Orchestration", defaultStatus: "not_configured",
    purpose: "Runs business actions after the real-time loop: cases, bookings, notifications, reporting.",
    role: "Business orchestration for CRM updates, case creation, bookings and downstream automation. Never in the continuous audio/video loop.",
    region: "UK South", environment: "Not provisioned",
    fields: [
      { label: "Instance URL", value: "https://n8n.example.invalid", kind: "url" },
      { label: "Webhook secret", value: MASK, kind: "secret" },
      { label: "Workflow trigger path", value: "/webhook/visual-assist/session-events", kind: "url" },
    ],
    capabilities: ["Webhook triggers", "Retry and dead-letter", "Per-client workflows", "Execution log export"],
  },
  {
    id: "crm", name: "CRM", vendor: "Client system", icon: "users", category: "Business systems", defaultStatus: "requires_setup",
    purpose: "Customer account lookup and interaction history written back after each session.",
    role: "Client system reached via n8n: account lookup, activity logging and outcome sync.",
    region: "Client-managed", environment: "Per-client mapping needed",
    fields: [
      { label: "Base URL", value: "https://crm.client.example.invalid/api", kind: "url" },
      { label: "Client secret", value: MASK, kind: "secret" },
      { label: "Field mapping", value: "0 of 12 fields mapped", kind: "text" },
    ],
    capabilities: ["Account lookup", "Activity write-back", "Consent flag sync"],
  },
  {
    id: "ticketing", name: "Ticketing", vendor: "Client system", icon: "ticket", category: "Business systems", defaultStatus: "demo",
    purpose: "Creates and updates support cases with annotated evidence frames attached.",
    role: "Downstream action via n8n: case creation, evidence attachment and status updates.",
    region: "Client-managed", environment: "Mock responder",
    fields: [
      { label: "Base URL", value: "https://tickets.client.example.invalid/v2", kind: "url" },
      { label: "API token", value: MASK, kind: "secret" },
      { label: "Default queue", value: "Visual Assist / Tier 2", kind: "text" },
    ],
    capabilities: ["Create case", "Attach evidence", "Status webhook"],
  },
  {
    id: "field-service", name: "Field Service", vendor: "Client system", icon: "wrench", category: "Business systems", defaultStatus: "requires_setup",
    purpose: "Books engineer visits or work orders when remote resolution is not possible.",
    role: "Downstream booking via n8n, restricted to human-approved or policy-allowed steps.",
    region: "Client-managed", environment: "Per-client mapping needed",
    fields: [
      { label: "Scheduling endpoint", value: "https://fsm.client.example.invalid/book", kind: "url" },
      { label: "Service account", value: MASK, kind: "secret" },
      { label: "Skill codes", value: "Not mapped", kind: "text" },
    ],
    capabilities: ["Availability search", "Work order creation", "Visit cancellation (visits avoided)"],
  },
  {
    id: "messaging", name: "Messaging", vendor: "SMS / email provider", icon: "message", category: "Business systems", defaultStatus: "not_configured",
    purpose: "Sends session links, summaries and claim or case references to the customer.",
    role: "Notification channel triggered by n8n: SMS journey links and post-session summaries.",
    region: "UK", environment: "Not provisioned",
    fields: [
      { label: "Sender ID", value: "AIUKAssist", kind: "text" },
      { label: "Provider key", value: MASK, kind: "secret" },
      { label: "Delivery receipt URL", value: "https://example.invalid/hooks/msg/dlr", kind: "url" },
    ],
    capabilities: ["SMS link", "Email summary", "Delivery receipts"],
  },
];

export const integrationById = (id: string) => integrations.find((i) => i.id === id);

/** Architecture diagram nodes (spec §6.1). `integration` maps to a status dot; nodes without one are AIUK-owned. */
export interface ArchNode { id: string; label: string; sub: string; integration?: string; x: number; y: number; w?: number }
export const archNodes: ArchNode[] = [
  { id: "customer", label: "Customer", sub: "Camera + microphone", x: 0, y: 70 },
  { id: "twilio", label: "Twilio Video", sub: "WebRTC transport", integration: "twilio", x: 150, y: 70 },
  { id: "eleven", label: "ElevenLabs", sub: "Voice: STT / TTS / VAD", integration: "elevenlabs", x: 310, y: 10 },
  { id: "gateway", label: "Media Gateway", sub: "Frame selection (AIUK)", x: 310, y: 130 },
  { id: "state", label: "Session state", sub: "Transcript + frames + policy", x: 470, y: 70 },
  { id: "claude", label: "Claude", sub: "Vision + reasoning", integration: "anthropic", x: 630, y: 70 },
  { id: "n8n", label: "n8n", sub: "Business actions", integration: "n8n", x: 790, y: 10 },
  { id: "human", label: "Human adviser", sub: "Escalation", x: 790, y: 130 },
];
export const archEdges: [string, string][] = [
  ["customer", "twilio"], ["twilio", "eleven"], ["twilio", "gateway"], ["eleven", "state"], ["gateway", "state"], ["state", "claude"], ["claude", "n8n"], ["claude", "human"],
];
