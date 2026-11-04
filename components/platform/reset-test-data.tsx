"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { buttonClass, cx } from "@/components/ui/primitives";

/** Deletes every conversation of one client, so a pilot starts with an empty history. */
export function ResetTestData({ clients }: { clients: { id: string; name: string; sessions: number }[] }) {
  const [tenantId, setTenantId] = useState(clients[0]?.id ?? "");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<{ busy?: boolean; done?: string; error?: string }>({});
  const chosen = clients.find((c) => c.id === tenantId);

  async function reset() {
    setState({ busy: true });
    const r = await fetch("/api/admin/reset-test-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, confirm }) });
    const d = (await r.json().catch(() => ({}))) as { removed?: number; error?: string };
    if (!r.ok) return setState({ error: d.error ?? "That didn't work. Please try again." });
    setConfirm("");
    setState({ done: `Deleted ${d.removed ?? 0} conversation${d.removed === 1 ? "" : "s"} for ${chosen?.name}.` });
  }

  if (clients.length === 0) return null;
  return (
    <div className="space-y-3 text-sm" data-testid="reset-test-data">
      <p className="text-ink-2">
        Deletes every conversation of the client you choose (transcripts, photos and records), from the database too. Use it to give a client a clean start before a pilot. It can&apos;t be undone.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink">Client</span>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm">
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.sessions} conversation{c.sessions === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink">Type RESET to confirm</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9 w-32 rounded-md border border-line-strong bg-surface px-2 text-sm" aria-label="Type RESET to confirm" />
        </label>
        <button type="button" disabled={confirm !== "RESET" || state.busy} onClick={() => void reset()} className={cx(buttonClass("danger"), "h-9")}>
          <Trash2 className="size-4" aria-hidden /> {state.busy ? "Deleting…" : "Delete all conversations"}
        </button>
      </div>
      {state.done && (
        <p role="status" className="text-ok">
          {state.done}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
