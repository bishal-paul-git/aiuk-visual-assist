import Link from "next/link";
import { ArrowRight, FlaskConical, Headset, LayoutGrid, MonitorPlay, Smartphone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { TestSessionLauncher } from "@/components/shared/test-session-launcher";

const JOURNEY = [
  "Customer opens a secure link — no app",
  "AI asks what's wrong",
  "Customer shows the router",
  "AI asks for a closer view of the lights",
  "Observations recorded with confidence",
  "Rear cables checked",
  "Approved steps followed (power cycle, line test)",
  "Resolved — or a human joins with full context",
];

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Logo />
          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-warn/40 bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
            <FlaskConical className="size-3" aria-hidden /> {process.env.NEXT_PUBLIC_STATIC_DEMO === "1" ? "Static demo · runs in your browser" : "POC · simulated AI providers"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-ink">Let customers show the problem while talking to AI — with a human one tap away.</h1>
        <p className="mt-3 max-w-2xl text-[15px] text-ink-2">
          Absolute Intelligence Visual Assist combines a live camera session, voice, approved workflows and seamless human takeover. The first
          use case is <strong>Router Visual Support</strong>.
        </p>

        <Link href="/demo" className="mt-6 inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-2">
          <MonitorPlay className="size-4" aria-hidden /> Watch the walkthrough: phone and agent console side by side
        </Link>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Entry
            icon={<Smartphone className="size-5" />}
            title="Customer Visual Assistance"
            body="Mobile-first browser session: camera, voice, one instruction at a time, human help and end."
            action={<TestSessionLauncher />}
          />
          <Entry
            icon={<Headset className="size-5" />}
            title="Human Agent Console"
            body="Live queue and session workspace: video, transcript, AI summary, evidence, confidence, workflow, escalation and next action."
            action={
              <Link href="/console" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                Open console <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          <Entry
            icon={<LayoutGrid className="size-5" />}
            title="AIUK Management Platform"
            body="Operations, history, clients, agents, versioned workflows, policies, QA, analytics, costs, audit and health."
            action={
              <Link href="/platform" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                Open platform <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
        </div>

        <section className="mt-10 rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Router Visual Support — the complete loop</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY.map((j, i) => (
              <li key={j} className="flex gap-2.5 text-[13px] text-ink-2">
                <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink">{i + 1}</span>
                {j}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted">
            Tip: start a test session, open the customer link on a phone (or use the demo camera), and watch it in the agent console at the same time.
          </p>
        </section>
      </main>
    </div>
  );
}

function Entry({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface p-5">
      <span className="flex size-9 items-center justify-center rounded-md bg-navy text-white" aria-hidden>
        {icon}
      </span>
      <h2 className="mt-3 text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 flex-1 text-[13px] text-ink-2">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}
