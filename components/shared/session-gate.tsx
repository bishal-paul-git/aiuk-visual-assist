"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { getTransport } from "@/lib/client/transport";

/**
 * Loads a session snapshot on the client (query-string routes used by the
 * static demo, where sessions created in the browser have no prerendered page).
 */
export function SessionGate<T>({
  load,
  render,
  missing,
}: {
  load: (t: Awaited<ReturnType<typeof getTransport>>) => Promise<T | undefined>;
  render: (value: T) => ReactNode;
  missing: { title: string; body: string };
}) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; value: T } | { status: "missing" }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void getTransport()
      .then(load)
      .then((v) => alive && setState(v ? { status: "ready", value: v } : { status: "missing" }))
      .catch(() => alive && setState({ status: "missing" }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mount
  }, []);
  if (state.status === "ready") return <>{render(state.value)}</>;
  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted" role="status">
        Loading session…
      </div>
    );
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <LogoMark className="size-10" />
      <h1 className="mt-5 text-xl font-semibold text-ink">{missing.title}</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-2">{missing.body}</p>
      <Link href="/" className="mt-6 text-sm font-medium text-brand hover:underline">
        Go to Visual Assist
      </Link>
    </main>
  );
}
