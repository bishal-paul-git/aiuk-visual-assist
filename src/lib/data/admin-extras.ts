import type { ClientId } from "../types";

export interface ClientUser { name: string; email: string; role: "Tenant Admin" | "Supervisor" | "Agent" | "QA Reviewer" | "Analyst"; status: "active" | "invited" | "suspended"; lastActive: string }
export interface ClientIntegration { name: string; kind: string; status: "connected" | "degraded" | "not_configured"; detail: string }

export const clientUsers: Record<ClientId, ClientUser[]> = {
  northstar: [
    { name: "Tom Ellery", email: "tom.ellery@northstar-utilities.example", role: "Supervisor", status: "active", lastActive: "Today, 14:10" },
    { name: "Aisha Rahman", email: "aisha.rahman@northstar-utilities.example", role: "Agent", status: "active", lastActive: "Today, 13:52" },
    { name: "R. Okafor", email: "r.okafor@northstar-utilities.example", role: "Tenant Admin", status: "active", lastActive: "Today, 09:31" },
    { name: "Helen Marsh", email: "helen.marsh@northstar-utilities.example", role: "QA Reviewer", status: "active", lastActive: "02 Oct 2026" },
    { name: "Callum Reid", email: "callum.reid@northstar-utilities.example", role: "Analyst", status: "invited", lastActive: "—" },
  ],
  clearwave: [
    { name: "Priya Nair", email: "priya.nair@clearwave-telecom.example", role: "Agent", status: "active", lastActive: "Today, 14:28" },
    { name: "Daniel Hughes", email: "daniel.hughes@clearwave-telecom.example", role: "Agent", status: "active", lastActive: "Today, 14:05" },
    { name: "Megan Foster", email: "megan.foster@clearwave-telecom.example", role: "Supervisor", status: "active", lastActive: "Today, 11:40" },
    { name: "A. Whitfield", email: "a.whitfield@clearwave-telecom.example", role: "Tenant Admin", status: "active", lastActive: "01 Oct 2026" },
    { name: "Ravi Menon", email: "ravi.menon@clearwave-telecom.example", role: "QA Reviewer", status: "suspended", lastActive: "14 Sep 2026" },
  ],
  horizon: [
    { name: "Claire Bennett", email: "claire.bennett@horizon-insurance.example", role: "Agent", status: "active", lastActive: "Today, 13:15" },
    { name: "Jonas Weber", email: "jonas.weber@horizon-insurance.example", role: "Agent", status: "active", lastActive: "Today, 12:02" },
    { name: "S. Patel", email: "s.patel@horizon-insurance.example", role: "Tenant Admin", status: "active", lastActive: "Today, 10:20" },
    { name: "Imogen Clarke", email: "imogen.clarke@horizon-insurance.example", role: "Analyst", status: "invited", lastActive: "—" },
  ],
};

export const clientIntegrations: Record<ClientId, ClientIntegration[]> = {
  northstar: [
    { name: "Salesforce Service Cloud", kind: "CRM", status: "connected", detail: "Last sync 2 min ago" },
    { name: "Field service scheduler", kind: "Work orders", status: "connected", detail: "Last sync 6 min ago" },
    { name: "Twilio SMS", kind: "Messaging", status: "connected", detail: "Healthy" },
    { name: "Okta SSO", kind: "Identity", status: "connected", detail: "SAML 2.0" },
  ],
  clearwave: [
    { name: "ServiceNow", kind: "Ticketing", status: "connected", detail: "Last sync 1 min ago" },
    { name: "Network OSS (read-only)", kind: "Line status", status: "degraded", detail: "Elevated latency (p95 2.1s)" },
    { name: "Twilio SMS", kind: "Messaging", status: "connected", detail: "Healthy" },
    { name: "Azure AD SSO", kind: "Identity", status: "connected", detail: "OIDC" },
  ],
  horizon: [
    { name: "Guidewire ClaimCenter", kind: "Claims", status: "connected", detail: "Sandbox environment" },
    { name: "Twilio SMS", kind: "Messaging", status: "connected", detail: "Healthy" },
    { name: "Document redaction service", kind: "Privacy", status: "not_configured", detail: "Pending DPO sign-off" },
    { name: "Azure AD SSO", kind: "Identity", status: "not_configured", detail: "Pilot users use local login" },
  ],
};

export const agentVersionHistory: Record<string, { v: string; date: string; author: string; note: string }[]> = {
  ava: [
    { v: "v3.2.0", date: "12 Sep 2026", author: "A. Whitfield", note: "Updated Hub 5 status light guide; tightened greeting" },
    { v: "v3.1.0", date: "30 Jul 2026", author: "A. Whitfield", note: "Added remote line reset tool (medium risk)" },
    { v: "v3.0.0", date: "02 Jun 2026", author: "M. Clarke", note: "Migrated to multimodal reasoning model v4" },
  ],
  sophie: [
    { v: "v2.7.1", date: "03 Sep 2026", author: "R. Okafor", note: "Approved fault-code subset refreshed" },
    { v: "v2.7.0", date: "15 Aug 2026", author: "R. Okafor", note: "Gas safety escalation wording" },
  ],
  ella: [
    { v: "v1.4.0", date: "09 Sep 2026", author: "S. Patel", note: "FNOL evidence standard update" },
    { v: "v1.3.0", date: "21 Aug 2026", author: "S. Patel", note: "Vulnerable customer handling" },
  ],
  "ava-cy": [{ v: "v0.3.0-draft", date: "24 Sep 2026", author: "A. Whitfield", note: "Welsh scripts imported" }],
};

export const dataResidencyOptions = ["UK only", "UK + EU (adequacy)", "Customer-specified region"];
