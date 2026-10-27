import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, FlaskConical, Home, History, Info, Plug, Radio, Settings } from "lucide-react";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { WaitingAlert } from "@/components/console/waiting-alert";
import { IdentityMenu } from "@/components/auth/identity-menu";
import { cx } from "@/components/ui/primitives";
import { tenants } from "@/lib/config/catalog";
import type { ClientScope } from "@/lib/server/client-data";
import { DEFAULT_CLIENT } from "@/lib/server/client-data";
import { STATIC_EXPORT } from "@/lib/server/platform-data";
import { ROLE_NAMES } from "@/lib/auth/rbac";

export type PortalPage = "home" | "sessions" | "results" | "systems";

const NAV: { id: PortalPage; href: string; label: string; icon: typeof Home }[] = [
  { id: "home", href: "/client", label: "Try it", icon: Home },
  { id: "sessions", href: "/client/sessions", label: "Sessions", icon: History },
  { id: "results", href: "/client/results", label: "Results", icon: BarChart3 },
  { id: "systems", href: "/client/systems", label: "Systems", icon: Plug },
];

/** A link inside the portal. Platform staff previewing another client keep that client as they move around. */
export function portalHref(scope: ClientScope, path: string): string {
  return scope.previewing && scope.tenant.id !== DEFAULT_CLIENT ? `${path}?org=${scope.tenant.id}` : path;
}

/**
 * The client portal frame: the client's own name and colour, a short menu, and
 * links out to the agent console and (for people who may use it) the admin
 * portal. Used by every client page so each page authorises its own data.
 */
export function PortalShell({ scope, active, children }: { scope: ClientScope; active: PortalPage; children: ReactNode }) {
  const { tenant, user } = scope;
  const link = (path: string) => portalHref(scope, path);
  const canOperate = scope.allows("session.join");
  const canAdmin = scope.allows("platform.access");
  const switcher = scope.previewing ? tenants.filter((t) => t.status !== "suspended") : [];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={link("/client")} className="shrink-0 rounded-md">
              <Logo />
            </Link>
            <span
              className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink"
              data-testid="client-name"
              title={`You are viewing ${tenant.name}`}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tenant.brand.primaryColor }} aria-hidden />
              <span className="truncate">{tenant.name}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canOperate && (
              <Suspense>
                <WaitingAlert />
              </Suspense>
            )}
            {canOperate && (
              <Link href="/console" className="hidden h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-ink hover:bg-surface-2 sm:inline-flex">
                <Radio className="size-3.5" aria-hidden /> Live queue
              </Link>
            )}
            {canAdmin && (
              <Link href="/platform" className="hidden h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-ink hover:bg-surface-2 sm:inline-flex">
                <Settings className="size-3.5" aria-hidden /> {scope.previewing ? "Admin portal" : "Admin tools"}
              </Link>
            )}
            <IdentityMenu />
          </div>
        </div>
        <nav aria-label="Client portal" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-1.5 text-[13px] sm:px-4">
          {NAV.filter((n) => n.id !== "systems" || scope.allows("settings.view")).map((n) => (
            <Link
              key={n.id}
              href={link(n.href)}
              aria-current={active === n.id ? "page" : undefined}
              className={cx(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 font-medium",
                active === n.id ? "bg-navy text-white" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              <n.icon className="size-3.5" aria-hidden /> {n.label}
            </Link>
          ))}
          {canOperate && (
            <Link href="/console" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 font-medium text-ink-2 hover:bg-surface-2 sm:hidden">
              <Radio className="size-3.5" aria-hidden /> Live queue
            </Link>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-5 sm:px-5 sm:py-6">
        {scope.previewing && user && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5 text-[13px] text-ink" data-testid="portal-preview">
            <Info className="size-4 shrink-0 text-brand-ink" aria-hidden />
            <p className="min-w-0 flex-1">
              Admin preview: this is what {tenant.name}&apos;s own team sees. You are signed in as {user.name} ({ROLE_NAMES[user.role]}).
            </p>
            <span className="flex flex-wrap gap-1">
              {switcher.map((t) => (
                <Link
                  key={t.id}
                  href={t.id === DEFAULT_CLIENT ? `/client` : `/client?org=${t.id}`}
                  className={cx("rounded-md border px-2 py-0.5 text-xs", t.id === tenant.id ? "border-brand bg-surface font-semibold" : "border-line bg-surface hover:bg-surface-2")}
                >
                  {t.name}
                </Link>
              ))}
            </span>
          </div>
        )}
        {STATIC_EXPORT && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] text-ink-2">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <p className="min-w-0">
              Online demo: the AI is scripted and the lists below show sample sessions. Sessions you start here run in this browser and appear in the Live queue.
              The full version runs real AI and shows only your own sessions.
            </p>
          </div>
        )}
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span>Visual Assist · Absolute Intelligence UK</span>
          <span>Please test with test customers, not real customer data, until your pilot is agreed.</span>
        </div>
      </footer>
    </div>
  );
}
