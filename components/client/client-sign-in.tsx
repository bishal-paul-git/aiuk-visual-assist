"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClass, cx } from "@/components/ui/primitives";
import { tenants } from "@/lib/config/catalog";
import { demoUsers } from "@/lib/auth/identity";
import { ROLE_NAMES, isPlatformRole, needsStaffPassword, permissionPhrase, PERMISSION_LABELS, type Permission } from "@/lib/auth/rbac";

const ROLE_HINT: Partial<Record<string, string>> = {
  agent: "Support agent: answers customers",
  supervisor: "Supervisor: watches the team and can answer customers",
  client_admin: "Client admin: settings",
};
import { DEFAULT_TRIAL_EMAIL, DEFAULT_TRIAL_PASSWORD, TRIAL_USER_ID } from "@/lib/auth/trial";
import { setDemoIdentity, signInDemo, ssoSignInUrl, useIdentity, type SignInMethods } from "@/lib/client/identity";
import { BASE_PATH, STATIC_DEMO } from "@/lib/paths";

function safeNext(v: string | null): string | undefined {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : undefined;
}

export interface TrialPrefill {
  email: string;
  password: string;
}

function ClientSignIn({ prefill, methods: initial }: { prefill?: TrialPrefill; methods: SignInMethods }) {
  const sp = useSearchParams();
  const router = useRouter();
  const identity = useIdentity();
  const next = safeNext(sp.get("next")) ?? "/client";
  const denied = sp.get("denied") as Permission | null;
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [password, setPassword] = useState(prefill?.password ?? "");
  const [staffPassword, setStaffPassword] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const methods = initial;
  const sso = methods?.sso ?? null;
  const showTrial = Boolean(methods?.demo);

  function go(to: string) {
    // Full navigation in the server edition so server-rendered pages see the new session.
    if (STATIC_DEMO) router.push(to);
    else window.location.assign(`${BASE_PATH}${to}`);
  }

  async function logIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy("trial");
    setError(undefined);
    if (STATIC_DEMO) {
      // The online demo has no server: the same login, checked in the browser.
      if (email.trim().toLowerCase() !== DEFAULT_TRIAL_EMAIL || password !== DEFAULT_TRIAL_PASSWORD) {
        setError("That email or password isn't right.");
        setBusy(undefined);
        return;
      }
      setDemoIdentity(TRIAL_USER_ID);
      return go(next);
    }
    try {
      const r = await fetch(`${BASE_PATH}/api/auth/trial`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, next }) });
      const d = (await r.json().catch(() => ({}))) as { next?: string; error?: string };
      if (!r.ok) {
        setError(d.error ?? "Could not log in. Please try again.");
        setBusy(undefined);
        return;
      }
      go(d.next ?? next);
    } catch {
      setError("Could not reach the server. Please try again.");
      setBusy(undefined);
    }
  }

  async function chooseOther(userId: string) {
    setBusy(userId);
    setError(undefined);
    const r = await signInDemo(userId, next, staffPassword);
    if (!r.ok) {
      setError(r.error);
      setBusy(undefined);
      return;
    }
    go(next);
  }

  const others = demoUsers().filter((u) => !isPlatformRole(u.role) && u.status === "active" && u.id !== TRIAL_USER_ID);

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" className="rounded-md">
          <Logo />
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-5 pb-12 lg:grid-cols-2">
        <section className="lg:pr-6">
          <p className="text-xs font-semibold tracking-[0.12em] text-brand uppercase">Your trial is ready</p>
          <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight text-ink sm:text-[34px]">Try Visual Assist for yourself</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">In about ten minutes you&apos;ll play both sides of a support call:</p>
          <ul className="mt-4 space-y-3 text-[14px] text-ink-2">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-ok" aria-hidden />
              <span>
                <strong className="text-ink">The customer</strong>, on your phone: show a problem to the camera and talk or type to the AI.
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-ok" aria-hidden />
              <span>
                <strong className="text-ink">The support agent</strong>, on your laptop: watch it live, then take over and help.
              </span>
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-7" aria-labelledby="login-title">
          {denied && PERMISSION_LABELS[denied] && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm text-danger" role="alert">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>That page needs permission to {permissionPhrase(denied)}. Log in with a different account.</p>
            </div>
          )}

          {sso && (
            <div className="mb-5">
              <h2 id="login-title" className="text-lg font-semibold text-ink">
                Log in
              </h2>
              <a href={ssoSignInUrl(next)} className={cx(buttonClass("navy"), "mt-3 h-11 w-full text-sm")} data-testid="sso-sign-in">
                <KeyRound className="size-4" aria-hidden /> Continue with {sso.name}
              </a>
            </div>
          )}

          {showTrial && (
            <form onSubmit={logIn} noValidate>
              {!sso && (
                <h2 id="login-title" className="text-lg font-semibold text-ink">
                  Log in to your trial
                </h2>
              )}
              {prefill && <p className="mt-1 text-sm text-muted">We&apos;ve filled in your details. Just click Log in.</p>}
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-ink">Email</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-[15px]"
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-ink">Password</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-[15px]"
                />
              </label>
              {error && (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" disabled={Boolean(busy)} className={cx(buttonClass("primary"), "mt-5 h-11 w-full text-[15px]")}>
                {busy === "trial" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {busy === "trial" ? "Logging in…" : "Log in"}
              </button>
              <p className="mt-3 text-xs text-muted">This is a trial account. It can start and watch sessions, but it can&apos;t change any settings.</p>
            </form>
          )}

          {!sso && !methods.demo && (
            <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-ink" role="alert">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <p>Log in is unavailable. Please contact your administrator.</p>
            </div>
          )}

          {showTrial && (
            <details className="mt-5 border-t border-line pt-4 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-ink-2 select-none">Log in as someone else from your team</summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-ink-2">One click, no password. Each person shows what that role sees.</p>
                {methods.staffPassword && others.some((u) => needsStaffPassword(u.role)) && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-ink">Staff password (admins only)</span>
                    <input type="password" autoComplete="off" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} className="h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm" />
                  </label>
                )}
                {tenants.map((t) => {
                  const list = others.filter((u) => u.tenantId === t.id);
                  if (list.length === 0) return null;
                  return (
                    <div key={t.id}>
                      <p className="text-xs font-semibold text-ink">{t.name}</p>
                      <ul className="mt-1 divide-y divide-line rounded-md border border-line">
                        {list.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              disabled={Boolean(busy)}
                              onClick={() => chooseOther(u.id)}
                              className={cx("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-surface-2 disabled:opacity-60", identity.status === "signed_in" && identity.user.id === u.id && "bg-brand-soft/40")}
                            >
                              <span>
                                {u.name} <span className="text-muted">· {ROLE_HINT[u.role] ?? ROLE_NAMES[u.role]}</span>
                                {methods.staffPassword && needsStaffPassword(u.role) && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] font-semibold text-ink-2">Admin · password</span>}
                              </span>
                              <span className="flex items-center gap-1 font-medium text-brand">
                                {busy === u.id ? "Signing in…" : "Continue"} <ArrowRight className="size-3" aria-hidden />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </section>
      </div>
    </main>
  );
}

export function ClientSignInPage({ prefill, methods }: { prefill?: TrialPrefill; methods: SignInMethods }) {
  return (
    <Suspense>
      <ClientSignIn prefill={prefill} methods={methods} />
    </Suspense>
  );
}
