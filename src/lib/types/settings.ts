export type UserRole = "Platform Admin" | "Client Admin" | "Supervisor" | "QA Reviewer" | "Human Agent" | "Read-only";
export interface OrgUser { id: string; name: string; email: string; role: UserRole; active: boolean; mfa: boolean; lastActive: string }
export interface Permission { id: string; label: string; group: string }
export interface Region { id: string; name: string; location: string; status: "Active" | "Standby" | "Planned"; residency: string }
export interface Subprocessor { name: string; purpose: string; region: string; dpa: string }
export interface FeatureFlagDef { id: string; name: string; description: string; env: "Production" | "Staging" | "All"; rollout: number; defaultOn: boolean }
export type RetentionMode = "live_only" | "selected_frames" | "full_evidence";
