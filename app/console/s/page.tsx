"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ConsoleSession } from "@/components/console/console-session";
import { SessionGate } from "@/components/shared/session-gate";

function ConsoleByQuery() {
  const id = useSearchParams().get("id") ?? "";
  return (
    <SessionGate
      load={(t) => t.agentSnapshot(id)}
      render={(view) => <ConsoleSession id={id} initial={view} serverNow={Date.parse(view.state.session.createdAt)} />}
      missing={{ title: "Session not found", body: "It may have been created on a different device." }}
    />
  );
}

export default function ConsoleQueryPage() {
  return (
    <Suspense>
      <ConsoleByQuery />
    </Suspense>
  );
}
