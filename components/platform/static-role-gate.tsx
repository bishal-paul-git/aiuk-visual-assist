"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Info, Lock, UserCheck } from "lucide-react";
import { can, ROLE_NAMES, tenantScope } from "@/lib/auth/rbac";
import { tenants } from "@/lib/config/catalog";
import { setDemoIdentity, useIdentity } from "@/lib/client/identity";
import { STATIC_DEMO } from "@/lib/client/transport";
import { buttonClass } from "@/components/ui/primitives";

const PLATFORM_ADMIN_ID = "usr_james";

/**
 * Static demo only. The server edition authorises and scopes every platform
 * page itself; the static demo's pages are a build-time, all-clients snapshot,
 * so the browser applies the role rules here: roles without platform access
 * are sent to the console, and client roles are told the sample covers every
 * client.
 */
export function StaticRoleGate({ children }: { children: ReactNode }) {
  const id = useIdentity();
  if (!STATIC_DEMO || id.status !== "signed_in") return <>{children}</>;
  const user = { ...id.user, status: "active" as const };

  if (!can(user, "platform.access")) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Lock className="mx-auto size-8 text-muted" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-ink">The platform is for administrators</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          You&apos;re signed in as {user.name}, {ROLE_NAMES[user.role]}. {ROLE_NAMES[user.role]}s work in the Agent Console.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/console" className={buttonClass("primary", "sm")}>
            Open the Agent Console
          </Link>
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setDemoIdentity(PLATFORM_ADMIN_ID)}>
            <UserCheck className="size-4" aria-hidden /> Switch to Platform administrator
          </button>
        </div>
      </div>
    );
  }

  const own = tenantScope(user);
  if (!own) return <>{children}</>;
  const name = tenants.find((t) => t.id === own)?.name ?? "their own organisation";
  return (
    <>
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5 text-[13px] text-ink">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
        <p className="min-w-0">
          This online demo shows sample data from every client. In the full version {user.name} sees {name} only, and can edit and publish its workflows and policies.
        </p>
      </div>
      {children}
    </>
  );
}
