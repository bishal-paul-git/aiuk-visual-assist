import type { AgentConfig, Policy, Tenant, User, WorkflowDefinition } from "@/lib/domain/types";
import { routerTroubleshootingV3 } from "./workflows/router-troubleshooting";
import { boilerFaultV1, homeDamageV1, routerTroubleshootingV2 } from "./workflows/other-workflows";

/**
 * Seed configuration catalog. In production this is served by the data
 * platform (docs/02 §3.9); everything here is tenant-scoped so no client
 * behaviour is hard-coded into the runtime.
 */

export const tenants: Tenant[] = [
  {
    id: "tnt_northline",
    name: "X Telecom",
    sector: "telecommunications",
    status: "active",
    brand: { displayName: "X Telecom", primaryColor: "#1D5BD8", supportLine: "0800 046 1100" },
    region: "uk-south",
    retention: { evidenceMode: "retained_evidence", evidenceRetentionDays: 30, transcriptRetentionDays: 90, auditRetentionDays: 730 },
    featureFlags: { visual_assist: true, ai_copilot_after_takeover: true, sms_entry: true, qr_entry: true, voice_only_fallback: true },
    createdAt: "2026-05-04T09:00:00.000Z",
    updatedAt: "2026-09-02T09:12:00.000Z",
  },
  {
    id: "tnt_brightwater",
    name: "Brightwater Energy",
    sector: "utilities",
    status: "onboarding",
    brand: { displayName: "Brightwater", primaryColor: "#0F7B6C", supportLine: "0800 112 4400" },
    region: "uk-south",
    retention: { evidenceMode: "retained_evidence", evidenceRetentionDays: 14, transcriptRetentionDays: 60, auditRetentionDays: 730 },
    featureFlags: { visual_assist: true, ai_copilot_after_takeover: false, sms_entry: true, qr_entry: false, voice_only_fallback: true },
    createdAt: "2026-08-21T09:00:00.000Z",
    updatedAt: "2026-09-28T15:40:00.000Z",
  },
  {
    id: "tnt_harbour",
    name: "Harbour Mutual Insurance",
    sector: "insurance",
    status: "onboarding",
    brand: { displayName: "Harbour Mutual", primaryColor: "#6B3FA0" },
    region: "uk-west",
    retention: { evidenceMode: "retained_evidence", evidenceRetentionDays: 365, transcriptRetentionDays: 365, auditRetentionDays: 2555 },
    featureFlags: { visual_assist: true, ai_copilot_after_takeover: false, sms_entry: true, qr_entry: true, voice_only_fallback: false },
    createdAt: "2026-09-15T09:00:00.000Z",
    updatedAt: "2026-10-01T11:00:00.000Z",
  },
];

/**
 * Policy versions, process-wide like `workflows` so policy versioning
 * (lib/policy/registry.ts) and every reader share one list.
 */
const gp = globalThis as unknown as { __aiukPolicies?: Policy[] };
export const policies: Policy[] = (gp.__aiukPolicies ??= [
  {
    id: "pol_northline_standard",
    tenantId: "tnt_northline",
    name: "X Telecom Standard Support",
    version: 4,
    status: "active",
    changeNote: "v4: account credits are regulated and human only; remote factory reset denied.",
    publishedAt: "2026-09-02T09:05:00.000Z",
    publishedBy: "Priya Shah",
    tools: [
      { tool: "line_test", risk: "low", mode: "allow", requiresIdempotencyKey: true },
      { tool: "update_case", risk: "low", mode: "allow", requiresIdempotencyKey: true },
      { tool: "create_ticket", risk: "low", mode: "allow", requiresIdempotencyKey: true },
      { tool: "send_sms_summary", risk: "low", mode: "allow", requiresIdempotencyKey: true },
      { tool: "book_engineer", risk: "high", mode: "human_only", requiresIdempotencyKey: true },
      { tool: "order_replacement_router", risk: "medium", mode: "human_only", requiresIdempotencyKey: true },
      { tool: "issue_account_credit", risk: "regulated", mode: "human_only", requiresIdempotencyKey: true },
      { tool: "factory_reset_remote", risk: "high", mode: "deny", requiresIdempotencyKey: true },
    ],
    mandatoryHumanReasons: ["customer_requested", "safety_policy", "regulated_action"],
    sensitiveData: [
      { category: "bystanders", handling: "avoid_capture" },
      { category: "children", handling: "avoid_capture" },
      { category: "payment_cards", handling: "escalate" },
      { category: "identity_documents", handling: "avoid_capture" },
      { category: "computer_screens", handling: "blur" },
      { category: "private_interiors", handling: "blur" },
    ],
    minObservationConfidence: 0.75,
    maxCaptureAttempts: 3,
    maxAiDurationSec: 900,
    allowReturnToAi: true,
  },
  {
    id: "pol_brightwater_safety",
    tenantId: "tnt_brightwater",
    name: "Brightwater Gas Safety",
    version: 1,
    status: "draft",
    tools: [
      { tool: "book_engineer", risk: "high", mode: "human_only", requiresIdempotencyKey: true },
      { tool: "create_ticket", risk: "low", mode: "allow", requiresIdempotencyKey: true },
      { tool: "isolate_supply_instruction", risk: "regulated", mode: "deny", requiresIdempotencyKey: true },
    ],
    mandatoryHumanReasons: ["customer_requested", "safety_policy", "regulated_action", "low_visual_confidence"],
    sensitiveData: [
      { category: "bystanders", handling: "avoid_capture" },
      { category: "children", handling: "avoid_capture" },
      { category: "private_interiors", handling: "blur" },
    ],
    minObservationConfidence: 0.85,
    maxCaptureAttempts: 3,
    maxAiDurationSec: 720,
    allowReturnToAi: false,
  },
  {
    id: "pol_harbour_claims",
    tenantId: "tnt_harbour",
    name: "Harbour Claims Evidence",
    version: 1,
    status: "draft",
    tools: [
      { tool: "attach_claim_evidence", risk: "medium", mode: "allow", requiresIdempotencyKey: true },
      { tool: "claim_decision", risk: "regulated", mode: "deny", requiresIdempotencyKey: true },
    ],
    mandatoryHumanReasons: ["customer_requested", "safety_policy", "regulated_action"],
    sensitiveData: [
      { category: "bystanders", handling: "avoid_capture" },
      { category: "identity_documents", handling: "escalate" },
      { category: "vehicle_plates", handling: "blur" },
      { category: "private_interiors", handling: "allowed" },
    ],
    minObservationConfidence: 0.7,
    maxCaptureAttempts: 3,
    maxAiDurationSec: 600,
    allowReturnToAi: true,
  },
]);

/**
 * Process-wide so workflow versioning (lib/workflow/registry.ts) and every
 * reader see the same list, including across dev hot reloads.
 */
const g = globalThis as unknown as { __aiukWorkflows?: WorkflowDefinition[] };
/** The workflows shipped in the code, untouched by any platform edit. */
export const BUILT_IN_WORKFLOWS: readonly WorkflowDefinition[] = [routerTroubleshootingV3, routerTroubleshootingV2, boilerFaultV1, homeDamageV1];

export const workflows: WorkflowDefinition[] = (g.__aiukWorkflows ??= [
  structuredClone(routerTroubleshootingV3),
  structuredClone(routerTroubleshootingV2),
  structuredClone(boilerFaultV1),
  structuredClone(homeDamageV1),
]);

export const agents: AgentConfig[] = [
  {
    id: "agt_northline_router",
    tenantId: "tnt_northline",
    name: "X Telecom Assistant",
    model: { provider: "mock", model: "aiuk-reasoning-sim-1", visionModel: "aiuk-vision-sim-1" },
    voice: { provider: "browser", voiceId: "en-GB-default", speakingRate: 1 },
    language: { primary: "en-GB", supported: ["en-GB"] },
    policyIds: ["pol_northline_standard"],
    workflowIds: ["wf_router_v3"],
    promptVersion: "router-assist-prompt@7",
    version: 5,
    status: "active",
  },
  {
    id: "agt_brightwater_boiler",
    tenantId: "tnt_brightwater",
    name: "Brightwater Heating Assistant",
    model: { provider: "mock", model: "aiuk-reasoning-sim-1", visionModel: "aiuk-vision-sim-1" },
    voice: { provider: "browser", voiceId: "en-GB-default", speakingRate: 0.95 },
    language: { primary: "en-GB", supported: ["en-GB", "cy-GB"] },
    policyIds: ["pol_brightwater_safety"],
    workflowIds: ["wf_boiler_v1"],
    promptVersion: "boiler-assist-prompt@2",
    version: 1,
    status: "draft",
  },
  {
    id: "agt_harbour_claims",
    tenantId: "tnt_harbour",
    name: "Harbour Claims Evidence Assistant",
    model: { provider: "mock", model: "aiuk-reasoning-sim-1", visionModel: "aiuk-vision-sim-1" },
    voice: { provider: "browser", voiceId: "en-GB-default", speakingRate: 1 },
    language: { primary: "en-GB", supported: ["en-GB"] },
    policyIds: ["pol_harbour_claims"],
    workflowIds: ["wf_home_damage_v1"],
    promptVersion: "claims-evidence-prompt@1",
    version: 1,
    status: "draft",
  },
];

export interface HumanTeam {
  id: string;
  tenantId: string;
  name: string;
  skills: string[];
  hours: string;
  targetAnswerSec: number;
  escalationReasons: string[];
}

export const teams: HumanTeam[] = [
  {
    id: "team_nl_l1",
    tenantId: "tnt_northline",
    name: "Broadband Support L1",
    skills: ["router", "wifi", "cabling"],
    hours: "Mon–Sun 08:00–22:00",
    targetAnswerSec: 60,
    escalationReasons: ["customer_requested", "low_visual_confidence", "unresolved_after_workflow", "out_of_scope"],
  },
  {
    id: "team_nl_l2",
    tenantId: "tnt_northline",
    name: "Network Specialists L2",
    skills: ["line_faults", "engineer_booking", "network"],
    hours: "Mon–Sat 08:00–20:00",
    targetAnswerSec: 120,
    escalationReasons: ["unresolved_after_workflow", "workflow_failure"],
  },
  {
    id: "team_bw_heating",
    tenantId: "tnt_brightwater",
    name: "Heating Advisers",
    skills: ["boilers", "gas_safety", "engineer_booking"],
    hours: "24/7",
    targetAnswerSec: 30,
    escalationReasons: ["safety_policy", "unresolved_after_workflow", "customer_requested"],
  },
  {
    id: "team_hb_claims",
    tenantId: "tnt_harbour",
    name: "Home Claims Handlers",
    skills: ["home_claims", "evidence_review"],
    hours: "Mon–Fri 09:00–17:30",
    targetAnswerSec: 180,
    escalationReasons: ["customer_requested", "unresolved_after_workflow"],
  },
];

export const users: User[] = [
  // Trial account for client testers (lib/auth/trial.ts): a supervisor, so one login can play both the customer's side and the agent's.
  { id: "usr_demo", tenantId: "tnt_northline", role: "supervisor", name: "Demo Tester", email: "demo@xtelecom.example", status: "active", teamId: "team_nl_l1" },
  { id: "usr_sarah", tenantId: "tnt_northline", role: "agent", name: "Sarah Jennings", email: "sarah.jennings@xtelecom.example", status: "active", teamId: "team_nl_l1" },
  { id: "usr_marcus", tenantId: "tnt_northline", role: "agent", name: "Marcus Webb", email: "marcus.webb@xtelecom.example", status: "active", teamId: "team_nl_l2" },
  { id: "usr_aisha", tenantId: "tnt_northline", role: "agent", name: "Aisha Khan", email: "aisha.khan@xtelecom.example", status: "active", teamId: "team_nl_l1" },
  { id: "usr_tom", tenantId: "tnt_northline", role: "supervisor", name: "Tom Hughes", email: "tom.hughes@xtelecom.example", status: "active", teamId: "team_nl_l1" },
  { id: "usr_priya", tenantId: "tnt_northline", role: "client_admin", name: "Priya Shah", email: "priya.shah@xtelecom.example", status: "active" },
  { id: "usr_owen", tenantId: "tnt_brightwater", role: "client_admin", name: "Owen Price", email: "owen.price@brightwater.example", status: "active" },
  { id: "usr_lena", tenantId: "tnt_brightwater", role: "agent", name: "Lena Morris", email: "lena.morris@brightwater.example", status: "invited", teamId: "team_bw_heating" },
  { id: "usr_grace", tenantId: "tnt_harbour", role: "client_admin", name: "Grace Okafor", email: "grace.okafor@harbour.example", status: "active" },
  { id: "usr_james", tenantId: "aiuk", role: "aiuk_admin", name: "James Carter", email: "james.carter@absoluteintelligence.example", status: "active" },
  { id: "usr_nadia", tenantId: "aiuk", role: "qa_reviewer", name: "Nadia Rahman", email: "nadia.rahman@absoluteintelligence.example", status: "active" },
];

export interface Integration {
  id: string;
  tenantId: string;
  name: string;
  category: "crm" | "case_management" | "field_service" | "notifications" | "network_diagnostics" | "identity" | "claims";
  provider: string;
  status: "connected" | "degraded" | "not_configured" | "sandbox";
  tools: string[];
  lastSyncAt?: string;
  p95LatencyMs?: number;
  errorRate24h?: number;
}

export const integrations: Integration[] = [
  { id: "int_nl_crm", tenantId: "tnt_northline", name: "Customer CRM", category: "crm", provider: "Salesforce Service Cloud", status: "sandbox", tools: ["update_case", "create_ticket"], lastSyncAt: "2026-10-11T08:40:00.000Z", p95LatencyMs: 640, errorRate24h: 0.004 },
  { id: "int_nl_linetest", tenantId: "tnt_northline", name: "Line Diagnostics", category: "network_diagnostics", provider: "X Telecom NetOps API", status: "sandbox", tools: ["line_test"], lastSyncAt: "2026-10-11T08:42:00.000Z", p95LatencyMs: 2300, errorRate24h: 0.011 },
  { id: "int_nl_fsm", tenantId: "tnt_northline", name: "Engineer Scheduling", category: "field_service", provider: "Field Service Platform", status: "not_configured", tools: ["book_engineer"] },
  { id: "int_nl_sms", tenantId: "tnt_northline", name: "SMS Session Links", category: "notifications", provider: "SMS Gateway", status: "sandbox", tools: ["send_sms_summary"], lastSyncAt: "2026-10-11T08:12:00.000Z", p95LatencyMs: 410, errorRate24h: 0 },
  { id: "int_bw_fsm", tenantId: "tnt_brightwater", name: "Engineer Booking", category: "field_service", provider: "Brightwater Workforce", status: "not_configured", tools: ["book_engineer"] },
  { id: "int_hb_claims", tenantId: "tnt_harbour", name: "Claims Platform", category: "claims", provider: "Harbour ClaimsCentre", status: "not_configured", tools: ["attach_claim_evidence"] },
  { id: "int_aiuk_sso", tenantId: "aiuk", name: "Workforce SSO", category: "identity", provider: "OIDC / SAML", status: "not_configured", tools: [] },
];

export function getTenant(id: string): Tenant | undefined {
  return tenants.find((t) => t.id === id);
}
export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return workflows.find((w) => w.id === id);
}
/** Lineage key of a policy version (what workflows and agents reference). */
export function policyKey(p: Policy): string {
  return p.key ?? p.id;
}

/**
 * Resolve a policy reference. A lineage key resolves to its active
 * (published) version, falling back to the newest version while a policy has
 * never been published; a version id resolves to exactly that version.
 */
export function getPolicy(idOrKey: string): Policy | undefined {
  const lineage = policies.filter((p) => policyKey(p) === idOrKey);
  if (lineage.length) return lineage.find((p) => p.status === "active") ?? [...lineage].sort((a, b) => b.version - a.version)[0];
  return policies.find((p) => p.id === idOrKey);
}
export function getAgent(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id);
}
export function tenantName(id: string): string {
  if (id === "aiuk") return "Absolute Intelligence UK";
  return getTenant(id)?.name ?? id;
}
