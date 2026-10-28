"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ExternalLink, Headset, Pause, Play, PlayCircle, RotateCcw, Smartphone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClass, cx } from "@/components/ui/primitives";
import { useAgentId } from "@/components/console/agent-identity";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { BASE_PATH, getTransport, STATIC_DEMO, type Transport } from "@/lib/client/transport";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/client/use-media-query";
import { direct, reachedStages, STAGES, type DirectorDecision, type WalkthroughStage } from "@/lib/demo/walkthrough";

type Run = { id: string; scenario: string; customer: string; console: string; autoplay: boolean; playAs: PlayAs };
/** "watch": both sides play themselves. "agent": the customer plays itself and the viewer is the agent. */
type PlayAs = "watch" | "agent";

/** What the viewer, playing the agent, should do for each scripted agent move. */
function agentTurn(key: string): string {
  if (key === "join") return "Your turn. The customer wants a person: on the agent screen, press Join session. You're in charge at once and the customer hears your hello.";
  if (key === "take_over") return "Your turn: press Take over on the agent screen.";
  if (key === "action:book_engineer") return "Your turn. The line test found a fault: under Business actions, choose Book engineer and run it.";
  if (key.startsWith("action:")) return "Your turn: under Business actions, raise a ticket for the customer.";
  if (key === "end") return "Your turn: press End, then Resolved, to finish.";
  return "Your turn on the agent screen.";
}
type Pane = "customer" | "agent";

/** Featured stories on the intro screen; every other scenario is under "More". */
const FEATURED: { key: string; title: string; body: string; outcome: "ai" | "human" }[] = [
  { key: "power_cycle_fix", title: "AI resolves it", body: "The internet light is off. A guided power cycle brings it back and the customer confirms.", outcome: "ai" },
  { key: "loose_cable", title: "AI spots a loose cable", body: "The rear view shows the broadband cable isn't seated. Reseating it restores service.", outcome: "ai" },
  { key: "wan_down", title: "Line fault, human expert", body: "Nothing on the customer's side helps. A line test finds a fault, and a human takes over to book an engineer.", outcome: "human" },
  { key: "glare_then_clear", title: "Unclear picture", body: "Glare hides the lights, so the AI won't guess. It asks for a closer view, then continues.", outcome: "human" },
];

/** Which view a walkthrough stage mostly happens in (for the "view updated" hint on phones). */
const AGENT_STAGES = new Set<WalkthroughStage>(["escalation", "human"]);
const paneOf = (stage: WalkthroughStage): Pane | undefined => (stage === "ended" ? undefined : AGENT_STAGES.has(stage) ? "agent" : "customer");

const withQuery = (path: string, q: string) => `${path}${path.includes("?") ? "&" : "?"}${q}`;

/**
 * Demo stage: the customer's phone and the agent console side by side for one
 * new session. "Play" scripts both sides through the normal commands so
 * anyone can watch the whole router loop without a camera; "Try it yourself"
 * leaves both sides to the viewer. /demo/?play=<scenario> starts a
 * walkthrough straight away (used by links on the home page).
 *
 * On phones and tablets (< lg) the two views share the screen: the customer
 * view fills it edge to edge and a segmented switch flips to the agent
 * console. Both iframes stay mounted so switching never reloads them.
 */
export default function DemoStage() {
  const [scenario, setScenario] = useState("power_cycle_fix");
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<Pane>("customer");
  const [hint, setHint] = useState<Pane>();
  const agentId = useAgentId();
  const walkthrough = useWalkthrough(run, agentId);
  const desktop = useMediaQuery(DESKTOP_QUERY);

  // Phones: when the story moves to the view that's not on screen, offer a
  // one-tap hint to switch (derived during render, no effect needed).
  const stage = walkthrough.decision?.stage;
  const [lastStage, setLastStage] = useState<WalkthroughStage>();
  if (stage !== lastStage) {
    setLastStage(stage);
    const target = stage && !walkthrough.decision?.done ? paneOf(stage) : undefined;
    if (target && target !== pane && lastStage !== undefined) setHint(target);
  }
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(undefined), 7000);
    return () => clearTimeout(t);
  }, [hint]);

  function choosePane(p: Pane) {
    setPane(p);
    if (hint === p) setHint(undefined);
  }

  async function start(key: string, autoplay: boolean, playAs: PlayAs = "watch") {
    setBusy(true);
    setError(undefined);
    setScenario(key);
    const t = await getTransport();
    const r = await t.createSession({ workflowKey: "router-troubleshooting", tenantId: "tnt_northline", scenario: key, channel: "secure_link" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPane("customer");
    setHint(undefined);
    setRun({
      id: r.id,
      scenario: key,
      customer: `${BASE_PATH}${autoplay ? withQuery(r.customerPath, "autoplay=1") : r.customerPath}`,
      console: `${BASE_PATH}${r.consolePath}`,
      autoplay,
      playAs,
    });
    if (playAs === "agent") setPane("agent");
  }

  // Deep link: /demo/?play=<scenario>
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const key = q.get("play");
    if (key && SCENARIOS.some((s) => s.key === key)) void startRef.current(key, true, q.get("as") === "agent" ? "agent" : "watch");
  }, []);

  async function reset() {
    if (!window.confirm("Clear all demo sessions stored in this browser?")) return;
    const m = await import("@/lib/client/browser-transport");
    m.resetDemo();
    window.location.reload();
  }

  const scenarioName = (key: string) => FEATURED.find((f) => f.key === key)?.title ?? SCENARIOS.find((s) => s.key === key)?.name ?? key;
  const compact = Boolean(run) && !desktop;
  const done = Boolean(walkthrough.decision?.done);

  return (
    <div className={cx("flex flex-col bg-navy text-white", run ? "h-[100dvh] overflow-hidden lg:h-auto lg:min-h-screen lg:overflow-visible" : "min-h-screen")}>
      {compact && run ? (
        <MobileBar
          pane={pane}
          hint={hint}
          onPane={choosePane}
          onBack={() => setRun(undefined)}
          showPause={run.autoplay && !done}
          paused={walkthrough.paused}
          onToggle={walkthrough.toggle}
        />
      ) : (
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="shrink-0 rounded-md">
              <Logo inverted />
            </Link>
            {run && (
              <span className="hidden truncate text-sm text-white/70 md:inline">
                Router Visual Support · <span className="text-white">{scenarioName(run.scenario)}</span>
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {run && (
              <button type="button" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10 hover:text-white")} onClick={() => setRun(undefined)}>
                <ArrowLeft className="size-3.5" aria-hidden /> All scenarios
              </button>
            )}
            <Link href="/platform/" className={cx(buttonClass("ghost", "sm"), "h-11 text-white/80 hover:bg-white/10 hover:text-white max-sm:hidden lg:h-7")}>
              Platform
            </Link>
            <Link href="/console/" className={cx(buttonClass("ghost", "sm"), "h-11 text-white/80 hover:bg-white/10 hover:text-white lg:h-7")}>
              Agent console
            </Link>
          </div>
        </header>
      )}
      {error && <p className="bg-danger px-4 py-2 text-sm">{error}</p>}

      {!run ? (
        <Intro scenario={scenario} setScenario={setScenario} busy={busy} onStart={(key, autoplay) => void start(key, autoplay)} onReset={STATIC_DEMO ? () => void reset() : undefined} />
      ) : (
        <>
          {run.autoplay &&
            (desktop ? (
              <Narration
                decision={walkthrough.decision}
                reached={walkthrough.reached}
                paused={walkthrough.paused}
                onToggle={walkthrough.toggle}
                onReplay={() => void start(run.scenario, true, run.playAs)}
                onBack={() => setRun(undefined)}
                recordHref={run.console}
              />
            ) : (
              <MobileCaption
                decision={walkthrough.decision}
                reached={walkthrough.reached}
                paused={walkthrough.paused}
                onReplay={() => void start(run.scenario, true, run.playAs)}
                onBack={() => setRun(undefined)}
                recordHref={run.console}
              />
            ))}
          {/* One set of iframes for every breakpoint: < lg they are stacked and the switch shows one; lg+ side by side. */}
          <main className="relative min-h-0 flex-1 bg-black lg:flex lg:flex-row lg:gap-4 lg:bg-transparent lg:p-4">
            <section
              className={cx(
                "absolute inset-x-0 top-0 bottom-[env(safe-area-inset-bottom)] flex flex-col lg:pointer-events-auto lg:visible lg:static lg:shrink-0 lg:items-center lg:gap-2",
                pane !== "customer" && "pointer-events-none invisible",
              )}
              aria-label="Customer phone"
              aria-hidden={compact && pane !== "customer" ? true : undefined}
            >
              <span className="hidden text-xs font-semibold tracking-wide text-white/60 uppercase lg:block">Customer · phone</span>
              <div className="h-full w-full overflow-hidden bg-black lg:h-[740px] lg:max-h-[calc(100dvh-140px)] lg:min-h-[600px] lg:w-[360px] lg:max-w-full lg:rounded-[30px] lg:border-[7px] lg:border-[#1f2a3d] lg:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
                <iframe key={run.customer} src={run.customer} title="Customer view" className="block h-full w-full border-0" allow="camera; microphone; autoplay" />
              </div>
            </section>
            <section
              className={cx(
                "absolute inset-x-0 top-0 bottom-[env(safe-area-inset-bottom)] flex flex-col bg-canvas lg:pointer-events-auto lg:visible lg:static lg:min-h-[740px] lg:min-w-0 lg:flex-1 lg:gap-2 lg:bg-transparent",
                pane !== "agent" && "pointer-events-none invisible",
              )}
              aria-label="Agent console"
              aria-hidden={compact && pane !== "agent" ? true : undefined}
            >
              <span className="hidden text-xs font-semibold tracking-wide text-white/60 uppercase lg:block">Human Agent Console</span>
              <div className="min-h-0 flex-1 overflow-hidden bg-white lg:rounded-lg">
                <iframe key={run.console} src={run.console} title="Agent console" className="block h-full w-full border-0 lg:min-h-[700px]" />
              </div>
            </section>
            {compact && hint && hint !== pane && (
              <button
                type="button"
                onClick={() => choosePane(hint)}
                className="absolute top-2.5 left-1/2 z-10 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-navy/95 px-4 text-[13px] font-medium whitespace-nowrap text-white shadow-lg ring-1 ring-white/20 backdrop-blur"
              >
                {hint === "agent" ? <Headset className="size-4 text-[#9db8f5]" aria-hidden /> : <Smartphone className="size-4 text-[#9db8f5]" aria-hidden />}
                {hint === "agent" ? "Agent view updated" : "Customer view updated"}
                <span className="text-white/60">· tap to see</span>
              </button>
            )}
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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-7 pb-10 sm:px-5 sm:py-14">
      <p className="text-xs font-semibold tracking-[0.12em] text-white/50 uppercase">Interactive demo</p>
      <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight sm:text-3xl">Router Visual Support, end to end</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/70">
        Choose a scenario and press play. You&apos;ll see the customer&apos;s phone and the support agent&apos;s console
        <span className="lg:hidden"> (switch between them at any time)</span>
        <span className="hidden lg:inline"> side by side</span>, with a caption explaining what the product is doing at each step. The assistant speaks
        in a British voice, so turn your sound on. A session takes about two minutes.
      </p>

      <fieldset className="mt-6 sm:mt-8">
        <legend className="sr-only">Scenario</legend>
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
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
                <span className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2 text-[15px] font-semibold">
                    <span className={cx("flex size-4 shrink-0 items-center justify-center rounded-full border", on ? "border-brand bg-brand" : "border-white/35")} aria-hidden>
                      {on && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                    {f.title}
                  </span>
                  <span className={cx("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", f.outcome === "ai" ? "bg-ok/20 text-[#7be3ae]" : "bg-violet/25 text-[#c9b8ff]")}>
                    {f.outcome === "ai" ? "Resolved by AI" : "Human takeover"}
                  </span>
                </span>
                <span className="mt-1.5 block pl-6 text-[13px] leading-relaxed text-white/65">{f.body}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-4 flex flex-col gap-1.5 text-xs text-white/60 sm:flex-row sm:items-center sm:gap-2">
        More scenarios
        <select
          value={more.some((s) => s.key === scenario) ? scenario : ""}
          onChange={(e) => e.target.value && setScenario(e.target.value)}
          className="h-11 w-full rounded-md border border-white/20 bg-navy-2 px-3 text-sm text-white sm:h-8 sm:w-auto sm:px-2 sm:text-xs"
        >
          <option value="">Choose…</option>
          {more.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {selected && !FEATURED.some((f) => f.key === selected.key) && (
        <p className="mt-3 text-[13px] text-white/65">
          <span className="font-semibold text-white">{selected.name}:</span> {selected.description} Expected outcome: {selected.expectedOutcome.toLowerCase()}.
        </p>
      )}

      {/* Phones: the actions stay in reach at the bottom of the screen. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-5 border-t border-white/10 bg-navy/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <button
            type="button"
            aria-label="Play the walkthrough"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-3 text-[15px] font-semibold whitespace-nowrap text-white hover:bg-brand-ink disabled:opacity-60 sm:h-11 sm:px-5 sm:text-sm"
            disabled={busy}
            onClick={() => onStart(scenario, true)}
          >
            <PlayCircle className="size-4.5 shrink-0" aria-hidden />
            <span className="min-[400px]:hidden">Play walkthrough</span>
            <span className="hidden min-[400px]:inline">Play the walkthrough</span>
          </button>
          <button
            type="button"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/25 px-3 text-[15px] font-semibold whitespace-nowrap text-white hover:bg-white/10 disabled:opacity-60 sm:h-11 sm:px-5 sm:text-sm"
            disabled={busy}
            onClick={() => onStart(scenario, false)}
          >
            <Play className="size-4" aria-hidden /> Try it yourself
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 text-[13px] leading-relaxed text-white/60 sm:mt-10 sm:grid-cols-3">
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
              <button type="button" onClick={onReset} className="inline-flex min-h-11 items-center gap-1 text-white/80 underline-offset-2 hover:underline sm:min-h-0">
                <RotateCcw className="size-3" aria-hidden /> Reset demo data
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

/** Phones: back, the Customer | Agent switch and pause, in one sticky bar. */
function MobileBar({
  pane,
  hint,
  onPane,
  onBack,
  showPause,
  paused,
  onToggle,
}: {
  pane: Pane;
  hint?: Pane;
  onPane: (p: Pane) => void;
  onBack: () => void;
  showPause: boolean;
  paused: boolean;
  onToggle: () => void;
}) {
  const tabs: [Pane, string, React.ReactNode][] = [
    ["customer", "Customer", <Smartphone key="c" className="size-4" aria-hidden />],
    ["agent", "Agent", <Headset key="a" className="size-4" aria-hidden />],
  ];
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-white/10 bg-navy px-2 pt-[env(safe-area-inset-top)]">
      <button type="button" onClick={onBack} aria-label="All scenarios" className="flex size-11 shrink-0 items-center justify-center rounded-md text-white/80 hover:bg-white/10">
        <ArrowLeft className="size-5" aria-hidden />
      </button>
      <div role="tablist" aria-label="Choose view" className="my-1.5 flex flex-1 rounded-[10px] bg-white/[0.08] p-0.5 ring-1 ring-white/10">
        {tabs.map(([key, label, icon]) => {
          const on = pane === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onPane(key)}
              className={cx(
                "relative flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-[14px] font-semibold transition-colors",
                on ? "bg-white text-navy shadow-sm" : "text-white/70 hover:text-white",
              )}
            >
              {icon}
              {label}
              {hint === key && !on && <span className="size-2 rounded-full bg-[#5b8cf0] va-pulse" aria-label="updated" />}
            </button>
          );
        })}
      </div>
      {showPause ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={paused ? "Resume walkthrough" : "Pause walkthrough"}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-white/80 hover:bg-white/10"
        >
          {paused ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
        </button>
      ) : (
        <span className="size-11 shrink-0" aria-hidden />
      )}
    </header>
  );
}

function Progress({ decision, reached, className }: { decision?: DirectorDecision; reached: Set<WalkthroughStage>; className?: string }) {
  return (
    <ol className={cx("flex gap-1", className)} aria-label="Progress">
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
  );
}

/** Phones: a compact, collapsible caption card above the views. */
function MobileCaption({
  decision,
  reached,
  paused,
  onReplay,
  onBack,
  recordHref,
}: {
  decision?: DirectorDecision;
  reached: Set<WalkthroughStage>;
  paused: boolean;
  onReplay: () => void;
  onBack: () => void;
  recordHref: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const done = Boolean(decision?.done);
  const open = done || !collapsed;
  const index = STAGES.findIndex((s) => s.key === decision?.stage);
  const current = STAGES[index];
  const label = done ? "Walkthrough complete" : paused ? `Paused · ${current?.label ?? "Starting"}` : current?.label ?? "Starting";
  return (
    <section className="border-b border-white/10 bg-navy-2 px-4 pt-2.5 pb-2" aria-live="polite" aria-label="Walkthrough caption">
      <Progress decision={decision} reached={reached} />
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        disabled={done}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 text-left disabled:cursor-default"
      >
        <span className="tabular shrink-0 text-[11px] font-semibold text-white/45">{done ? `${STAGES.length}/${STAGES.length}` : `${Math.max(index + 1, 1)}/${STAGES.length}`}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-wide text-white/75 uppercase">{label}</span>
        {!done && <ChevronDown className={cx("size-4 shrink-0 text-white/60 transition-transform", open && "rotate-180")} aria-label={open ? "Hide caption" : "Show caption"} />}
      </button>
      {open && <p className="pb-1 text-[14px] leading-snug text-white">{decision?.caption ?? "Starting the walkthrough…"}</p>}
      {done && (
        <div className="mt-2.5 grid grid-cols-2 gap-2 pb-1">
          <a href={recordHref} target="_blank" rel="noreferrer" className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white text-[14px] font-semibold text-navy hover:bg-white/90">
            <ExternalLink className="size-4" aria-hidden /> Open the session record
          </a>
          <button type="button" onClick={onReplay} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/25 text-[14px] font-semibold text-white hover:bg-white/10">
            <RotateCcw className="size-4" aria-hidden /> Replay
          </button>
          <button type="button" onClick={onBack} className="inline-flex h-11 items-center justify-center rounded-md border border-white/25 text-[14px] font-semibold text-white hover:bg-white/10">
            Try another scenario
          </button>
        </div>
      )}
    </section>
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
      <Progress decision={decision} reached={reached} className="mt-3" />
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
  // The customer page reports when the assistant is speaking (ElevenLabs
  // voice); scripted moves wait for the end of the sentence.
  const speech = useRef({ speaking: false, endedAt: 0 });

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "va-speaking") return;
      const speaking = Boolean(e.data.speaking);
      if (speech.current.speaking && !speaking) speech.current.endedAt = Date.now();
      speech.current.speaking = speaking;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

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
      const scheduledAt = Date.now();
      timer.current = {
        key: next.key,
        handle: setTimeout(function fire() {
          if (pausedRef.current || sent.current.has(next.key)) {
            timer.current = null;
            return;
          }
          // Hold while the assistant is mid-sentence (and a beat after), up to 30 s.
          const waitedLong = Date.now() - scheduledAt > next.delayMs + 30_000;
          if (!waitedLong && (speech.current.speaking || Date.now() - speech.current.endedAt < 700)) {
            if (timer.current) timer.current.handle = setTimeout(fire, 250);
            return;
          }
          timer.current = null;
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
          let d = direct(view.state, agentId);
          // Playing the agent: the viewer makes the agent's moves; the caption says what to do.
          if (run.playAs === "agent" && d.next?.actor === "agent") d = { ...d, caption: agentTurn(d.next.key), next: undefined };
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
