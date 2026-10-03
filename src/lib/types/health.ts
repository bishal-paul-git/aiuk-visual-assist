export type ServiceStatus = "Operational" | "Degraded" | "Incident" | "Maintenance";

export interface LatencyPoint { t: string; p50: number; p95: number; errors: number }
export interface ServiceEvent { at: string; text: string; tone: "ok" | "warn" | "bad" | "neutral" }

export interface ServiceHealth {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  p50: number;
  p95: number;
  uptime30: number;
  errors24h: number;
  region: string;
  provider: string; // labelled demo
  latency24h: LatencyPoint[];
  uptimeDays: number[]; // 30 values, % per day (oldest first)
  dependencies: string[];
  events: ServiceEvent[];
  incidentId?: string;
  maintenance?: { window: string; note: string };
  runbook: string;
}

export interface FallbackPath {
  id: string;
  name: string;
  trigger: string;
  behaviour: string;
  status: "Ready" | "Active" | "Degraded";
  last24h: number; // times invoked
  lastTested: string;
}

export interface BudgetStage { id: string; label: string; budgetMs: number; actualMs: number; detail: string }
export interface IncidentUpdate { at: string; state: string; text: string }
