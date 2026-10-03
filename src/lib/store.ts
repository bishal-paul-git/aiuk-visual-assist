"use client";
import { useSyncExternalStore } from "react";
import type { AuditEntry, ClientId, Owner, SessionStatus } from "./types";

/**
 * Tiny external store (no dependency). Holds all mutable demo state so every
 * screen stays consistent: e.g. a takeover in the agent console is reflected in
 * Live Sessions and Session Detail. Replace with server state + WebSocket events later.
 */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (patch: Partial<T> | ((s: T) => Partial<T>)) => {
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
  };
}

export interface SessionNote { id: string; at: string; author: string; text: string; category: string }
export interface SessionOverride {
  status?: SessionStatus;
  owner?: Owner;
  humanAgent?: string;
  notes: SessionNote[];
  audit: AuditEntry[];
  outcome?: string;
}
export type QaState = "pending" | "in_review" | "approved" | "rejected" | "needs_coaching";

export interface AppState {
  clientFilter: ClientId | "all";
  sessionOverrides: Record<string, SessionOverride>;
  qaStates: Record<string, QaState>;
  qaNotes: Record<string, string[]>;
  integrationStatus: Record<string, string>;
  featureFlags: Record<string, boolean>;
  /** Edited policy rules keyed by `${policyId}:${ruleId}` — persists across drawer open/close. */
  policyRuleEdits: Record<string, { condition: string; action: string; effect: "allow" | "restrict" | "block" | "escalate" | "log" }>;
  policyEnabled: Record<string, boolean>;
  user: { name: string; email: string; role: string } | null;
}

export const appStore = createStore<AppState>({
  clientFilter: "all",
  sessionOverrides: {},
  qaStates: {},
  qaNotes: {},
  integrationStatus: {},
  featureFlags: {},
  policyRuleEdits: {},
  policyEnabled: {},
  user: { name: "Amelia Hart", email: "amelia.hart@absoluteintelligence.co.uk", role: "Platform Administrator" },
});

export function useAppState<S>(selector: (s: AppState) => S): S {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.get()), () => selector(appStore.get()));
}

const clock = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
let uid = 0;
export const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${uid++}`;

export const actions = {
  setClientFilter: (c: ClientId | "all") => appStore.set({ clientFilter: c }),

  /** Patch a session and optionally append an audit entry (demo-only mutation). */
  updateSession(id: string, patch: Partial<SessionOverride>, audit?: Omit<AuditEntry, "id" | "at">) {
    appStore.set((s) => {
      const cur = s.sessionOverrides[id] ?? { notes: [], audit: [] };
      return {
        sessionOverrides: {
          ...s.sessionOverrides,
          [id]: { ...cur, ...patch, audit: audit ? [...cur.audit, { ...audit, id: nextId("ae"), at: clock() }] : cur.audit },
        },
      };
    });
  },
  takeOver(id: string, agent = "Priya Nair") {
    actions.updateSession(id, { owner: "Human", status: "human_joined", humanAgent: agent }, { actor: agent, event: "Ownership changed", detail: "AI → Human (take over)", tone: "human" });
  },
  returnToAI(id: string) {
    actions.updateSession(id, { owner: "AI", status: "ai_handling" }, { actor: "Human adviser", event: "Ownership changed", detail: "Human → AI (returned with note)", tone: "neutral" });
  },
  endSession(id: string, outcome = "Resolved by human") {
    actions.updateSession(id, { status: "resolved", outcome }, { actor: "Human adviser", event: "Session ended", detail: `Outcome: ${outcome}`, tone: "ok" });
  },
  addNote(id: string, text: string, category: string, author = "Priya Nair") {
    appStore.set((s) => {
      const cur = s.sessionOverrides[id] ?? { notes: [], audit: [] };
      const note: SessionNote = { id: nextId("n"), at: clock(), author, text, category };
      return {
        sessionOverrides: {
          ...s.sessionOverrides,
          [id]: { ...cur, notes: [note, ...cur.notes], audit: [...cur.audit, { id: nextId("ae"), at: clock(), actor: author, event: "Note added", detail: `${category}: ${text.slice(0, 80)}`, tone: "neutral" }] },
        },
      };
    });
  },
  setQa: (id: string, st: QaState) => appStore.set((s) => ({ qaStates: { ...s.qaStates, [id]: st } })),
  addQaNote: (id: string, text: string) => appStore.set((s) => ({ qaNotes: { ...s.qaNotes, [id]: [...(s.qaNotes[id] ?? []), text] } })),
  setIntegrationStatus: (id: string, st: string) => appStore.set((s) => ({ integrationStatus: { ...s.integrationStatus, [id]: st } })),
  setFlag: (id: string, on: boolean) => appStore.set((s) => ({ featureFlags: { ...s.featureFlags, [id]: on } })),
  editPolicyRule: (key: string, patch: AppState["policyRuleEdits"][string]) => appStore.set((s) => ({ policyRuleEdits: { ...s.policyRuleEdits, [key]: patch } })),
  setPolicyEnabled: (id: string, on: boolean) => appStore.set((s) => ({ policyEnabled: { ...s.policyEnabled, [id]: on } })),
  signIn: () => appStore.set({}),
};
