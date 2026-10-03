import type { Client } from "../types";

export const clients: Client[] = [
  { id: "northstar", name: "Northstar Utilities", industry: "Energy & Utilities", status: "live", region: "UK South (London)", accent: "#0F766E", initials: "NU", retentionDays: 30, retentionMode: "selected_frames", contractTier: "Enterprise" },
  { id: "clearwave", name: "ClearWave Telecom", industry: "Telecommunications", status: "live", region: "UK South (London)", accent: "#2563EB", initials: "CW", retentionDays: 14, retentionMode: "selected_frames", contractTier: "Enterprise" },
  { id: "horizon", name: "Horizon Insurance", industry: "Insurance", status: "pilot", region: "UK West (Cardiff)", accent: "#7C3AED", initials: "HI", retentionDays: 90, retentionMode: "full_evidence", contractTier: "Pilot" },
];

export const clientById = (id: string) => clients.find((c) => c.id === id);
