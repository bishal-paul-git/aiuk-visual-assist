"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Info, KeyRound, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge, Panel, buttonClass, cx } from "@/components/ui/primitives";
import { tenants } from "@/lib/config/catalog";
import { demoUsers } from "@/lib/auth/identity";
import { PERMISSION_LABELS, ROLE_NAMES, isPlatformRole, permissionPhrase, type Permission } from "@/lib/auth/rbac";
import { loadSignInMethods, signInDemo, ssoSignInUrl, useIdentity, type SignInMethods } from "@/lib/client/identity";
import { BASE_PATH, STATIC_DEMO } from "@/lib/paths";

const ROLE_HINT: Record<string, string> = {
  supervisor: "Can run the whole trial: start sessions, join, take over and see results.",
  agent: "Can start sessions, join and take over, and see results.",
  client_admin: "Can see every session and result and change settings, but cannot start or join sessions.",
};

function safeNext(v: string | null): string | undefined {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : undefined;
}

function ClientSignIn() {
  const sp = useSearchParams();
  const router = useRouter();
  const identity = useIdentity();
  const next = safeNext(sp.get("next")) ?? "/client";
  const denied = sp.get("denied") as Permission | null;
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [methods, setMethods] = useState<SignInMethods | undefined>(STATIC_DEMO ? { sso: null, demo: true } : undefined);
  useEffect(() => {
    if (!STATIC_DEMO) void loadSignInMethods().then(setMethods);
  }, []);
  const sso = methods?.sso ?? null;

  async function choose(userId: string) {
    setBusy(userId);
    setError(undefined);
    const r = await signInDemo(userId, next);
    if (!r.ok) {
      setError(r.error);
      setBusy(undefined);
      return;
    }
    if (STATIC_DEMO) router.push(next);
    else window.location.assign(`${BASE_PATH}${next}`);
  }

  // Client organisations only: platform staff sign in to the admin portal.
  const clientUsers = demoUsers().filter((u) => !isPlatformRole(u.role) && u.status === "active");

  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <Link href="/" className="rounded-md">
            <Logo />
          </Link>
          {methods && (sso ? <Badge tone="navy">Single sign-on</Badge> : <Badge tone="warn">Trial sign-in</Badge>)}
        </div>

        <h1 className="mt-8 text-xl font-semibold tracking-tight text-ink">Client portal</h1>
        <p className="mt-1 text-sm text-muted">Try Visual Assist with your own team and see how it works for your customers.</p>

        {denied && PERMISSION_LABELS[denied] && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {identity.status === "signed_in" ? `${identity.user.name} cannot open that page` : "That page needs a different sign-in"}: it needs permission to {permissionPhrase(denied)}.
            </p>
          </div>
        )}

        {sso && (
          <section className="mt-6 rounded-lg border border-line bg-surface p-5" aria-labelledby="csso">
            <h2 id="csso" className="flex items-center gap-2 text-sm font-semibold text-ink">
              <KeyRound className="size-4" aria-hidden /> Your organisation account
            </h2>
            <p className="mt-1 text-xs text-muted">You will be taken to {sso.name} to sign in, then returned here.</p>
            <a href={ssoSignInUrl(next)} className={cx(buttonClass("navy"), "mt-3 h-10 w-full text-sm")} data-testid="sso-sign-in">
              Sign in with {sso.name} <ArrowRight className="size-4" aria-hidden />
            </a>
          </section>
        )}

        {methods?.demo && (
          <>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-xs text-ink-2">
              <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <p>
                Trial sign-in: there are no passwords yet. Pick a person from your organisation. Before a real pilot, your team signs in with your own company account (single sign-on)
                and customers never sign in; they only use their secure link.
              </p>
            </div>
            {error && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="mt-5 space-y-4">
              {tenants.map((t) => {
                const list = clientUsers.filter((u) => u.tenantId === t.id).sort((a, b) => (a.role === "supervisor" ? -1 : b.role === "supervisor" ? 1 : 0));
                if (list.length === 0) return null;
                return (
                  <Panel key={t.id} title={t.name} description={t.brand.displayName} bodyClassName="p-0">
                    <ul className="divide-y divide-line">
                      {list.map((u) => {
                        const current = identity.status === "signed_in" && identity.user.id === u.id;
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => choose(u.id)}
                              disabled={Boolean(busy)}
                              className={cx("flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2 disabled:opacity-60", current && "bg-brand-soft/40")}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-ink">
                                  {u.name} <span className="text-xs font-normal text-muted">· {ROLE_NAMES[u.role]}</span>
                                  {current && <span className="text-xs font-normal text-muted"> · signed in</span>}
                                </span>
                                <span className="block text-xs text-muted">{ROLE_HINT[u.role]}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
                                {busy === u.id ? "Signing in…" : "Continue"} <ArrowRight className="size-3.5" aria-hidden />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                );
              })}
            </div>
          </>
        )}

        {methods && !sso && !methods.demo && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-ink" role="alert">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <p>Sign-in is unavailable. Contact your administrator.</p>
          </div>
        )}

        <p className="mt-8 text-xs text-muted">
          Absolute Intelligence staff sign in to the{" "}
          <Link href="/sign-in" className="font-medium text-brand hover:underline">
            admin portal
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

export function ClientSignInPage() {
  return (
    <Suspense>
      <ClientSignIn />
    </Suspense>
  );
}
