"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, FileClock, Globe2, KeyRound, ShieldCheck, Users, Info } from "lucide-react";
import { Button, TextInput } from "@/components/ui/primitives";

const TRUST = [
  { icon: KeyRound, title: "SSO and MFA", text: "SAML / OIDC single sign-on with enforced multi-factor authentication." },
  { icon: Users, title: "Role-based access", text: "Granular RBAC by client, workflow and data class." },
  { icon: FileClock, title: "Full audit trail", text: "Every AI decision, handover and tool action is recorded." },
  { icon: Globe2, title: "UK data residency", text: "Processing and storage in UK regions with configurable retention." },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [ssoNote, setSsoNote] = useState(false);

  const submitSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/dashboard");
  };
  const submitReset = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative flex flex-col justify-between bg-nav px-6 py-8 text-nav-ink sm:px-10 lg:px-14 lg:py-12">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-brand text-white"><Eye size={17} /></span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Absolute Intelligence</p>
            <p className="text-2xs uppercase tracking-wider text-nav-ink/70">Visual Assist</p>
          </div>
        </div>

        <div className="my-10 max-w-lg lg:my-0">
          <p className="label !text-nav-ink/60">Enterprise visual support platform</p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
            Let customers show the problem instead of trying to describe it.
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-nav-ink/80">
            Live AI-guided video support with governed handover to your human advisers, complete evidence and a reviewable audit trail.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {TRUST.map((t) => (
              <li key={t.title} className="flex gap-3">
                <t.icon size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="text-[13px] font-semibold text-white">{t.title}</p>
                  <p className="text-xs leading-relaxed text-nav-ink/70">{t.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-1.5 text-2xs text-nav-ink/60">
          <ShieldCheck size={13} aria-hidden /> Demonstration environment. All data shown is simulated.
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          {mode === "signin" ? (
            <form onSubmit={submitSignIn} className="space-y-4" aria-labelledby="signin-title">
              <div>
                <h2 id="signin-title" className="text-xl font-semibold tracking-tight text-ink">Sign in</h2>
                <p className="mt-1 text-[13px] text-ink-soft">Access your organisation&apos;s Visual Assist workspace.</p>
              </div>
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-soft">Work email</label>
                <TextInput id="email" type="email" autoComplete="username" placeholder="name@company.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} className="!h-10" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-medium text-ink-soft">Password</label>
                  <button type="button" onClick={() => { setMode("reset"); setSent(false); }} className="text-xs font-medium text-brand hover:underline">Forgot password?</button>
                </div>
                <TextInput id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="!h-10" />
              </div>
              <Button type="submit" variant="primary" size="lg" className="w-full">Sign in</Button>

              <div className="flex items-center gap-3 text-2xs uppercase tracking-wider text-ink-mute" aria-hidden>
                <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
              </div>

              <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setSsoNote(true)}>
                <KeyRound size={14} /> Sign in with SSO
              </Button>
              {ssoNote && (
                <p role="status" className="flex items-start gap-2 rounded border border-line bg-subtle px-3 py-2 text-xs text-ink-soft">
                  <Info size={14} className="mt-px shrink-0 text-info" /> SSO is not connected in this demo.
                </p>
              )}
              <Button type="button" variant="dark" size="lg" className="w-full" onClick={() => router.push("/dashboard")}>
                Continue with demo account
              </Button>
              <p className="text-center text-2xs text-ink-mute">Demo account: Operations Admin, all clients. No credentials required.</p>
            </form>
          ) : (
            <form onSubmit={submitReset} className="space-y-4" aria-labelledby="reset-title">
              <div>
                <h2 id="reset-title" className="text-xl font-semibold tracking-tight text-ink">Reset password</h2>
                <p className="mt-1 text-[13px] text-ink-soft">Enter your work email and we will send a reset link.</p>
              </div>
              {sent ? (
                <p role="status" className="flex items-start gap-2 rounded border border-ok/30 bg-ok-soft px-3 py-2.5 text-[13px] text-ok">
                  <CheckCircle2 size={15} className="mt-px shrink-0" />
                  <span>If an account exists for {email || "that address"}, a reset link has been sent. (Simulated)</span>
                </p>
              ) : (
                <>
                  <div>
                    <label htmlFor="reset-email" className="mb-1 block text-xs font-medium text-ink-soft">Work email</label>
                    <TextInput id="reset-email" type="email" required placeholder="name@company.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} className="!h-10" />
                  </div>
                  <Button type="submit" variant="primary" size="lg" className="w-full">Send reset link</Button>
                </>
              )}
              <button type="button" onClick={() => setMode("signin")} className="text-xs font-medium text-brand hover:underline">Back to sign in</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
