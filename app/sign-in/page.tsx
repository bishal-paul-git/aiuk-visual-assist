"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Info, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge, Panel, buttonClass, cx } from "@/components/ui/primitives";
import { tenantName } from "@/lib/config/catalog";
import { demoUsers } from "@/lib/auth/identity";
import { PERMISSION_LABELS, ROLES, ROLE_NAMES, ROLE_PERMISSIONS, homePathFor, isPlatformRole, permissionPhrase, type Permission } from "@/lib/auth/rbac";
import { loadSignInMethods, signInDemo, ssoSignInUrl, useIdentity, type SignInMethods } from "@/lib/client/identity";
import { BASE_PATH, STATIC_DEMO } from "@/lib/paths";

const ROLE_SUMMARY: Record<(typeof ROLES)[number], string> = {
  aiuk_admin: "Every client. Configuration, audit and settings; views sessions but does not operate them.",
  qa_reviewer: "Every client, read-only: sessions, workflows, policies and audit.",
  client_admin: "Own organisation only. Workflows, policies, settings and audit; views live sessions.",
  supervisor: "Own organisation only. Operates sessions, reads audit and configuration.",
  agent: "Own organisation only. Joins, takes over and resolves customer sessions.",
};

/** Messages for the stable error codes /api/auth/callback returns (SignInErrorCode). */
const SIGN_IN_ERRORS: Record<string, string> = {
  expired: "Your sign-in attempt expired or was started in another browser. Please sign in again.",
  invalid_request: "The response from your organisation's sign-in was not valid. Please sign in again.",
  idp_error: "Sign-in was cancelled or refused by your organisation. Try again, or contact your administrator.",
  idp_unavailable: "We could not reach your organisation's sign-in service. Please try again shortly.",
  token_invalid: "We could not verify the response from your organisation's sign-in. Try again; if this continues, contact your administrator.",
  mfa_required: "Your organisation requires multi-factor authentication. Sign in again and complete the additional verification step.",
  no_role:
    "You signed in, but your account has not been given a Visual Assist role. Ask your administrator to assign one (agent, supervisor, client administrator, QA reviewer or platform administrator).",
  no_tenant: "You signed in, but your account is not linked to a client organisation in Visual Assist. Ask your administrator to assign your organisation.",
  inactive: "Your Visual Assist account is not active. Contact your administrator.",
};

function safeNext(v: string | null): string | undefined {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : undefined;
}

function SignIn() {
  const sp = useSearchParams();
  const router = useRouter();
  const identity = useIdentity();
  const next = safeNext(sp.get("next"));
  const denied = sp.get("denied") as Permission | null;
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const errorCode = sp.get("error");
  const signInError = errorCode ? (SIGN_IN_ERRORS[errorCode] ?? "Sign-in failed. Please try again.") : undefined;
  const signedOut = sp.get("signed_out") === "1";
  // The static demo only ever has demo identities; the server edition asks which methods are enabled.
  const [methods, setMethods] = useState<SignInMethods | undefined>(STATIC_DEMO ? { sso: null, demo: true } : undefined);
  useEffect(() => {
    if (!STATIC_DEMO) void loadSignInMethods().then(setMethods);
  }, []);
  const sso = methods?.sso ?? null;
  const showDemo = Boolean(methods?.demo);

  async function choose(userId: string, role: (typeof ROLES)[number]) {
    setBusy(userId);
    setError(undefined);
    const r = await signInDemo(userId, next);
    if (!r.ok) {
      setError(r.error);
      setBusy(undefined);
      return;
    }
    const target = next ?? homePathFor({ role });
    // Full navigation in the server edition so server-rendered pages see the new session.
    if (STATIC_DEMO) router.push(target);
    else window.location.assign(`${BASE_PATH}${target}`);
  }

  const users = demoUsers();

  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <Link href="/" className="rounded-md">
            <Logo />
          </Link>
          {methods && (sso ? <Badge tone="navy">Single sign-on</Badge> : <Badge tone="warn">Demo sign-in</Badge>)}
        </div>

        <h1 className="mt-8 text-xl font-semibold tracking-tight text-ink">Sign in to Visual Assist</h1>
        <p className="mt-1 text-xs text-muted">
          Working for a client organisation?{" "}
          <Link href="/client/sign-in" className="font-medium text-brand hover:underline">
            Use the client portal
          </Link>
          .
        </p>
        <p className="mt-1 text-sm text-muted">
          {sso
            ? "Use your organisation account. What you can see and do depends on the role and organisation your administrator assigns."
            : "Choose a demo user. What you can see and do depends on the role and organisation."}
        </p>

        {signedOut && !signInError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-ok/25 bg-ok-soft px-4 py-3 text-sm text-ink" role="status">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <p>You have signed out of Visual Assist.</p>
          </div>
        )}

        {signInError && (
          <div
            className="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
            role="alert"
            data-testid="sign-in-error"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{signInError}</p>
          </div>
        )}

        {denied && PERMISSION_LABELS[denied] && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              {identity.status === "signed_in" ? (
                <>
                  {identity.user.name} ({ROLE_NAMES[identity.user.role]}) cannot open that page: it needs permission to {permissionPhrase(denied)}. Sign in as a
                  different user to continue.
                </>
              ) : (
                <>That page needs permission to {permissionPhrase(denied)}.</>
              )}
            </div>
          </div>
        )}

        {sso && (
          <section className="mt-6 rounded-lg border border-line bg-surface" aria-labelledby="sso-title">
            <div className="flex items-start gap-3 border-b border-line px-5 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-navy text-white" aria-hidden>
                <KeyRound className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 id="sso-title" className="text-sm font-semibold text-ink">
                  Organisation account
                </h2>
                <p className="mt-0.5 text-xs text-muted">You will be taken to {sso.name} to sign in, then returned here.</p>
              </div>
            </div>
            <div className="px-5 py-4">
              <a href={ssoSignInUrl(next)} className={cx(buttonClass("navy"), "h-10 w-full text-sm")} data-testid="sso-sign-in">
                Sign in with {sso.name} <ArrowRight className="size-4" aria-hidden />
              </a>
              <ul className="mt-4 grid gap-1.5 text-xs text-ink-2 sm:grid-cols-2">
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 shrink-0 text-brand" aria-hidden />
                  {sso.mfa ? "Multi-factor authentication required" : "Multi-factor authentication by your organisation"}
                </li>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 shrink-0 text-brand" aria-hidden />
                  Role and organisation assigned by your administrator
                </li>
              </ul>
            </div>
          </section>
        )}

        {methods && !sso && !methods.demo && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-ink" role="alert">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <p>Sign-in is unavailable: the server could not load its sign-in configuration. Contact your administrator.</p>
          </div>
        )}

        {showDemo && (
          <>
            {sso && <h2 className="mt-10 text-sm font-semibold text-ink">Demo identities</h2>}
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-xs text-ink-2">
              <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <p>
                This is a demonstration: there are no passwords.{" "}
                {STATIC_DEMO
                  ? "In this browser-only demo your choice is kept on this device; you can also switch identity from the header."
                  : "Your session is kept in a signed, HttpOnly cookie for 8 hours."}{" "}
                Production deployments sign agents and administrators in through the organisation&apos;s single sign-on (Microsoft Entra ID, Okta or Auth0) with
                multi-factor authentication. Customers never sign in; they use their secure session link.
              </p>
            </div>

            {error && (
              <p className="mt-4 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="mt-6 space-y-4">
              {ROLES.map((role) => {
                const list = users.filter((u) => u.role === role);
                if (list.length === 0) return null;
                return (
                  <Panel
                    key={role}
                    title={ROLE_NAMES[role]}
                    description={ROLE_SUMMARY[role]}
                    actions={<Badge tone={isPlatformRole(role) ? "navy" : "neutral"}>{isPlatformRole(role) ? "All clients" : "Single client"}</Badge>}
                    bodyClassName="p-0"
                  >
                    <ul className="divide-y divide-line">
                      {list.map((u) => {
                        const current = identity.status === "signed_in" && identity.user.id === u.id;
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => choose(u.id, u.role)}
                              disabled={Boolean(busy)}
                              className={cx(
                                "flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2 disabled:opacity-60",
                                current && "bg-brand-soft/40",
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-ink">
                                  {u.name} {current && <span className="text-xs font-normal text-muted">· signed in</span>}
                                </span>
                                <span className="block truncate text-xs text-muted">
                                  {tenantName(u.tenantId)} · {u.email}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
                                {busy === u.id ? "Signing in…" : "Continue"} <ArrowRight className="size-3.5" aria-hidden />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <details className="border-t border-line px-4 py-2 text-xs text-muted">
                      <summary className="cursor-pointer select-none">Permissions</summary>
                      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                        {ROLE_PERMISSIONS[role].map((p) => (
                          <li key={p}>{PERMISSION_LABELS[p]}</li>
                        ))}
                      </ul>
                    </details>
                  </Panel>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
