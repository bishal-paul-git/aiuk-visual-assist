"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranchPlus, PencilLine } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { STATIC_DEMO } from "@/lib/client/transport";

export function WorkflowVersionActions({
  id,
  status,
  version,
  openDraft,
}: {
  id: string;
  status: string;
  version: number;
  openDraft?: { id: string; version: number; status: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (STATIC_DEMO) {
    return <span className="text-[11px] text-muted">Versioning needs the server edition — read-only in this static demo</span>;
  }

  if (status === "draft" || status === "in_review") {
    return (
      <Link href={`/platform/workflows/${id}/edit`} className={buttonClass("primary", "sm")}>
        <PencilLine className="size-3.5" aria-hidden /> {status === "draft" ? "Edit draft" : "Review & publish"}
      </Link>
    );
  }
  if (openDraft) {
    return (
      <Link href={`/platform/workflows/${openDraft.id}/edit`} className={buttonClass("secondary", "sm")}>
        <PencilLine className="size-3.5" aria-hidden /> Open v{openDraft.version} ({openDraft.status === "draft" ? "draft" : "in review"})
      </Link>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={buttonClass("primary", "sm")}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          const res = await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId: id }) });
          const body = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return setError(body.error ?? "Could not create draft");
          router.push(`/platform/workflows/${body.id}/edit`);
        }}
      >
        <GitBranchPlus className="size-3.5" aria-hidden /> {busy ? "Creating…" : `New draft from v${version}`}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
