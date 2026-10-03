import type { FeatureFlagDef, OrgUser, Permission, Region, Subprocessor, UserRole } from "../types/settings";

export const org = {
  name: "Absolute Intelligence", legalEntity: "Absolute Intelligence UK Ltd", companyNo: "13579246", domain: "absoluteintelligence.co.uk",
  supportEmail: "support@absoluteintelligence.co.uk", securityEmail: "security@absoluteintelligence.co.uk", supportPhone: "+44 20 7946 0123",
};

export const users: OrgUser[] = [
  { id: "u1", name: "Amelia Hart", email: "amelia.hart@absoluteintelligence.co.uk", role: "Platform Admin", active: true, mfa: true, lastActive: "Today, 14:21" },
  { id: "u2", name: "Marcus Lee", email: "marcus.lee@absoluteintelligence.co.uk", role: "Platform Admin", active: true, mfa: true, lastActive: "Today, 11:03" },
  { id: "u3", name: "Rhiannon Pugh", email: "rhiannon.pugh@clearwave.example", role: "Client Admin", active: true, mfa: true, lastActive: "Today, 09:47" },
  { id: "u4", name: "Priya Nair", email: "priya.nair@clearwave.example", role: "Human Agent", active: true, mfa: true, lastActive: "Today, 14:30" },
  { id: "u5", name: "Tom Ellery", email: "tom.ellery@northstar.example", role: "Human Agent", active: true, mfa: false, lastActive: "02 Oct, 17:12" },
  { id: "u6", name: "Aisha Rahman", email: "aisha.rahman@northstar.example", role: "Supervisor", active: true, mfa: true, lastActive: "Today, 13:05" },
  { id: "u7", name: "Claire Bennett", email: "claire.bennett@horizon.example", role: "QA Reviewer", active: true, mfa: true, lastActive: "01 Oct, 15:40" },
  { id: "u8", name: "Jonas Weber", email: "jonas.weber@horizon.example", role: "Read-only", active: false, mfa: false, lastActive: "18 Sep, 10:02" },
];

export const roles: UserRole[] = ["Platform Admin", "Client Admin", "Supervisor", "QA Reviewer", "Human Agent", "Read-only"];

export const permissions: Permission[] = [
  { id: "sessions.view", label: "View sessions and evidence", group: "Sessions" },
  { id: "sessions.takeover", label: "Take over / return sessions", group: "Sessions" },
  { id: "sessions.export", label: "Export session evidence", group: "Sessions" },
  { id: "workflows.edit", label: "Edit and publish workflows", group: "Configuration" },
  { id: "policies.edit", label: "Edit policies and thresholds", group: "Configuration" },
  { id: "agents.manage", label: "Manage AI agents", group: "Configuration" },
  { id: "qa.review", label: "Review and score sessions", group: "Quality" },
  { id: "analytics.view", label: "View analytics and costs", group: "Quality" },
  { id: "audit.view", label: "View audit log", group: "Governance" },
  { id: "users.manage", label: "Manage users and roles", group: "Governance" },
  { id: "tenant.settings", label: "Change tenant security and retention", group: "Governance" },
  { id: "killswitch", label: "Operate kill switch", group: "Governance" },
];

const grant = (ids: string[]) => ids;
export const defaultMatrix: Record<UserRole, string[]> = {
  "Platform Admin": grant(permissions.map((p) => p.id)),
  "Client Admin": grant(["sessions.view", "sessions.takeover", "sessions.export", "workflows.edit", "policies.edit", "agents.manage", "qa.review", "analytics.view", "audit.view", "users.manage", "tenant.settings"]),
  Supervisor: grant(["sessions.view", "sessions.takeover", "sessions.export", "qa.review", "analytics.view", "audit.view"]),
  "QA Reviewer": grant(["sessions.view", "qa.review", "analytics.view"]),
  "Human Agent": grant(["sessions.view", "sessions.takeover"]),
  "Read-only": grant(["sessions.view", "analytics.view"]),
};

export const regions: Region[] = [
  { id: "uk-south", name: "UK South", location: "London", status: "Active", residency: "Media, evidence and metadata stored in UK" },
  { id: "uk-west", name: "UK West", location: "Cardiff", status: "Active", residency: "Media, evidence and metadata stored in UK" },
  { id: "eu-west", name: "EU West", location: "Dublin", status: "Standby", residency: "EU data residency; no UK transfer without agreement" },
];

export const subprocessors: Subprocessor[] = [
  { name: "Cloud hosting provider (demo)", purpose: "Compute, storage, networking", region: "UK / EU", dpa: "Signed" },
  { name: "Multimodal inference provider (demo)", purpose: "Visual frame analysis", region: "UK South", dpa: "Signed" },
  { name: "Voice model provider (demo)", purpose: "Speech recognition and synthesis", region: "UK South", dpa: "Signed" },
  { name: "SMS and email gateway (demo)", purpose: "Customer notifications", region: "UK / EU", dpa: "Signed" },
  { name: "Managed WebRTC provider (demo)", purpose: "Real-time media transport", region: "UK South", dpa: "In review" },
];

export const notificationChannels = ["Email", "Slack", "SMS", "Webhook"] as const;
export const notificationEvents = [
  { id: "escalation", label: "Escalation raised" },
  { id: "policy-block", label: "Action blocked by policy" },
  { id: "incident", label: "Service incident opened" },
  { id: "qa-flag", label: "QA review flagged" },
  { id: "retention", label: "Retention purge completed" },
  { id: "login", label: "Failed sign-in attempts" },
] as const;
export const defaultNotifications: Record<string, string[]> = {
  escalation: ["Slack", "Webhook"], "policy-block": ["Email"], incident: ["Email", "Slack", "SMS"], "qa-flag": ["Email"], retention: ["Email"], login: ["Email", "Slack"],
};

export const featureFlags: FeatureFlagDef[] = [
  { id: "ai-copilot", name: "AI copilot during human session", description: "Show suggested next steps and visual observations to the human adviser after takeover.", env: "Production", rollout: 100, defaultOn: true },
  { id: "scene-change-triggers", name: "Scene-change frame triggers", description: "Select additional frames when the camera view changes materially.", env: "Production", rollout: 100, defaultOn: true },
  { id: "voice-only-fallback", name: "Voice-only fallback", description: "Continue on audio when video fails or camera consent is revoked.", env: "Production", rollout: 100, defaultOn: true },
  { id: "welsh-agent", name: "Welsh language agent", description: "Offer Welsh-language voice agent for UK West tenants.", env: "Staging", rollout: 25, defaultOn: false },
  { id: "live-redaction", name: "Live redaction", description: "Blur faces, documents and payment cards before frames are stored.", env: "Production", rollout: 60, defaultOn: true },
  { id: "multi-view-guidance", name: "Multi-view guidance", description: "Guide the customer to capture several angles before concluding.", env: "Staging", rollout: 40, defaultOn: false },
  { id: "sentiment-escalation", name: "Sentiment-based escalation", description: "Raise escalation when customer frustration is detected in speech.", env: "Staging", rollout: 10, defaultOn: false },
];
