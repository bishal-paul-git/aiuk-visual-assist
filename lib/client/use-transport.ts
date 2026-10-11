"use client";

import { useEffect, useState } from "react";
import type { AgentView, CustomerView, SessionSummaryView } from "@/lib/session/projections";
import { getTransport, type StreamStatus, type Transport } from "./transport";

export function useTransport(): Transport | null {
  const [t, setT] = useState<Transport | null>(null);
  useEffect(() => {
    let alive = true;
    void getTransport().then((x) => alive && setT(x));
    return () => {
      alive = false;
    };
  }, []);
  return t;
}

function useStream<T>(initial: T, subscribe: ((t: Transport, onData: (v: T) => void, onStatus: (s: StreamStatus) => void) => () => void) | null) {
  const transport = useTransport();
  const [data, setData] = useState<T>(initial);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  useEffect(() => {
    if (!transport || !subscribe) return;
    return subscribe(transport, setData, setStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe is keyed by the caller's id
  }, [transport]);
  return { data, status, transport };
}

export function useCustomerStream(token: string, initial: CustomerView) {
  return useStream(initial, (t, d, s) => t.subscribeCustomer(token, d, s));
}

export function useAgentStream(id: string, initial: AgentView) {
  return useStream(initial, (t, d, s) => t.subscribeAgent(id, d, s));
}

export function useLiveSessions(initial: SessionSummaryView[]) {
  return useStream(initial, (t, d, s) => t.subscribeLive(d, s));
}
