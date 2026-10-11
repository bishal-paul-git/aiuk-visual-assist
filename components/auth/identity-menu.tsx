"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { tenantName } from "@/lib/config/catalog";
import { ROLES, ROLE_NAMES } from "@/lib/auth/rbac";
import { demoUsers } from "@/lib/auth/identity";
import { setDemoIdentity, signOut, useIdentity } from "@/lib/client/identity";
import { BASE_PATH, STATIC_DEMO } from "@/lib/paths";
import { cx } from "@/components/ui/primitives";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
}

/**
 * Signed-in user in the platform and console headers. Server edition: name,
 * role, organisation and sign-out. Static demo: a demo identity switcher, so
 * the demo can be explored as each role without signing in.
 */
export function IdentityMenu({ variant = "light" }: { variant?: "light" | "navy" }) {
  const identity = useIdentity();
  const navy = variant === "navy";

  if (identity.status === "loading") {
    return <span className={cx("h-8 w-36 animate-pulse rounded-md", navy ? "bg-white/10" : "bg-surface-2")} aria-label="Loading user" />;
  }
  if (identity.status === "signed_out") {
    return (
      <Link
        href="/sign-in"
        className={cx(
          "inline-flex h-8 items-center rounded-md px-3 text-xs font-medium",
          navy ? "border border-white/20 text-white hover:bg-white/10" : "border border-line text-ink hover:bg-surface-2",
        )}
      >
        Sign in
      </Link>
    );
  }

  const { user } = identity;
  const avatar = (
    <span
      className={cx("flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white", navy ? "bg-violet" : "bg-navy")}
      aria-hidden
    >
      {initials(user.name)}
    </span>
  );

  if (STATIC_DEMO) {
    const options = demoUsers();
    return (
      <label className="flex items-center gap-2 text-xs">
        <span className="hidden sm:flex">{avatar}</span>
        <span className="sr-only">Demo identity</span>
        <select
          value={user.id}
          onChange={(e) => setDemoIdentity(e.target.value)}
          title="Demo identity: switch role to see what each role can do"
          className={cx(
            "h-8 max-w-40 rounded-md border px-2 text-xs sm:max-w-none",
            navy ? "border-white/20 bg-navy-2 text-white" : "border-line bg-surface text-ink",
          )}
        >
          {ROLES.map((role) => {
            const list = options.filter((u) => u.role === role);
            if (list.length === 0) return null;
            return (
              <optgroup key={role} label={ROLE_NAMES[role]}>
                {list.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {ROLE_NAMES[u.role]} · {tenantName(u.tenantId)}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <span className={cx("hidden text-[11px] lg:inline", navy ? "text-white/60" : "text-muted")}>Demo identity</span>
      </label>
    );
  }

  return <SignedInMenu user={user} avatar={avatar} navy={navy} />;
}

function SignedInMenu({
  user,
  avatar,
  navy,
}: {
  user: { name: string; email: string; role: keyof typeof ROLE_NAMES; tenantId: string };
  avatar: ReactNode;
  navy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function doSignOut() {
    setBusy(true);
    await signOut();
    window.location.assign(`${BASE_PATH}/sign-in`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cx("flex items-center gap-2 rounded-md px-1.5 py-1 text-left", navy ? "hover:bg-white/10" : "hover:bg-surface-2")}
      >
        {avatar}
        <span className="hidden text-xs leading-tight sm:block">
          <span className={cx("block font-medium", navy ? "text-white" : "text-ink")}>{user.name}</span>
          <span className={cx("block", navy ? "text-white/70" : "text-muted")}>{ROLE_NAMES[user.role]}</span>
        </span>
        <ChevronDown className={cx("size-3.5", navy ? "text-white/70" : "text-muted")} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-line bg-surface p-1 text-ink shadow-lg">
          <div className="border-b border-line px-3 py-2 text-xs">
            <div className="font-medium">{user.name}</div>
            <div className="truncate text-muted">{user.email}</div>
            <div className="mt-1.5 flex items-center gap-1 text-ink-2">
              <ShieldCheck className="size-3.5" aria-hidden /> {ROLE_NAMES[user.role]} · {tenantName(user.tenantId)}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={doSignOut}
            disabled={busy}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-surface-2 disabled:opacity-60"
          >
            <LogOut className="size-3.5" aria-hidden /> {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
