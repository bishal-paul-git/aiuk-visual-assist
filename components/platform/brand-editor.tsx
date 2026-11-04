"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, cx } from "@/components/ui/primitives";

/** Edit how a client appears to its customers. The AI greets customers with this name. */
export function BrandEditor({ tenantId, initial }: { tenantId: string; initial: { displayName: string; primaryColor: string; supportLine?: string; assistantName: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [state, setState] = useState<{ busy?: boolean; error?: string; saved?: boolean }>({});
  const field = (k: keyof typeof form) => ({ value: form[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  async function save() {
    setState({ busy: true });
    const r = await fetch(`/api/platform/clients/${tenantId}/brand`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return setState({ error: d.error ?? "That didn't save." });
    setState({ saved: true });
    setOpen(false);
    router.refresh();
  }

  if (!open)
    return (
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}>
          Edit brand
        </button>
        {state.saved && <span className="text-xs text-ok">Saved. New conversations use it straight away.</span>}
      </div>
    );
  const input = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm";
  return (
    <div className="mt-3 space-y-2.5 border-t border-line pt-3 text-sm" data-testid="brand-editor">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink">Name customers see</span>
        <input className={input} {...field("displayName")} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink">Assistant name</span>
        <input className={input} {...field("assistantName")} />
      </label>
      <div className="flex gap-2">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-ink">Brand colour</span>
          <input className={input} {...field("primaryColor")} placeholder="#1D5BD8" />
        </label>
        <input type="color" aria-label="Pick colour" value={/^#[0-9a-f]{6}$/i.test(form.primaryColor) ? form.primaryColor : "#1d5bd8"} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="mt-5 h-9 w-10 rounded border border-line" />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink">Support line (optional)</span>
        <input className={input} {...field("supportLine")} placeholder="0800 000 0000" />
      </label>
      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className={cx(buttonClass("primary", "sm"))} disabled={state.busy} onClick={() => void save()}>
          {state.busy ? "Saving…" : "Save brand"}
        </button>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
