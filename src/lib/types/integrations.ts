export type IntegrationStatus = "demo" | "not_configured" | "connected" | "requires_setup";
export type IntegrationCategory = "Real-time media" | "Voice" | "AI model" | "Orchestration" | "Business systems";
export type IntegrationIconKey = "video" | "mic" | "brain" | "workflow" | "users" | "ticket" | "wrench" | "message";

export interface IntegrationConfigField { label: string; value: string; kind: "secret" | "url" | "text" }
export interface Integration {
  id: string;
  name: string;
  vendor: string;
  icon: IntegrationIconKey;
  category: IntegrationCategory;
  purpose: string;
  role: string; // role in architecture (spec §6.2)
  defaultStatus: IntegrationStatus;
  region: string;
  environment: string;
  fields: IntegrationConfigField[];
  capabilities: string[];
}
