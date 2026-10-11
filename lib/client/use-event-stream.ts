"use client";

import { useEffect, useState } from "react";

export type StreamStatus = "connecting" | "open" | "reconnecting" | "closed";

/** Subscribe to an SSE endpoint that pushes full snapshots. EventSource retries automatically. */
export function useEventStream<T>(url: string | null, initial: T): { data: T; status: StreamStatus; lastMessageAt: number } {
  const [data, setData] = useState<T>(initial);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [lastMessageAt, setLast] = useState(() => Date.now());

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    es.onopen = () => setStatus("open");
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as T | null;
        if (parsed) setData(parsed);
        setLast(Date.now());
        setStatus("open");
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
    return () => es.close();
  }, [url]);

  return { data, status, lastMessageAt };
}

export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 204) return { ok: true };
    const data = await res.json().catch(() => undefined);
    return res.ok ? { ok: true, data } : { ok: false, error: (data as { error?: string })?.error ?? `Request failed (${res.status})` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
