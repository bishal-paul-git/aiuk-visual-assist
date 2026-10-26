import Link from "next/link";
import { ArrowRight, Camera, Eye, FileCheck2, Headset, MessageSquareText, MousePointerClick, ShieldCheck, Smartphone, UserRoundCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BASE_PATH } from "@/lib/paths";

const TRY = "/client/sign-in/";

const STEPS = [
  {
    icon: Smartphone,
    title: "The customer taps a link",
    body: "They get a text message. One tap opens it in their phone's browser. There is no app to find, download or sign in to.",
  },
  {
    icon: Camera,
    title: "They show it. The AI helps.",
    body: "The customer points their camera at the problem and talks or types. The AI looks, asks for a better view when it isn't sure, and guides them one clear step at a time.",
  },
  {
    icon: UserRoundCheck,
    title: "A person steps in when it matters",
    body: "At any moment the customer can ask for a person, and the AI hands over by itself when it should. Your agent sees everything so far, so nobody has to start again.",
  },
];

const BENEFITS = [
  { icon: Eye, title: "Seeing beats describing", body: "Most remote support stalls on \"what can you see?\". Here the answer is on screen, so problems get solved on the first contact more often." },
  { icon: MessageSquareText, title: "Nobody repeats themselves", body: "The agent gets the conversation, the photos and a plain summary the moment they join. The customer carries on, not starts over." },
  { icon: ShieldCheck, title: "Only what you've approved", body: "The AI follows your workflow and your rules. Anything risky or regulated goes to a person, never to the AI." },
  { icon: FileCheck2, title: "Everything is on the record", body: "Every reading, decision and action is recorded, with how sure the AI was. Review any session whenever you like." },
];

export function ProductLanding() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
          <Logo />
          <nav className="flex items-center gap-1 text-sm">
            <a href="#how" className="hidden rounded-md px-3 py-1.5 text-ink-2 hover:bg-surface-2 sm:inline">
              How it works
            </a>
            <a href="#two-sides" className="hidden rounded-md px-3 py-1.5 text-ink-2 hover:bg-surface-2 sm:inline">
              Two sides
            </a>
            <Link href={TRY} className="ml-1 inline-flex h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-brand-ink sm:h-9">
              Try it now
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-10 sm:py-14 lg:grid-cols-[1fr_1.2fr] lg:py-20">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-brand uppercase">Visual support for customer service</p>
              <h1 className="mt-3 text-[32px] leading-[1.1] font-semibold tracking-tight text-ink sm:text-[42px]">Solve what you can see, on the first contact.</h1>
              <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">
                Visual Assist lets your customer show the problem through their phone camera. An AI assistant guides them step by step, and a real person takes over the moment they&apos;re
                needed, with the whole story already in front of them.
              </p>
              <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap sm:items-center">
                <Link href={TRY} className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-ink sm:h-11">
                  <MousePointerClick className="size-4" aria-hidden /> Try it now
                </Link>
                <a href="#how" className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-2 sm:h-11">
                  See how it works <ArrowRight className="size-4" aria-hidden />
                </a>
              </div>
              <p className="mt-4 text-xs text-muted">Try both sides of a support call in about ten minutes. No installation, nothing to buy.</p>
            </div>
            <figure className="overflow-hidden rounded-xl border border-line bg-navy shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BASE_PATH}/images/preview-stage.jpg`}
                alt="A customer's phone showing the assistant guiding them, next to the support agent's screen showing the same session live"
                width={1440}
                height={900}
                className="h-auto w-full"
              />
            </figure>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">How it works</h2>
          <p className="mt-2 max-w-2xl text-[15px] text-ink-2">Three moments, from the first tap to a solved problem.</p>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-surface p-5">
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-ink" aria-hidden>
                    <s.icon className="size-5" />
                  </span>
                  <span className="text-xs font-semibold tracking-wide text-muted uppercase">Step {i + 1}</span>
                </span>
                <h3 className="mt-3 text-[16px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="two-sides" className="scroll-mt-16 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">One conversation, two sides</h2>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-2">Everything the customer does shows up for the agent as it happens, and the other way round.</p>
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <Side
                icon={<Smartphone className="size-5" aria-hidden />}
                label="For your customer"
                title="Help that feels easy"
                points={["Opens from a text message, in the browser", "Talks or types, whichever is easier", "Shows the problem with the camera", "Gets one clear instruction at a time", "Can ask for a person at any moment"]}
              />
              <Side
                icon={<Headset className="size-5" aria-hidden />}
                label="For your agents"
                title="Context before the first hello"
                points={["Sees the customer's camera live", "Reads the full conversation and a short summary", "Sees what the AI saw and how sure it was", "Takes over with one click, and can hand back to the AI", "Runs approved actions: book an engineer, raise a ticket"]}
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Why teams choose it</h2>
          <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink" aria-hidden>
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-navy">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12">
            <div>
              <h2 className="text-xl font-semibold text-white sm:text-2xl">See it for yourself in ten minutes</h2>
              <p className="mt-1 text-sm text-white/70">Be the customer on your phone, then the agent on your laptop. Your login is already filled in.</p>
            </div>
            <Link href={TRY} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-6 text-sm font-semibold text-navy hover:bg-white/90 sm:h-11">
              Try it now <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Absolute Intelligence UK</span>
          <span className="flex gap-4">
            <Link href="/sign-in/" className="hover:text-ink hover:underline">
              Staff sign-in
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Side({ icon, label, title, points }: { icon: React.ReactNode; label: string; title: string; points: string[] }) {
  return (
    <article className="rounded-xl border border-line bg-canvas p-6">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand uppercase">
        {icon} {label}
      </p>
      <h3 className="mt-2 text-lg font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-[14px] text-ink-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            {p}
          </li>
        ))}
      </ul>
    </article>
  );
}
