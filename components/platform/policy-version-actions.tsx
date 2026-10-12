"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranchPlus, PencilLine } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { STATIC_DEMO } from "@/lib/client/transport";

/** Policy lifecycle entry points on the policies page (mirrors WorkflowVersionActions). */
export function PolicyVersionActions({
  id,
  version,
  openDraft,
}: {
  /** The version shown (active, or newest when never published). */
  id: string;
  version: number;
  openDraft?: { id: string; version: number; status: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (STATIC_DEMO) {
    return <span className="text-[11px] text-muted" title="Policy editing needs the server edition">View only in this demo</span>;
  }

  if (openDraft) {
    return (
      <Link href={`/platform/policies/${openDraft.id}/edit`} className={buttonClass(openDraft.id === id ? "primary" : "secondary", "sm")}>
        <PencilLine className="size-3.5" aria-hidden /> {openDraft.status === "draft" ? `Edit v${openDraft.version} draft` : `Review v${openDraft.version}`}
      </Link>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={buttonClass("secondary", "sm")}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          const res = await fetch("/api/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId: id }) });
          const body = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return setError(body.error ?? "Could not create draft");
          router.push(`/platform/policies/${body.id}/edit`);
        }}
      >
        <GitBranchPlus className="size-3.5" aria-hidden /> {busy ? "Creating…" : `Edit — new draft from v${version}`}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
