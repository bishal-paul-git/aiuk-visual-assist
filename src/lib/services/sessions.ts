"use client";
import { useMemo } from "react";
import { sessions as baseSessions } from "../data/sessions";
import { getSessionDetail } from "../data/session-details";
import { useAppState } from "../store";
import type { Session, SessionDetail } from "../types";

/**
 * Service layer. Today it merges static mock data with local overrides; in production these
 * hooks become thin wrappers over REST (`GET /sessions`) plus a WebSocket subscription for live
 * updates. UI code only depends on these return types.
 */
export interface SessionService {
  list(): Session[];
  get(id: string): Session | undefined;
  detail(id: string): SessionDetail | undefined;
}

export function useSessions(opts: { respectClientFilter?: boolean } = { respectClientFilter: true }): Session[] {
  const overrides = useAppState((s) => s.sessionOverrides);
  const client = useAppState((s) => s.clientFilter);
  return useMemo(() => {
    const merged = baseSessions.map((s) => {
      const o = overrides[s.id];
      if (!o) return s;
      return { ...s, status: o.status ?? s.status, owner: o.owner ?? s.owner, humanAgent: o.humanAgent ?? s.humanAgent, outcome: o.outcome ?? s.outcome, escalated: s.escalated || o.owner === "Human" };
    });
    return opts.respectClientFilter === false || client === "all" ? merged : merged.filter((s) => s.clientId === client);
  }, [overrides, client, opts.respectClientFilter]);
}

export function useSession(id: string) {
  const overrides = useAppState((s) => s.sessionOverrides);
  return useMemo(() => {
    const base = baseSessions.find((s) => s.id === id);
    if (!base) return { session: undefined, detail: undefined, override: undefined };
    const o = overrides[id];
    const session: Session = o ? { ...base, status: o.status ?? base.status, owner: o.owner ?? base.owner, humanAgent: o.humanAgent ?? base.humanAgent, outcome: o.outcome ?? base.outcome, escalated: base.escalated || o.owner === "Human" } : base;
    const d = getSessionDetail(id);
    const detail = d && o ? { ...d, audit: [...d.audit, ...o.audit] } : d;
    return { session, detail, override: o };
  }, [id, overrides]);
}
