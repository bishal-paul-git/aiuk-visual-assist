"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";

/** Claims a queued session for review and opens the review workspace. */
export function ClaimButton({ sessionId, size = "sm", label = "Claim" }: { sessionId: string; size?: "sm" | "md"; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={buttonClass("primary", size)}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          const res = await fetch(`/api/qa/reviews/${encodeURIComponent(sessionId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "claim" }),
          });
          const body = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return setError(body.error ?? "Could not claim this session");
          router.push(`/platform/qa/review/${encodeURIComponent(sessionId)}`);
          router.refresh();
        }}
      >
        <ClipboardCheck className="size-3.5" aria-hidden /> {busy ? "Claiming…" : label}
      </button>
      {error && (
        <span role="alert" className="max-w-[220px] text-right text-[11px] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
