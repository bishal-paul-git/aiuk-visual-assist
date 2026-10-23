import type { ReactNode } from "react";
import { Building2, FlaskConical, Globe2 } from "lucide-react";
import { Sidebar } from "@/components/platform/sidebar";
import { MobileNav } from "@/components/platform/mobile-nav";
import { NAV } from "@/components/platform/nav";
import { TestSessionLauncher } from "@/components/shared/test-session-launcher";
import { IdentityMenu } from "@/components/auth/identity-menu";
import { can } from "@/lib/auth/rbac";
import { scopeFor, scopeLabel } from "@/lib/auth/scope";
import { currentUser } from "@/lib/server/auth";
import { STATIC_EXPORT } from "@/lib/server/platform-data";
import { StaticRoleGate } from "@/components/platform/static-role-gate";
import { environmentInfo } from "@/lib/server/environment";

/**
 * Header and navigation for the management platform. Server edition: the
 * scope chip, sidebar and launcher reflect the signed-in user (each page
 * still authorises and scopes its own data). Static demo: no server identity,
 * so the all-clients view with every module.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const user = STATIC_EXPORT ? null : await currentUser();
  const scope = scopeFor(user);
  const clientScoped = scope.tenantId !== undefined;
  const allowed = user ? NAV.flatMap((g) => g.items).filter((i) => can(user, "platform.access") && can(user, i.permission)).map((i) => i.href) : undefined;
  const canLaunch = !user || can(user, "session.create");
  const envInfo = environmentInfo();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
        <Sidebar allowed={allowed} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden text-[13px] font-semibold text-ink sm:inline">AIUK Management Platform</span>
            <span
              data-testid="platform-scope"
              className={
                clientScoped
                  ? "inline-flex min-w-0 items-center gap-1 truncate rounded-md bg-navy px-2 py-0.5 text-[11px] font-medium text-white"
                  : "inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink"
              }
              title={clientScoped ? "You are viewing your organisation's data only." : "Data from every client organisation."}
            >
              {clientScoped ? <Building2 className="size-3 shrink-0" aria-hidden /> : <Globe2 className="size-3 shrink-0" aria-hidden />}
              <span className="sr-only">Viewing: </span>
              {scopeLabel(scope)}
            </span>
            <span
              className="hidden items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2 md:inline-flex"
              title={envInfo.title}
            >
              <FlaskConical className="size-3" aria-hidden /> {envInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {canLaunch && <TestSessionLauncher />}
            <IdentityMenu />
          </div>
        </header>
        <MobileNav allowed={allowed} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <StaticRoleGate>{children}</StaticRoleGate>
        </main>
      </div>
    </div>
  );
}
