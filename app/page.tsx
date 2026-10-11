import Link from "next/link";
import {
  ArrowRight,
  Camera,
  FileCheck2,
  GitBranch,
  Headset,
  LayoutGrid,
  PlayCircle,
  ShieldCheck,
  Smartphone,
  UserRoundCheck,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BASE_PATH } from "@/lib/paths";

const STEPS = [
  { title: "Secure link, no app", body: "The customer opens a link by SMS or the website and agrees to a short privacy notice." },
  { title: "AI asks what's wrong", body: "A voice assistant listens, then asks the customer to show the router." },
  { title: "Evidence, not video", body: "The phone sends a still only when the picture is steady. Each light is recorded with a confidence score." },
  { title: "One approved step at a time", body: "Cables, power cycle, line test: only the steps in the client's approved workflow, checked by policy." },
  { title: "Resolved or handed over", body: "If it's fixed, the case closes. If not, a human joins with the full context and the customer repeats nothing." },
];

const PRINCIPLES = [
  { icon: Camera, title: "Selected evidence only", body: "Only the stills that answer a question are kept. No video is recorded or retained." },
  { icon: ShieldCheck, title: "Policy before action", body: "Every business action is checked by policy first: allowed, human-only or denied. Regulated actions always go to a person." },
  { icon: UserRoundCheck, title: "Human one tap away", body: "Customers can ask for a person at any time. Unclear evidence or a model failure escalates automatically." },
  { icon: GitBranch, title: "Versioned workflows", body: "Each client's workflows go from draft to review to published, and every session is pinned to the version it ran." },
  { icon: FileCheck2, title: "Fully auditable", body: "Every observation, decision, action and handover is recorded with the workflow, policy and model versions used." },
  { icon: LayoutGrid, title: "Multi-client platform", body: "Clients, agents, teams, policies, QA, costs and system health are managed in one platform." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <Logo />
          <nav className="flex items-center gap-1 text-sm">
            <a href="#how" className="hidden rounded-md px-3 py-1.5 text-ink-2 hover:bg-surface-2 sm:inline">
              How it works
            </a>
            <a href="#product" className="hidden rounded-md px-3 py-1.5 text-ink-2 hover:bg-surface-2 sm:inline">
              Product
            </a>
            <Link href="/demo/" className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-ink">
              <PlayCircle className="size-4" aria-hidden /> Watch the demo
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 lg:grid-cols-[1fr_1.15fr] lg:py-20">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-brand uppercase">Human + AI visual assistance</p>
              <h1 className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-tight text-ink sm:text-[42px]">
                Let customers show the problem. Resolve it with AI, with a human one tap away.
              </h1>
              <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">
                Visual Assist combines a live phone camera, a voice assistant, each client&apos;s approved workflows and seamless human takeover. The first
                use case is broadband router support.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/demo/?play=power_cycle_fix" className="inline-flex h-11 items-center gap-2 rounded-md bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-2">
                  <PlayCircle className="size-4.5" aria-hidden /> Watch a 1-minute session
                </Link>
                <Link href="/platform/" className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-2">
                  Explore the platform <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted">Interactive demo with sample data and simulated AI. Works in any modern browser; best on a laptop or desktop.</p>
            </div>
            <figure className="overflow-hidden rounded-lg border border-line bg-navy shadow-[0_20px_50px_-24px_rgba(11,27,51,0.45)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BASE_PATH}/images/preview-stage.jpg`}
                alt="Demo stage: the customer's phone on the left, the agent console on the right"
                width={1440}
                height={900}
                className="block h-auto w-full"
              />
            </figure>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">How a session works</h2>
          <p className="mt-2 max-w-2xl text-[15px] text-ink-2">The router loop from first contact to resolution, with the AI on approved rails the whole way.</p>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-surface p-5">
                <span className="tabular text-xs font-semibold text-brand">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 text-[15px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Product */}
        <section id="product" className="scroll-mt-16 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Three connected experiences</h2>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-2">One session engine sits behind the customer&apos;s phone, the agent&apos;s console and the operations platform.</p>
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <Experience
                icon={<Smartphone className="size-4" />}
                title="Customer Visual Assistance"
                body="A mobile browser session: camera, voice, one clear instruction at a time, captions, and a human-help button that always works."
                image="preview-customer.jpg"
                alt="Customer phone showing the assistant asking for a closer view of the router lights"
                href="/demo/?play=loose_cable"
                cta="Watch a customer session"
              />
              <Experience
                icon={<Headset className="size-4" />}
                title="Human Agent Console"
                body="A live queue with SLA timers. Each session shows video, the transcript, an AI summary, evidence with confidence scores, workflow progress and policy-checked actions."
                image="preview-console.jpg"
                alt="Agent console showing the live queue"
                href="/console/"
                cta="Open the console"
              />
              <Experience
                icon={<LayoutGrid className="size-4" />}
                title="AIUK Management Platform"
                body="Operations dashboard, session history with audit reconstruction, clients, versioned workflows, policies, QA, analytics, costs and health."
                image="preview-platform.jpg"
                alt="Operations dashboard with session outcomes and escalation reasons"
                href="/platform/"
                cta="Open the platform"
              />
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Built for regulated customer operations</h2>
          <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-ink">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-navy">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-5 py-12 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold text-white">See the whole loop in about a minute</h2>
              <p className="mt-1 text-sm text-white/70">Pick a scenario. The demo plays the customer and the agent side by side, explaining each step.</p>
            </div>
            <Link href="/demo/" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-navy hover:bg-white/90">
              <PlayCircle className="size-4.5" aria-hidden /> Open the demo
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Absolute Intelligence UK. Visual Assist.</span>
          <span>Demo environment: sample data and simulated AI. No real customer data.</span>
        </div>
      </footer>
    </div>
  );
}

function Experience({
  icon,
  title,
  body,
  image,
  alt,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  image: string;
  alt: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-line bg-canvas">
      <div className="aspect-[16/10] overflow-hidden border-b border-line bg-navy">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE_PATH}/images/${image}`} alt={alt} loading="lazy" className="h-full w-full object-cover object-top" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <span className="flex size-7 items-center justify-center rounded-md bg-navy text-white" aria-hidden>
            {icon}
          </span>
          {title}
        </h3>
        <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-2">{body}</p>
        <Link href={href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          {cta} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
