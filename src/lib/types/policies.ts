import type { ClientId } from "./core";

export type PolicyCategory =
  | "Visual confidence"
  | "Safety"
  | "Human-required actions"
  | "Sensitive visual data"
  | "Retention"
  | "Escalation";

export type PolicyStatus = "active" | "draft" | "review";

export interface PolicyRule {
  id: string;
  condition: string;
  action: string;
  effect: "allow" | "restrict" | "block" | "escalate" | "log";
}

export interface Policy {
  id: string; // e.g. POL-VC-01
  name: string;
  category: PolicyCategory;
  scope: "global" | "tenant";
  status: PolicyStatus;
  version: string;
  description: string;
  rules: PolicyRule[];
  workflowsAffected: string[]; // workflow ids
  clientIds: ClientId[];
  owner: string;
  updated: string;
  history: { v: string; date: string; author: string; note: string }[];
}

export interface HumanRequiredAction {
  action: string;
  risk: "low" | "medium" | "high";
  confirmer: string;
  reason: string;
}
