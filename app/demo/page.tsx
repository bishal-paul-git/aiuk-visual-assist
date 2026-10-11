"use client";

import { useState } from "react";
import Link from "next/link";
import { FlaskConical, Play, RotateCcw } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClass, cx } from "@/components/ui/primitives";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { BASE_PATH, getTransport, STATIC_DEMO } from "@/lib/client/transport";

/**
 * Demo stage: the customer's phone and the agent console side by side for one
 * new session. Works in both editions; in the static (GitHub Pages) edition
 * both panes share the in-browser runtime.
 */
export default function DemoStage() {
  const [scenario, setScenario] = useState("wan_down");
  const [paths, setPaths] = useState<{ customer: string; console: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(undefined);
    const t = await getTransport();
    const r = await t.createSession({ workflowKey: "router-troubleshooting", tenantId: "tnt_northline", scenario, channel: "secure_link" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPaths({ customer: `${BASE_PATH}${r.customerPath}`, console: `${BASE_PATH}${r.consolePath}` });
  }

  async function reset() {
    if (!window.confirm("Clear all demo sessions stored in this browser?")) return;
    const m = await import("@/lib/client/browser-transport");
    m.resetDemo();
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen flex-col bg-navy text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="rounded-md">
            <Logo inverted />
          </Link>
          <span className="hidden text-sm text-white/70 md:inline">Demo stage — customer phone and agent console, side by side</span>
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
          <button type="button" className={buttonClass("primary", "sm")} disabled={busy} onClick={() => void start()}>
            <Play className="size-3.5" aria-hidden /> {paths ? "New session" : "Start session"}
          </button>
          {STATIC_DEMO && (
            <button type="button" className={cx(buttonClass("ghost", "sm"), "text-white/80 hover:bg-white/10")} onClick={() => void reset()}>
              <RotateCcw className="size-3.5" aria-hidden /> Reset demo data
            </button>
          )}
        </div>
      </header>
      {error && <p className="bg-danger px-4 py-2 text-sm">{error}</p>}
      {!paths ? (
        <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Router Visual Support, end to end</h1>
          <p className="mt-3 text-sm text-white/70">
            Pick a scenario and start a session. On the left you are the customer: accept the notice, choose <strong>Use demo camera</strong>, and
            type your problem. On the right you are the support agent: watch the AI work, then join and take over when it escalates.
          </p>
          <p className="mt-3 text-xs text-white/50">
            {SCENARIOS.find((s) => s.key === scenario)?.description} Expected: {SCENARIOS.find((s) => s.key === scenario)?.expectedOutcome}.
          </p>
          {STATIC_DEMO && (
            <p className="mt-6 rounded-md border border-white/15 px-3 py-2 text-xs text-white/60">
              Static demo: everything runs in this browser. Tabs on this device stay in sync; other devices can&apos;t join these sessions.
            </p>
          )}
        </main>
      ) : (
        <main className="flex flex-1 flex-col gap-3 p-3 lg:flex-row">
          <section className="flex shrink-0 flex-col items-center gap-2" aria-label="Customer phone">
            <span className="text-xs font-semibold text-white/80">Customer · phone</span>
            <div className="h-[760px] w-[360px] overflow-hidden rounded-[28px] border-[6px] border-[#1f2a3d] bg-black">
              <iframe key={paths.customer} src={paths.customer} title="Customer view" className="h-full w-full border-0" allow="camera; microphone; autoplay" />
            </div>
          </section>
          <section className="flex min-h-[760px] min-w-0 flex-1 flex-col gap-2" aria-label="Agent console">
            <span className="text-xs font-semibold text-white/80">Human Agent Console</span>
            <div className="flex-1 overflow-hidden rounded-lg bg-white">
              <iframe key={paths.console} src={paths.console} title="Agent console" className="h-full w-full border-0" />
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
