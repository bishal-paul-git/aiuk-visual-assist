"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, FlaskConical, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClass, cx } from "@/components/ui/primitives";
import { useAgentId } from "@/components/console/agent-identity";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { BASE_PATH, getTransport, STATIC_DEMO, type Transport } from "@/lib/client/transport";
import { direct, reachedStages, STAGES, type DirectorDecision, type WalkthroughStage } from "@/lib/demo/walkthrough";

type Run = { id: string; customer: string; console: string; autoplay: boolean };

const withQuery = (path: string, q: string) => `${path}${path.includes("?") ? "&" : "?"}${q}`;

/**
 * Demo stage: the customer's phone and the agent console side by side for one
 * new session. "Play walkthrough" scripts both sides through the normal
 * commands so anyone can watch the whole router loop without a camera.
 * Works in both editions; in the static (GitHub Pages) edition both panes
 * share the in-browser runtime.
 */
export default function DemoStage() {
  const [scenario, setScenario] = useState("wan_down");
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const agentId = useAgentId();
  const walkthrough = useWalkthrough(run, agentId);

  async function start(autoplay: boolean) {
    setBusy(true);
    setError(undefined);
    const t = await getTransport();
    const r = await t.createSession({ workflowKey: "router-troubleshooting", tenantId: "tnt_northline", scenario, channel: "secure_link" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setRun({
      id: r.id,
      customer: `${BASE_PATH}${autoplay ? withQuery(r.customerPath, "autoplay=1") : r.customerPath}`,
      console: `${BASE_PATH}${r.consolePath}`,
      autoplay,
    });
  }

  async function reset() {
    if (!window.confirm("Clear all demo sessions stored in this browser?")) return;
    const m = await import("@/lib/client/browser-transport");
    m.resetDemo();
    window.location.reload();
  }

  const def = SCENARIOS.find((s) => s.key === scenario);

  return (
    <div className="flex min-h-screen flex-col bg-navy text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="rounded-md">
            <Logo inverted />
          </Link>
          <span className="hidden text-sm text-white/70 md:inline">Demo stage: customer phone and agent console, side by side</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-white/80">
            <FlaskConical className="size-3.5" aria-hidden /> Scenario
            <select value={scenario} onChange={(e) => setScenario(e.target.value)} className="h-8 rounded-md border border-white/20 bg-navy-2 px-2 text-xs text-white">
              {SCENARIOS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={buttonClass("primary", "sm")} disabled={busy} onClick={() => void start(true)}>
            <Sparkles className="size-3.5" aria-hidden /> Play walkthrough
          </button>
          <button type="button" className={cx(buttonClass("secondary", "sm"))} disabled={busy} onClick={() => void start(false)}>
            <Play className="size-3.5" aria-hidden /> {run ? "New session (you drive)" : "Start session (you drive)"}
          </button>
          {STATIC_DEMO && (
            <button type="button" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10")} onClick={() => void reset()}>
              <RotateCcw className="size-3.5" aria-hidden /> Reset demo data
            </button>
          )}
        </div>
      </header>
      {error && <p className="bg-danger px-4 py-2 text-sm">{error}</p>}
      {!run ? (
        <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Router Visual Support, end to end</h1>
          <p className="mt-3 text-sm text-white/70">
            <strong>Play walkthrough</strong> runs the whole session for you, with a caption explaining each step. To try it yourself, choose{" "}
            <strong>Start session</strong>. On the left you are the customer: accept the notice, choose <strong>Use demo camera</strong> and type your problem.
            On the right you are the support agent: watch the AI work, then join and take over when it escalates.
          </p>
          <p className="mt-3 text-xs text-white/50">
            {def?.description} Expected: {def?.expectedOutcome}.
          </p>
          {STATIC_DEMO && (
            <p className="mt-6 rounded-md border border-white/15 px-3 py-2 text-xs text-white/60">
              Static demo: everything runs in this browser. Tabs on this device stay in sync; other devices can&apos;t join these sessions.
            </p>
          )}
        </main>
      ) : (
        <>
          {run.autoplay && <Narration decision={walkthrough.decision} reached={walkthrough.reached} paused={walkthrough.paused} onToggle={walkthrough.toggle} />}
          <main className="flex flex-1 flex-col gap-3 p-3 lg:flex-row">
            <section className="flex shrink-0 flex-col items-center gap-2" aria-label="Customer phone">
              <span className="text-xs font-semibold text-white/80">Customer · phone</span>
              <div className="h-[760px] w-[360px] max-w-full overflow-hidden rounded-[28px] border-[6px] border-[#1f2a3d] bg-black">
                <iframe key={run.customer} src={run.customer} title="Customer view" className="h-full w-full border-0" allow="camera; microphone; autoplay" />
              </div>
            </section>
            <section className="flex min-h-[760px] min-w-0 flex-1 flex-col gap-2" aria-label="Agent console">
              <span className="text-xs font-semibold text-white/80">Human Agent Console</span>
              <div className="flex-1 overflow-hidden rounded-lg bg-white">
                <iframe key={run.console} src={run.console} title="Agent console" className="h-full w-full border-0" />
              </div>
            </section>
          </main>
        </>
      )}
    </div>
  );
}

function Narration({
  decision,
  reached,
  paused,
  onToggle,
}: {
  decision?: DirectorDecision;
  reached: Set<WalkthroughStage>;
  paused: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/10 bg-navy-2 px-4 py-3" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-4xl text-[15px] leading-snug text-white">{decision?.caption ?? "Starting the walkthrough…"}</p>
        {!decision?.done && (
          <button type="button" className={cx(buttonClass("ghost", "sm"), "shrink-0 text-white/80 hover:bg-white/10")} onClick={onToggle}>
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />} {paused ? "Resume" : "Pause"}
          </button>
        )}
      </div>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {STAGES.map((st) => {
          const done = reached.has(st.key);
          const current = decision?.stage === st.key && !decision.done;
          return (
            <li key={st.key} className={cx("flex items-center gap-1 text-[11px]", current ? "font-semibold text-white" : done ? "text-white/75" : "text-white/40")}>
              {done ? <CheckCircle2 className="size-3 text-ok" aria-hidden /> : <Circle className="size-3" aria-hidden />}
              {st.label}
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
