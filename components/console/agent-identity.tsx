"use client";

import { useSyncExternalStore } from "react";
import { users } from "@/lib/config/catalog";

/**
 * POC agent identity picker. In production the agent is the SSO-authenticated
 * user; this lets one browser act as different agents for testing handover.
 */
export const CONSOLE_AGENTS = users.filter((u) => u.tenantId === "tnt_northline" && (u.role === "agent" || u.role === "supervisor"));
const KEY = "va.console.agent";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? CONSOLE_AGENTS[0].id;
  } catch {
    return CONSOLE_AGENTS[0].id;
  }
}

export function setAgentId(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable — selection lasts for this page only */
  }
  memo = id;
  listeners.forEach((l) => l());
}

let memo: string | null = null;

export function useAgentId(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => memo ?? (memo = read()),
    () => CONSOLE_AGENTS[0].id,
  );
}

export function AgentPicker() {
  const id = useAgentId();
  const agent = CONSOLE_AGENTS.find((a) => a.id === id) ?? CONSOLE_AGENTS[0];
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="hidden size-7 items-center justify-center rounded-full bg-violet sm:flex text-[11px] font-semibold text-white" aria-hidden>
        {agent.name
          .split(" ")
          .map((p) => p[0])
          .join("")}
      </span>
      <span className="sr-only">Signed in as</span>
      <select value={id} onChange={(e) => setAgentId(e.target.value)} className="h-8 max-w-36 rounded-md border border-white/20 bg-navy-2 px-2 text-xs text-white sm:max-w-none">
        {CONSOLE_AGENTS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.role === "supervisor" ? "Supervisor" : "Agent"}
          </option>
        ))}
      </select>
      <span className="hidden items-center gap-1 text-white/70 md:flex">
        <span className="size-1.5 rounded-full bg-[#3bd16f]" aria-hidden /> Available
      </span>
    </label>
  );
}
