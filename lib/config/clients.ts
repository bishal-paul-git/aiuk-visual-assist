import { agents, policies, teams, tenants, users, workflows, type HumanTeam } from "@/lib/config/catalog";
import type { AgentConfig, Policy, Sector, Tenant, User, WorkflowDefinition } from "@/lib/domain/types";

/**
 * Clients added on the platform (Platform → Clients → Add a client), without
 * code. A new client starts from a ready template for its industry: the AI
 * flow, the safety rules, a support team, an AI agent and staff logins.
 * The tenant, agent, team and users are saved here; the copied flow and
 * rules are saved with the other workflows and policies
 * (lib/server/store/config.ts).
 */

export interface StoredClient {
  tenant: Tenant;
  agent: AgentConfig;
  team: HumanTeam;
  users: User[];
}

export type ClientTemplate = "broadband" | "boiler" | "home_damage";

interface TemplateDef {
  label: string;
  sector: Sector;
  workflowId: string;
  policyId: string;
  teamName: string;
  skills: string[];
  escalationReasons: string[];
}

export const CLIENT_TEMPLATES: Record<ClientTemplate, TemplateDef> = {
  broadband: {
    label: "Broadband: internet down / router lights",
    sector: "telecommunications",
    workflowId: "wf_router_v3",
    policyId: "pol_northline_standard",
    teamName: "Broadband Support",
    skills: ["router", "wifi", "cabling", "line_faults", "engineer_booking"],
    escalationReasons: ["customer_requested", "low_visual_confidence", "unresolved_after_workflow", "out_of_scope", "workflow_failure"],
  },
  boiler: {
    label: "Energy: boiler fault code",
    sector: "utilities",
    workflowId: "wf_boiler_v1",
    policyId: "pol_brightwater_safety",
    teamName: "Heating Advisers",
    skills: ["boilers", "gas_safety", "engineer_booking"],
    escalationReasons: ["safety_policy", "unresolved_after_workflow", "customer_requested"],
  },
  home_damage: {
    label: "Insurance: home damage photos for a claim",
    sector: "insurance",
    workflowId: "wf_home_damage_v1",
    policyId: "pol_harbour_claims",
    teamName: "Claims Handlers",
    skills: ["home_claims", "evidence_review"],
    escalationReasons: ["customer_requested", "unresolved_after_workflow"],
  },
};

export interface NewClientInput {
  name: string;
  template: ClientTemplate;
  primaryColor: string;
  supportLine?: string;
  /** Real client: staff are hidden from demo pickers and sign in with the client password. */
  private: boolean;
  /** Staff: the first is the client's manager; the rest are support agents. */
  staff: { name: string; email: string }[];
  retention: { evidenceDays: number; transcriptDays: number };
}

const g = globalThis as unknown as { __aiukClients?: StoredClient[]; __aiukClientChange?: () => void };

export function storedClients(): StoredClient[] {
  return (g.__aiukClients ??= []);
}

export function setClientListener(fn: () => void) {
  g.__aiukClientChange = fn;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks the form. Returns an error message or clean input. */
export function validateNewClient(body: Record<string, unknown>): NewClientInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 40) return "The client name must be 2 to 40 characters.";
  if (tenants.some((t) => t.name.toLowerCase() === name.toLowerCase())) return "A client with that name already exists.";
  const template = body.template as ClientTemplate;
  if (!(template in CLIENT_TEMPLATES)) return "Pick what the AI should help with.";
  const primaryColor = typeof body.primaryColor === "string" && body.primaryColor.trim() ? body.primaryColor.trim() : "#1D5BD8";
  if (!COLOR.test(primaryColor)) return "The colour must look like #1D5BD8.";
  const supportLine = typeof body.supportLine === "string" && body.supportLine.trim() ? body.supportLine.trim() : undefined;
  if (supportLine && !/^[+0-9 ()-]{6,30}$/.test(supportLine)) return "The support line may only contain digits, spaces, + ( ) and -.";
  const rawStaff = Array.isArray(body.staff) ? body.staff : [];
  const staff: { name: string; email: string }[] = [];
  for (const s of rawStaff.slice(0, 20)) {
    const r = (s ?? {}) as Record<string, unknown>;
    const n = typeof r.name === "string" ? r.name.trim().slice(0, 60) : "";
    const e = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
    if (!n && !e) continue;
    if (n.length < 2) return "Each staff member needs a name.";
    if (!EMAIL.test(e) || e.length > 120) return `"${e || n}" is not a valid email address.`;
    if (users.some((u) => u.email.toLowerCase() === e) || staff.some((x) => x.email === e)) return `${e} is already used by another login.`;
    staff.push({ name: n, email: e });
  }
  if (!staff.length) return "Add at least one staff member (the client's manager).";
  const days = (v: unknown, def: number) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : def);
  const evidenceDays = days(body.evidenceDays, 30);
  const transcriptDays = days(body.transcriptDays, 90);
  if (evidenceDays < 1 || evidenceDays > 730 || transcriptDays < 1 || transcriptDays > 730) return "Keep photos and transcripts for 1 to 730 days.";
  return { name, template, primaryColor, supportLine, private: body.private === true, staff, retention: { evidenceDays, transcriptDays } };
}

function slug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "client";
  let id = `tnt_${base}`;
  for (let i = 2; tenants.some((t) => t.id === id); i++) id = `tnt_${base}${i}`;
  return id;
}

/** Build every record for a new client. Pure: nothing is added to the catalog. */
export function buildClient(input: NewClientInput, now: string): { client: StoredClient; workflow: WorkflowDefinition; policy: Policy } {
  const tpl = CLIENT_TEMPLATES[input.template];
  const tenantId = slug(input.name);
  const short = tenantId.slice(4);
  const sourceWf = workflows.find((w) => w.id === tpl.workflowId);
  const sourcePol = policies.find((p) => p.id === tpl.policyId);
  if (!sourceWf || !sourcePol) throw new Error("The template for this industry is missing.");

  const workflow: WorkflowDefinition = {
    ...structuredClone(sourceWf),
    id: `wf_${short}_${sourceWf.key.replace(/[^a-z0-9]+/g, "_")}_v1`,
    tenantId,
    version: 1,
    status: "published",
    basedOnVersion: undefined,
    submittedAt: undefined,
    submittedBy: undefined,
    submittedById: undefined,
    retiredAt: undefined,
  };
  const policyId = `pol_${short}_standard`;
  const policy: Policy = {
    ...structuredClone(sourcePol),
    id: policyId,
    key: undefined,
    tenantId,
    name: `${input.name} Standard Rules`,
    version: 1,
    status: "active",
    basedOnVersion: undefined,
    submittedAt: undefined,
    submittedBy: undefined,
    submittedById: undefined,
    changeNote: `v1: copied from the ${tpl.label.split(":")[0].toLowerCase()} template.`,
    publishedAt: now,
    publishedBy: "Absolute Intelligence",
  };
  const tenant: Tenant = {
    id: tenantId,
    name: input.name,
    sector: tpl.sector,
    status: "onboarding",
    brand: { displayName: input.name, primaryColor: input.primaryColor, ...(input.supportLine ? { supportLine: input.supportLine } : {}) },
    region: "uk-south",
    retention: { evidenceMode: "retained_evidence", evidenceRetentionDays: input.retention.evidenceDays, transcriptRetentionDays: input.retention.transcriptDays, auditRetentionDays: 730 },
    featureFlags: { visual_assist: true, ai_copilot_after_takeover: true, sms_entry: true, qr_entry: true, voice_only_fallback: true, ...(input.private ? { private_client: true } : {}) },
    createdAt: now,
    updatedAt: now,
  };
  const team: HumanTeam = {
    id: `team_${short}_support`,
    tenantId,
    name: `${input.name} ${tpl.teamName}`,
    skills: tpl.skills,
    hours: "Mon–Fri 09:00–17:30",
    targetAnswerSec: 90,
    escalationReasons: tpl.escalationReasons,
  };
  const agent: AgentConfig = {
    id: `agt_${short}`,
    tenantId,
    name: `${input.name} Assistant`,
    model: { provider: "mock", model: "aiuk-reasoning-sim-1", visionModel: "aiuk-vision-sim-1" },
    voice: { provider: "browser", voiceId: "en-GB-default", speakingRate: 1 },
    language: { primary: "en-GB", supported: ["en-GB"] },
    policyIds: [policyId],
    workflowIds: [workflow.id],
    promptVersion: "router-assist-prompt@7",
    version: 1,
    status: "active",
  };
  const staffUsers: User[] = input.staff.map((s, i) => ({
    id: `usr_${short}_${i + 1}`,
    tenantId,
    role: i === 0 ? "client_admin" : "agent",
    name: s.name,
    email: s.email,
    status: "active",
    ...(i === 0 ? {} : { teamId: team.id }),
  }));
  return { client: { tenant, agent, team, users: staffUsers }, workflow, policy };
}

function addToCatalog(c: StoredClient) {
  if (!tenants.some((t) => t.id === c.tenant.id)) tenants.push(c.tenant);
  if (!agents.some((a) => a.id === c.agent.id)) agents.push(c.agent);
  if (!teams.some((t) => t.id === c.team.id)) teams.push(c.team);
  for (const u of c.users) if (!users.some((x) => x.id === u.id)) users.push(u);
}

/** Create a client from the platform; saved with the configuration. */
export function createClient(input: NewClientInput, now = new Date().toISOString()): StoredClient {
  const { client, workflow, policy } = buildClient(input, now);
  workflows.push(workflow);
  policies.push(policy);
  storedClients().push(client);
  addToCatalog(client);
  g.__aiukClientChange?.();
  return client;
}

/** Load saved clients at boot (after workflows and policies are restored). */
export function loadClients(saved: StoredClient[] | undefined) {
  const store = storedClients();
  for (const c of saved ?? []) {
    if (!c?.tenant?.id || store.some((x) => x.tenant.id === c.tenant.id)) continue;
    store.push(c);
    addToCatalog(c);
  }
}
