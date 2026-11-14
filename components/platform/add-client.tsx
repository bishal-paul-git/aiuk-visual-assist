"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";

type Template = "broadband" | "boiler" | "home_damage";
const TEMPLATES: { value: Template; label: string }[] = [
  { value: "broadband", label: "Broadband: internet down / router lights" },
  { value: "boiler", label: "Energy: boiler fault code" },
  { value: "home_damage", label: "Insurance: home damage photos for a claim" },
];

/** Platform → Clients → Add a client: a new client company from a ready template, no code. */
export function AddClient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", template: "broadband" as Template, primaryColor: "#1D5BD8", supportLine: "", evidenceDays: "30", transcriptDays: "90", private: false });
  const [staff, setStaff] = useState([{ name: "", email: "" }, { name: "", email: "" }]);
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});

  async function save() {
    setState({ busy: true });
    const r = await fetch("/api/platform/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, evidenceDays: Number(form.evidenceDays), transcriptDays: Number(form.transcriptDays), staff }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string };
    if (!r.ok || !d.id) return setState({ error: d.error ?? "That didn't save." });
    router.push(`/platform/clients/${d.id}`);
    router.refresh();
  }

  if (!open)
    return (
      <button type="button" data-testid="add-client-open" className={buttonClass("primary", "sm")} onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add a client
      </button>
    );

  const input = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm";
  const label = "mb-1 block text-xs font-medium text-ink";
  return (
    <div data-testid="add-client" className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm">
      <h2 className="text-base font-semibold text-ink">Add a client</h2>
      <p className="mt-1 text-xs text-muted">The client gets its own space: the AI flow and safety rules from the template, a support team, an AI assistant and staff logins. Change anything later.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className={label}>Client name</span>
          <input className={input} data-testid="client-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Broadband" />
        </label>
        <label className="block">
          <span className={label}>What the AI helps with</span>
          <select className={input} data-testid="client-template" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value as Template })}>
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className={label}>Brand colour</span>
            <input className={input} value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
          </label>
          <input type="color" aria-label="Pick colour" value={/^#[0-9a-f]{6}$/i.test(form.primaryColor) ? form.primaryColor : "#1d5bd8"} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="mt-5 h-9 w-10 rounded border border-line" />
        </div>
        <label className="block">
          <span className={label}>Support line (optional)</span>
          <input className={input} value={form.supportLine} onChange={(e) => setForm({ ...form, supportLine: e.target.value })} placeholder="0800 000 0000" />
        </label>
        <label className="block">
          <span className={label}>Keep photos (days)</span>
          <input className={input} inputMode="numeric" value={form.evidenceDays} onChange={(e) => setForm({ ...form, evidenceDays: e.target.value })} />
        </label>
        <label className="block">
          <span className={label}>Keep transcripts (days)</span>
          <input className={input} inputMode="numeric" value={form.transcriptDays} onChange={(e) => setForm({ ...form, transcriptDays: e.target.value })} />
        </label>
      </div>

      <div className="mt-4">
        <span className={label}>Staff logins (the first is the client&apos;s manager, the rest are support agents)</span>
        <div className="space-y-2">
          {staff.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input className={input} aria-label={`Staff ${i + 1} name`} data-testid={`staff-name-${i}`} placeholder={i === 0 ? "Manager's name" : "Agent's name"} value={s.name} onChange={(e) => setStaff(staff.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className={input} aria-label={`Staff ${i + 1} email`} data-testid={`staff-email-${i}`} placeholder="name@company.co.uk" value={s.email} onChange={(e) => setStaff(staff.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
              {staff.length > 1 && (
                <button type="button" aria-label="Remove" className={buttonClass("ghost", "sm")} onClick={() => setStaff(staff.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {staff.length < 20 && (
          <button type="button" className={`${buttonClass("ghost", "sm")} mt-2`} onClick={() => setStaff([...staff, { name: "", email: "" }])}>
            <Plus className="size-4" /> Add another
          </button>
        )}
      </div>

      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={form.private} onChange={(e) => setForm({ ...form, private: e.target.checked })} />
        <span>
          <span className="font-medium text-ink">Real client with real customers.</span>{" "}
          <span className="text-muted">Its staff are hidden from the demo sign-in and need the client password (set on the server). Leave unticked for a demo client.</span>
        </span>
      </label>

      {state.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {state.error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" data-testid="add-client-save" className={buttonClass("primary", "sm")} disabled={state.busy} onClick={() => void save()}>
          {state.busy ? "Adding…" : "Add client"}
        </button>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
