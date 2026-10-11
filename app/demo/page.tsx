"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Headset, Pause, Play, PlayCircle, RotateCcw, Smartphone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClass, cx } from "@/components/ui/primitives";
import { useAgentId } from "@/components/console/agent-identity";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { BASE_PATH, getTransport, STATIC_DEMO, type Transport } from "@/lib/client/transport";
import { direct, reachedStages, STAGES, type DirectorDecision, type WalkthroughStage } from "@/lib/demo/walkthrough";

type Run = { id: string; scenario: string; customer: string; console: string; autoplay: boolean };

/** Featured stories on the intro screen; every other scenario is under "More". */
const FEATURED: { key: string; title: string; body: string; outcome: "ai" | "human" }[] = [
  { key: "power_cycle_fix", title: "AI resolves it", body: "The internet light is off. A guided power cycle brings it back and the customer confirms.", outcome: "ai" },
  { key: "loose_cable", title: "AI spots a loose cable", body: "The rear view shows the broadband cable isn't seated. Reseating it restores service.", outcome: "ai" },
  { key: "wan_down", title: "Line fault, human expert", body: "Nothing on the customer's side helps. A line test finds a fault, and a human takes over to book an engineer.", outcome: "human" },
  { key: "glare_then_clear", title: "Unclear picture", body: "Glare hides the lights, so the AI won't guess. It asks for a closer view, then continues.", outcome: "human" },
];

const withQuery = (path: string, q: string) => `${path}${path.includes("?") ? "&" : "?"}${q}`;

/**
 * Demo stage: the customer's phone and the agent console side by side for one
 * new session. "Play" scripts both sides through the normal commands so
 * anyone can watch the whole router loop without a camera; "Try it yourself"
 * leaves both sides to the viewer. /demo/?play=<scenario> starts a
 * walkthrough straight away (used by links on the home page).
 */
export default function DemoStage() {
  const [scenario, setScenario] = useState("power_cycle_fix");
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<"customer" | "agent">("customer");
  const agentId = useAgentId();
  const walkthrough = useWalkthrough(run, agentId);

  async function start(key: string, autoplay: boolean) {
    setBusy(true);
    setError(undefined);
    setScenario(key);
    const t = await getTransport();
    const r = await t.createSession({ workflowKey: "router-troubleshooting", tenantId: "tnt_northline", scenario: key, channel: "secure_link" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPane("customer");
    setRun({
      id: r.id,
      scenario: key,
      customer: `${BASE_PATH}${autoplay ? withQuery(r.customerPath, "autoplay=1") : r.customerPath}`,
      console: `${BASE_PATH}${r.consolePath}`,
      autoplay,
    });
  }

  // Deep link: /demo/?play=<scenario>
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("play");
    if (key && SCENARIOS.some((s) => s.key === key)) void startRef.current(key, true);
  }, []);

  async function reset() {
    if (!window.confirm("Clear all demo sessions stored in this browser?")) return;
    const m = await import("@/lib/client/browser-transport");
    m.resetDemo();
    window.location.reload();
  }

  const scenarioName = (key: string) => FEATURED.find((f) => f.key === key)?.title ?? SCENARIOS.find((s) => s.key === key)?.name ?? key;

  return (
    <div className="flex min-h-screen flex-col bg-navy text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="rounded-md">
            <Logo inverted />
          </Link>
          {run && (
            <span className="hidden text-sm text-white/70 md:inline">
              Router Visual Support · <span className="text-white">{scenarioName(run.scenario)}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {run && (
            <button type="button" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10 hover:text-white")} onClick={() => setRun(undefined)}>
              <ArrowLeft className="size-3.5" aria-hidden /> All scenarios
            </button>
          )}
          <Link href="/platform/" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10 hover:text-white")}>
            Platform
          </Link>
          <Link href="/console/" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10 hover:text-white")}>
            Agent console
          </Link>
        </div>
      </header>
      {error && <p className="bg-danger px-4 py-2 text-sm">{error}</p>}

      {!run ? (
        <Intro scenario={scenario} setScenario={setScenario} busy={busy} onStart={(key, autoplay) => void start(key, autoplay)} onReset={STATIC_DEMO ? () => void reset() : undefined} />
      ) : (
        <>
          {run.autoplay && (
            <Narration
              decision={walkthrough.decision}
              reached={walkthrough.reached}
              paused={walkthrough.paused}
              onToggle={walkthrough.toggle}
              onReplay={() => void start(run.scenario, true)}
              onBack={() => setRun(undefined)}
              recordHref={run.console}
            />
          )}
          <div className="flex gap-1 border-b border-white/10 px-3 pt-2 lg:hidden" role="tablist" aria-label="Choose view">
            <PaneTab active={pane === "customer"} onClick={() => setPane("customer")} icon={<Smartphone className="size-3.5" aria-hidden />}>
              Customer phone
            </PaneTab>
            <PaneTab active={pane === "agent"} onClick={() => setPane("agent")} icon={<Headset className="size-3.5" aria-hidden />}>
              Agent console
            </PaneTab>
          </div>
          <main className="flex flex-1 flex-col gap-4 p-3 lg:flex-row lg:p-4">
            <section className={cx("shrink-0 flex-col items-center gap-2 lg:flex", pane === "customer" ? "flex" : "hidden")} aria-label="Customer phone">
              <span className="hidden text-xs font-semibold tracking-wide text-white/60 uppercase lg:block">Customer · phone</span>
              <div className="h-[740px] max-h-[calc(100dvh-140px)] min-h-[600px] w-[360px] max-w-full overflow-hidden rounded-[30px] border-[7px] border-[#1f2a3d] bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
                <iframe key={run.customer} src={run.customer} title="Customer view" className="h-full w-full border-0" allow="camera; microphone; autoplay" />
              </div>
            </section>
            <section className={cx("min-h-[740px] min-w-0 flex-1 flex-col gap-2 lg:flex", pane === "agent" ? "flex" : "hidden")} aria-label="Agent console">
              <span className="hidden text-xs font-semibold tracking-wide text-white/60 uppercase lg:block">Human Agent Console</span>
              <div className="flex-1 overflow-hidden rounded-lg bg-white">
                <iframe key={run.console} src={run.console} title="Agent console" className="h-full min-h-[700px] w-full border-0" />
              </div>
            </section>
          </main>
        </>
      )}
    </div>
  );
}

function Intro({
  scenario,
  setScenario,
  busy,
  onStart,
  onReset,
}: {
  scenario: string;
  setScenario: (k: string) => void;
  busy: boolean;
  onStart: (key: string, autoplay: boolean) => void;
  onReset?: () => void;
}) {
  const more = SCENARIOS.filter((s) => !FEATURED.some((f) => f.key === s.key));
  const selected = SCENARIOS.find((s) => s.key === scenario);
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-14">
      <p className="text-xs font-semibold tracking-[0.12em] text-white/50 uppercase">Interactive demo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Router Visual Support, end to end</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/70">
        Choose a scenario and press play. You&apos;ll see the customer&apos;s phone and the support agent&apos;s console side by side, with a caption
        explaining what the product is doing at each step. A session takes about a minute.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {FEATURED.map((f) => {
          const on = f.key === scenario;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setScenario(f.key)}
              aria-pressed={on}
              className={cx(
                "rounded-lg border p-4 text-left transition-colors",
                on ? "border-brand bg-brand/15 ring-1 ring-brand" : "border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold">{f.title}</span>
                <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", f.outcome === "ai" ? "bg-ok/20 text-[#7be3ae]" : "bg-violet/25 text-[#c9b8ff]")}>
                  {f.outcome === "ai" ? "Resolved by AI" : "Human takeover"}
                </span>
              </span>
              <span className="mt-1.5 block text-[13px] leading-relaxed text-white/65">{f.body}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-ink disabled:opacity-60" disabled={busy} onClick={() => onStart(scenario, true)}>
          <PlayCircle className="size-4.5" aria-hidden /> Play the walkthrough
        </button>
        <button type="button" className="inline-flex h-11 items-center gap-2 rounded-md border border-white/25 px-5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60" disabled={busy} onClick={() => onStart(scenario, false)}>
          <Play className="size-4" aria-hidden /> Try it yourself
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-white/60">
          More scenarios
          <select
            value={more.some((s) => s.key === scenario) ? scenario : ""}
            onChange={(e) => e.target.value && setScenario(e.target.value)}
            className="h-8 rounded-md border border-white/20 bg-navy-2 px-2 text-xs text-white"
          >
            <option value="">Choose…</option>
            {more.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected && !FEATURED.some((f) => f.key === selected.key) && (
        <p className="mt-3 text-[13px] text-white/65">
          <span className="font-semibold text-white">{selected.name}:</span> {selected.description} Expected outcome: {selected.expectedOutcome.toLowerCase()}.
        </p>
      )}

      <div className="mt-10 grid gap-4 border-t border-white/10 pt-6 text-[13px] text-white/60 sm:grid-cols-3">
        <p>
          <span className="block font-semibold text-white/85">Try it yourself</span>
          You play both parts. On the phone, accept the notice, choose <em>Use demo camera</em> and describe the problem. In the console, join and take
          over when the AI escalates.
        </p>
        <p>
          <span className="block font-semibold text-white/85">In production</span>
          The customer joins from their own phone via a secure link, and the agent works in a separate console. Here, both run in this browser so you can
          watch them together.
        </p>
        <p>
          <span className="block font-semibold text-white/85">Sample data only</span>
          The AI is simulated and all customers and accounts are fictional.
          {onReset && (
            <>
              {" "}
              <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-white/80 underline-offset-2 hover:underline">
                <RotateCcw className="size-3" aria-hidden /> Reset demo data
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

function PaneTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx("flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-semibold", active ? "bg-white/10 text-white" : "text-white/60 hover:text-white")}
    >
      {icon}
      {children}
    </button>
  );
}

function Narration({
  decision,
  reached,
  paused,
  onToggle,
  onReplay,
  onBack,
  recordHref,
}: {
  decision?: DirectorDecision;
  reached: Set<WalkthroughStage>;
  paused: boolean;
  onToggle: () => void;
  onReplay: () => void;
  onBack: () => void;
  recordHref: string;
}) {
  const current = STAGES.find((s) => s.key === decision?.stage);
  return (
    <div className="border-b border-white/10 bg-navy-2 px-4 py-3" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-4xl">
          <p className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">
            {decision?.done ? "Complete" : paused ? "Paused" : current?.label ?? "Starting"}
          </p>
          <p className="mt-0.5 text-[15px] leading-snug text-white">{decision?.caption ?? "Starting the walkthrough…"}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {decision?.done ? (
            <>
              <a href={recordHref} target="_blank" rel="noreferrer" className={cx(buttonClass("secondary", "sm"), "border-white/20 bg-white text-navy hover:bg-white/90")}>
                <ExternalLink className="size-3.5" aria-hidden /> Open the session record
              </a>
              <button type="button" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10 hover:text-white")} onClick={onReplay}>
                <RotateCcw className="size-3.5" aria-hidden /> Replay
              </button>
              <button type="button" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10 hover:text-white")} onClick={onBack}>
                Try another scenario
              </button>
            </>
          ) : (
            <button type="button" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10 hover:text-white")} onClick={onToggle}>
              {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />} {paused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </div>
      <ol className="mt-3 flex gap-1" aria-label="Progress">
        {STAGES.map((st) => {
          const done = reached.has(st.key);
          const now = decision?.stage === st.key && !decision.done;
          return (
            <li key={st.key} className="group relative flex-1" title={st.label}>
              <span className={cx("block h-1 rounded-full", now ? "bg-brand va-pulse" : done ? "bg-ok" : "bg-white/15")} />
              <span className="sr-only">
                {st.label}: {done ? "done" : now ? "in progress" : "not reached"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Follows the session and sends the director's next scripted move. */
function useWalkthrough(run: Run | undefined, agentId: string) {
  const [decision, setDecision] = useState<DirectorDecision>();
  const [reached, setReached] = useState<Set<WalkthroughStage>>(new Set());
  const [paused, setPaused] = useState(false);
  const sent = useRef(new Set<string>());
  const timer = useRef<{ key: string; handle: ReturnType<typeof setTimeout> } | null>(null);
  const pausedRef = useRef(paused);
  const latest = useRef<{ transport: Transport; decision: DirectorDecision; token: string } | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!run?.autoplay) return;
    sent.current = new Set();
    const token = tokenFrom(run.customer);
    let unsubscribe = () => {};
    let cancelled = false;

    const schedule = () => {
      const l = latest.current;
      const next = l?.decision.next;
      if (!l || !next || pausedRef.current || sent.current.has(next.key)) {
        // Nothing (or something else) to do now: drop any stale scheduled move.
        if (timer.current && timer.current.key !== next?.key) {
          clearTimeout(timer.current.handle);
          timer.current = null;
        }
        return;
      }
      if (timer.current?.key === next.key) return;
      if (timer.current) clearTimeout(timer.current.handle);
      timer.current = {
        key: next.key,
        handle: setTimeout(() => {
          timer.current = null;
          if (pausedRef.current || sent.current.has(next.key)) return;
          sent.current.add(next.key);
          void (next.actor === "agent" ? l.transport.agentCommand(run.id, agentId, next.command) : l.transport.customerCommand(token, next.command));
        }, next.delayMs),
      };
    };

    void getTransport().then((transport) => {
      if (cancelled) return;
      unsubscribe = transport.subscribeAgent(
        run.id,
        (view) => {
          const d = direct(view.state, agentId);
          latest.current = { transport, decision: d, token };
          setDecision(d);
          setReached(reachedStages(view.state));
          schedule();
        },
        () => {},
      );
    });
    const resume = () => schedule();
    window.addEventListener("va-walkthrough-resume", resume);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("va-walkthrough-resume", resume);
      if (timer.current) clearTimeout(timer.current.handle);
      timer.current = null;
      latest.current = null;
      setDecision(undefined);
      setReached(new Set());
      setPaused(false);
    };
  }, [run, agentId]);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
    if (next && timer.current) {
      clearTimeout(timer.current.handle);
      timer.current = null;
    }
    if (!next) window.dispatchEvent(new Event("va-walkthrough-resume"));
  };

  return { decision, reached, paused, toggle };
}

function tokenFrom(customerPath: string): string {
  const url = new URL(customerPath, "http://x");
  return url.searchParams.get("t") ?? url.pathname.split("/").filter(Boolean).pop() ?? "";
}
