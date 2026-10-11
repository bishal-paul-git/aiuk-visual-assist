"use client";

import { UserRound } from "lucide-react";
import { ROLE_LABELS } from "./config-data";

export interface AdminOption {
  id: string;
  name: string;
  role: string;
}

/** Default identity: anyone but the submitter, so a version in review opens ready for a second approver. */
export function defaultAdmin(admins: AdminOption[], submittedById?: string): string {
  return (admins.find((a) => a.id !== submittedById) ?? admins[0])?.id ?? "";
}

/**
 * Who a configuration change is made as. With sign-in this is always the
 * signed-in administrator (the server ignores any identity in the request);
 * the list only has more than one entry in tests and previews.
 */
export function ActingAdminSelect({
  admins,
  value,
  onChange,
  disabled,
}: {
  admins: AdminOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  if (admins.length <= 1) {
    const a = admins[0];
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <UserRound className="size-3.5 shrink-0" aria-hidden />
        {a ? (
          <span>
            Signed in as <span className="font-medium text-ink">{a.name}</span> · {ROLE_LABELS[a.role] ?? a.role}
          </span>
        ) : (
          <span>You don&apos;t have permission to change this configuration.</span>
        )}
      </p>
    );
  }
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <UserRound className="size-3.5 shrink-0" aria-hidden />
      <span className="shrink-0">Acting as</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 py-1 text-[12px] text-ink"
      >
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {ROLE_LABELS[a.role] ?? a.role}
          </option>
        ))}
      </select>
    </label>
  );
}
