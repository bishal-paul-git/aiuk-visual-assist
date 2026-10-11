"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AssistApp } from "@/components/assist/assist-app";
import { SessionGate } from "@/components/shared/session-gate";

function AssistByQuery() {
  const token = useSearchParams().get("t") ?? "";
  return (
    <SessionGate
      load={(t) => t.customerSnapshot(token)}
      render={(view) => <AssistApp token={token} initial={view} serverNow={Date.parse(view.instruction.at)} />}
      missing={{ title: "This link isn't valid", body: "It may have expired, or it was created on a different device." }}
    />
  );
}

export default function AssistQueryPage() {
  return (
    <Suspense>
      <AssistByQuery />
    </Suspense>
  );
}
