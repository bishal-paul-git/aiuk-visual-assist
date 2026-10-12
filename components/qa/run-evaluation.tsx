"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";

const fieldClass =
  "h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

/**
 * Explicit "Run" action for an evaluation set. The real model is only offered
 * when the server has credentials, and is never called without this click.
 */
export function RunEvaluation({ setId, liveAvailable, liveModel }: { setId: string; liveAvailable: boolean; liveModel?: string }) {
  const router = useRouter();
  const [provider, setProvider] = useState<"simulated" | "claude">("simulated");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Provider
          <select className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value as "simulated" | "claude")} disabled={busy}>
            <option value="simulated">Simulated scene reader</option>
            <option value="claude" disabled={!liveAvailable}>
              {liveAvailable ? `Claude${liveModel ? ` (${liveModel})` : ""} — real model, billed` : "Claude — not configured"}
            </option>
          </select>
        </label>
        <button
          type="button"
          className={buttonClass("primary", "sm")}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            const res = await fetch("/api/qa/evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setId, provider }) });
            const body = await res.json().catch(() => ({}));
            setBusy(false);
            if (!res.ok) return setError(body.error ?? "The evaluation could not be run");
            router.push(`/platform/qa/evaluations?set=${encodeURIComponent(setId)}&run=${encodeURIComponent(body.id)}`);
            router.refresh();
          }}
        >
          <Play className="size-3.5" aria-hidden /> {busy ? (provider === "claude" ? "Running against the model…" : "Running…") : "Run"}
        </button>
      </div>
      {error && (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
