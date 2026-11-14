"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { buttonClass, cx } from "@/components/ui/primitives";
import { signInClientStaff } from "@/lib/client/identity";
import { BASE_PATH, STATIC_DEMO } from "@/lib/paths";

/** Sign-in for the staff of a live client (real customer data): work email + the client's password. */
export function ClientStaffSignIn({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  if (STATIC_DEMO) return null;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-5 py-3 text-left hover:bg-surface-2" data-testid="client-staff-open">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-navy text-white" aria-hidden>
          <Building2 className="size-4" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink">Client staff sign-in</span>
          <span className="block text-xs text-muted">Support teams working with real customers: sign in with your work email.</span>
        </span>
      </button>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const r = await signInClientStaff(email, password, next);
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
      return;
    }
    window.location.assign(`${BASE_PATH}${r.next}`);
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-surface p-5" aria-labelledby="client-staff-title" data-testid="client-staff-sign-in">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-navy text-white" aria-hidden>
          <Building2 className="size-4" />
        </span>
        <div>
          <h2 id="client-staff-title" className="text-sm font-semibold text-ink">
            Client staff sign-in
          </h2>
          <p className="mt-0.5 text-xs text-muted">For support teams using Visual Assist with real customers. Use the email and password your manager gave you.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink">Your work email address</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm"
            data-testid="client-staff-email"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink">Client staff password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm"
            data-testid="client-staff-password"
          />
        </label>
      </div>
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={cx(buttonClass("navy"), "mt-4 h-10 w-full text-sm sm:w-auto sm:px-6")} data-testid="client-staff-submit">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
