import Link from "next/link";
import { ArrowRight, Headset, LayoutGrid, MessageSquareWarning, PlayCircle, Smartphone } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Testing guide" };

const FEEDBACK_URL = "https://github.com/bishal-paul-git/aiuk-visual-assist/issues/new?template=test-feedback.yml";

/** A short, phone-friendly guide for team testers. Mirrors docs/TEAM-TESTING.md. */
export default function TestingGuide() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Logo />
          <Link href="/" className="text-sm font-medium text-brand hover:underline">
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 pb-[max(40px,env(safe-area-inset-bottom))]">
        <p className="text-xs font-semibold tracking-[0.12em] text-brand uppercase">Working product prototype · simulated AI · about 15 minutes</p>
        <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight text-ink sm:text-[34px]">Test Visual Assist</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Works on any phone or computer. Nothing to install and no password. The AI&apos;s replies and what it &ldquo;sees&rdquo; are scripted for each test
          scenario: it does not analyse your camera image yet. So this test checks the journey, the screens and the handover, not the AI&apos;s accuracy. All
          data is sample data; please don&apos;t enter real customer details.
        </p>

        <ol className="mt-8 grid gap-4">
          <Step n={1} icon={<PlayCircle className="size-4" />} title="Watch it" time="5 min">
            <p>Pick a scenario. The demo plays the customer&apos;s phone and the agent&apos;s screen side by side and explains each step.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Go href="/demo/?play=power_cycle_fix" label="Power cycle" note="The AI fixes it on its own" />
              <Go href="/demo/?play=wan_down" label="Line fault" note="The AI hands over to a person" />
            </div>
          </Step>

          <Step n={2} icon={<Smartphone className="size-4" />} title="Try it yourself" time="5 min">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                Open the <Inline href="/console/">Agent Console</Inline> and press <b>Start test session</b>, then <b>Create session</b>.
              </li>
              <li>
                Press <b>Open customer view</b>. It opens in a new tab: you are now the customer.
              </li>
              <li>
                Press <b>Agree and continue</b>, then <b>Use demo camera</b>. Follow the instructions. Press <b>Human help</b> at any point.
              </li>
              <li>
                In the first tab, press <b>Open in agent console</b> (it opens another tab). Press <b>Join session</b> (<b>Join</b> on a phone), then{" "}
                <b>Take over</b>: you are now the agent. Try a message, an action and <b>End</b>.
              </li>
            </ol>
          </Step>

          <Step n={3} icon={<LayoutGrid className="size-4" />} title="Look around" time="5 min">
            <p>
              Open the <Inline href="/platform/">Platform</Inline> and click through the menu: sessions, workflows, analytics, costs.
            </p>
            <p className="mt-2">
              Use <Inline href="/sign-in/">Switch user</Inline>{" "}to see different roles: agents and supervisors work in the console, administrators and QA
              reviewers in the platform. In this demo every role sees sample data from all clients; real per-client separation is in the full version.
            </p>
          </Step>
        </ol>

        <section className="mt-8 rounded-lg border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
            <MessageSquareWarning className="size-5 text-brand" aria-hidden /> Tell us what you find
          </h2>
          <p className="mt-2 text-[14px] text-ink-2">
            Anything broken, confusing or slow, and any ideas. Say which phone or computer you used. A screenshot helps.
          </p>
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-2"
          >
            Send feedback <ArrowRight className="size-4" aria-hidden />
          </a>
          <p className="mt-2 text-xs text-muted">Opens a short form on GitHub (a free GitHub account is needed). No account? Email or message your feedback instead.</p>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Headset className="size-4 text-muted" aria-hidden /> Good to know
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] text-ink-2">
            <li>In this online version the customer and the agent are two tabs in the same browser. Phone-to-laptop, real AI, live video and SMS links come once the product runs on a server.</li>
            <li>Platform reports show sample sessions and won&apos;t include the sessions you create. Only Live Sessions and the Agent Console show yours.</li>
            <li>To start a test session, use an agent or the platform administrator. Client admins and QA reviewers don&apos;t see the Start test session button.</li>
            <li>Workflows and policies can be read but not edited online.</li>
            <li>Your test sessions are saved in your own browser only.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function Step({ n, icon, title, time, children }: { n: number; icon: React.ReactNode; title: string; time: string; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">{n}</span>
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-[17px] font-semibold text-ink">
          <span className="text-muted" aria-hidden>
            {icon}
          </span>
          {title}
        </h2>
        <span className="tabular shrink-0 text-xs text-muted">{time}</span>
      </div>
      <div className="mt-3 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </li>
  );
}

function Go({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-md border border-line-strong bg-canvas px-4 py-3 hover:border-brand">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-muted">{note}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-brand" aria-hidden />
    </Link>
  );
}

function Inline({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-brand hover:underline">
      {children}
    </Link>
  );
}
