"use client";

import Link from "next/link";
import { Eye, Lock, UserCheck } from "lucide-react";
import type { User } from "@/lib/domain/types";
import { can, ROLE_NAMES } from "@/lib/auth/rbac";
import { users } from "@/lib/config/catalog";
import { setDemoIdentity, useIdentity } from "@/lib/client/identity";
import { STATIC_DEMO } from "@/lib/client/transport";
import { buttonClass, cx } from "@/components/ui/primitives";

/**
 * What the signed-in user may do in one session's console. The server (or the
 * browser runtime) still refuses anything outside these; this only decides
 * which controls to offer, so nobody is shown a button that will be refused.
 */
export interface ConsoleAccess {
  known: boolean;
  user?: Pick<User, "id" | "name" | "role" | "tenantId" | "status">;
  view: boolean;
  join: boolean;
  takeOver: boolean;
  end: boolean;
  act: boolean;
  /** Any of the operating permissions. */
  operate: boolean;
  /** Demo identities only: someone in this client who can operate the session. */
  switchTo?: User;
  demo: boolean;
}

export function useConsoleAccess(tenantId: string): ConsoleAccess {
  const id = useIdentity();
  if (id.status !== "signed_in") {
    return { known: id.status === "signed_out", view: false, join: false, takeOver: false, end: false, act: false, operate: false, demo: false };
  }
  const u = { ...id.user, status: "active" as const };
  const res = { tenantId };
  const join = can(u, "session.join", res);
  const takeOver = can(u, "session.take_over", res);
  const end = can(u, "session.end", res);
  const act = can(u, "action.run", res);
  const switchTo = id.demo ? operatorFor(tenantId) : undefined;
  return { known: true, user: u, view: can(u, "session.view", res), join, takeOver, end, act, operate: join || takeOver || end || act, switchTo, demo: id.demo };
}

/** An active agent (or failing that a supervisor) in the client that owns the session. */
function operatorFor(tenantId: string): User | undefined {
  const active = users.filter((u) => u.tenantId === tenantId && u.status === "active");
  return active.find((u) => u.role === "agent") ?? active.find((u) => u.role === "supervisor");
}

function SwitchButton({ to, className }: { to: User; className?: string }) {
  return (
    <button
      type="button"
      className={cx(buttonClass("primary", "sm"), className)}
      onClick={() => setDemoIdentity(to.id)}
    >
      <UserCheck className="size-4" aria-hidden /> Switch to {to.name} ({ROLE_NAMES[to.role]})
    </button>
  );
}

/** Shown instead of the operating controls to roles that may only watch. */
export function ViewOnlyNotice({ access }: { access: ConsoleAccess }) {
  if (!access.user) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5 text-[13px]">
      <div className="flex min-w-0 items-start gap-2">
        <Eye className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
        <p className="min-w-0 text-ink">
          <span className="font-semibold">Viewing only.</span> You&apos;re signed in as {access.user.name}, {ROLE_NAMES[access.user.role]}. Only agents and supervisors
          can join, take over or end a session.
        </p>
      </div>
      {access.switchTo && STATIC_DEMO && <SwitchButton to={access.switchTo} />}
    </div>
  );
}

/** Shown instead of a session that belongs to another client. */
export function OtherClientNotice({ access }: { access: ConsoleAccess }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <Lock className="mx-auto size-8 text-muted" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-ink">This session belongs to another client</h1>
      <p className="mt-1.5 text-sm text-ink-2">
        {access.user ? `${access.user.name} (${ROLE_NAMES[access.user.role]}) can only see their own organisation's sessions.` : "Sign in to see this session."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/console" className={buttonClass("secondary", "sm")}>
          Back to queue
        </Link>
        {access.switchTo && STATIC_DEMO && <SwitchButton to={access.switchTo} />}
      </div>
    </div>
  );
}
