"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, Copy, ExternalLink, FlaskConical, Headset, Loader2, MessageSquare, Smartphone, Sparkles, User as UserIcon } from "lucide-react";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { BASE_PATH, STATIC_DEMO, getTransport, type LinkDelivery } from "@/lib/client/transport";
import type { AgentView } from "@/lib/session/projections";
import { coachFor } from "@/lib/session/trial-coach";
import { normalisePhone } from "@/lib/notifications/validate";
import { buttonClass, cx } from "@/components/ui/primitives";

interface Created {
  id: string;
  customerPath: string;
  consolePath: string;
  delivery?: LinkDelivery[];
}

type Mode = "live" | "guided";

/**
 * The heart of the client trial: start one conversation, then play both sides
 * of it. A live strip says whose turn it is and what to do, taken from the
 * real session as it happens.
 */
export function TrialFlow({
  tenantId,
  workflowKey,
  workflowName,
  hasExamples,
  liveAi,
  sms,
  canStart,
  reportHref,
}: {
  tenantId: string;
  workflowKey: string;
  workflowName: string;
  /** The workflow has scripted examples (Northline's router journey). */
  hasExamples: boolean;
  /** Real AI is switched on for this server (always false in the online demo). */
  liveAi: boolean;
  /** Text messages are switched on. */
  sms: boolean;
  canStart: boolean;
  /** Where the full record of a session lives, e.g. `/client/sessions`. */
  reportHref: string;
}) {
  const [mode, setMode] = useState<Mode>(liveAi || !hasExamples ? "live" : "guided");
  const [example, setExample] = useState(SCENARIOS[0].key);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<Created>();
  const router = useRouter();

  async function start() {
    setError(undefined);
    const deliverTo: { sms?: string } = {};
    if (!STATIC_DEMO && sms && phone.trim()) {
      const p = normalisePhone(phone);
      if (!p) return setError("Enter the mobile number with its country code, for example +44 7700 900123.");
      deliverTo.sms = p;
    }
    setBusy(true);
    try {
      const t = await getTransport();
      const r = await t.createSession({
        workflowKey,
        tenantId,
        scenario: mode === "live" ? "live" : example,
        channel: deliverTo.sms ? "sms" : "secure_link",
        ...(deliverTo.sms ? { deliverTo } : {}),
      });
      if (!r.ok) throw new Error(r.error);
      setCreated(r);
      // Refresh the page's own lists (latest conversations) now that there is a new session.
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canStart) return null;
  if (created) return <TwoSides created={created} reportHref={reportHref} onAgain={() => setCreated(undefined)} />;

  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="start-title">
      <h2 id="start-title" className="text-lg font-semibold text-ink">
        Start a conversation
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        You&apos;ll be both people in it: the customer who needs help, and the agent who steps in. Pick how the AI should see the problem. <span className="text-muted">({workflowName})</span>
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">How should the AI see the problem?</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <ModeCard
            checked={mode === "live"}
            disabled={!liveAi}
            onSelect={() => setMode("live")}
            icon={<Sparkles className="size-4 text-brand" aria-hidden />}
            title="Real AI with a real camera"
            body={
              liveAi
                ? "Use your phone's camera and voice. The AI genuinely looks at what you show it, so try your own router, a blurry shot, or something that isn't a router at all."
                : "Not switched on in this version of the trial."
            }
          />
          {hasExamples && (
            <ModeCard
              checked={mode === "guided"}
              onSelect={() => setMode("guided")}
              icon={<FlaskConical className="size-4 text-brand" aria-hidden />}
              title="Guided example (no camera needed)"
              body="A ready-made story. The AI's answers are pre-written and a practice camera stands in for a real one, so you can see every outcome, including the hand-over to a person."
            />
          )}
        </div>
      </fieldset>

      {mode === "guided" && hasExamples && (
        <label className="mt-4 block max-w-xl">
          <span className="mb-1 block text-sm font-medium text-ink">Which example?</span>
          <select value={example} onChange={(e) => setExample(e.target.value)} className="h-10 w-full rounded-md border border-line-strong bg-surface px-2 text-sm">
            {SCENARIOS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">{SCENARIOS.find((s) => s.key === example)?.expectedOutcome}</span>
        </label>
      )}

      {!STATIC_DEMO && (
        <label className="mt-4 block max-w-xl">
          <span className="mb-1 block text-sm font-medium text-ink">
            Text the customer link to a phone <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+44 7700 900123"
            value={phone}
            disabled={!sms}
            onChange={(e) => setPhone(e.target.value)}
            className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm disabled:opacity-60"
          />
          <span className="mt-1 block text-xs text-muted">{sms ? "The customer gets a text with a secure link. They tap it and they're in." : "Text messages aren't switched on in this trial. You'll get a link to open yourself."}</span>
        </label>
      )}

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5">
        <button type="button" className={cx(buttonClass("primary"), "h-11 px-6 text-[15px]")} disabled={busy} onClick={start}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {busy ? "Starting…" : "Start the conversation"}
        </button>
      </div>
    </section>
  );
}

function ModeCard({ checked, disabled, onSelect, icon, title, body }: { checked: boolean; disabled?: boolean; onSelect: () => void; icon: React.ReactNode; title: string; body: string }) {
  return (
    <label className={cx("flex gap-3 rounded-lg border p-3.5", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", checked ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2")}>
      <input type="radio" name="trial-mode" checked={checked} disabled={disabled} onChange={onSelect} className="mt-1 accent-brand" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
          {icon} {title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">{body}</span>
      </span>
    </label>
  );
}

const SPEAKER: Record<string, { label: string; icon: React.ReactNode }> = {
  customer: { label: "Customer", icon: <UserIcon className="size-3.5" aria-hidden /> },
  ai: { label: "AI", icon: <Bot className="size-3.5" aria-hidden /> },
  human_agent: { label: "Agent", icon: <Headset className="size-3.5" aria-hidden /> },
  system: { label: "Update", icon: <MessageSquare className="size-3.5" aria-hidden /> },
};

function TwoSides({ created, reportHref, onAgain }: { created: Created; reportHref: string; onAgain: () => void }) {
  const [view, setView] = useState<AgentView>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void getTransport().then((t) => {
      if (cancelled) return;
      void t.agentSnapshot(created.id).then((v) => !cancelled && v && setView(v));
      off = t.subscribeAgent(created.id, (v) => !cancelled && setView(v), () => undefined);
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [created.id]);

  const step = coachFor(view?.state);
  const customerHref = `${BASE_PATH}${created.customerPath}`;
  const agentHref = `${BASE_PATH}${created.consolePath}`;
  const link = typeof window !== "undefined" ? `${window.location.origin}${customerHref}` : customerHref;
  const sent = created.delivery?.find((d) => d.channel === "sms");
  const recent = (view?.state.transcript ?? []).filter((t) => t.speaker !== "system" || /joined/.test(t.text)).slice(-4);
  const live = view?.state.session.scenario === undefined;

  return (
    <section aria-labelledby="play-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="play-title" className="text-lg font-semibold text-ink">
          Your conversation is live
        </h2>
        <button type="button" onClick={onAgain} className="text-xs font-medium text-brand hover:underline">
          Start a different one
        </button>
      </div>

      <div
        className={cx(
          "mt-3 rounded-xl border p-4 sm:p-5",
          step.tone === "done" ? "border-ok/30 bg-ok-soft" : step.actor === "agent" ? "border-violet/30 bg-violet-soft" : "border-brand/30 bg-brand-soft",
        )}
        role="status"
        aria-live="polite"
        data-testid="trial-coach"
        data-step={step.key}
      >
        <p className="text-[11px] font-semibold tracking-wide text-ink-2 uppercase">
          {step.actor === "customer" ? "Next: on the customer screen" : step.actor === "agent" ? "Next: on the agent screen" : step.tone === "done" ? "Done" : "One moment"}
        </p>
        <p className="mt-0.5 text-[16px] font-semibold text-ink">{step.title}</p>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{step.detail}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SideCard
          active={step.actor === "customer"}
          icon={<Smartphone className="size-5" aria-hidden />}
          eyebrow="Side 1"
          title="Be the customer"
          body="This is what your customer sees: the camera, the AI's voice and instructions, and a box to type in. A phone works best."
        >
          <a href={customerHref} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
            <ExternalLink className="size-4" aria-hidden /> Open customer view
          </a>
          <button
            type="button"
            className={buttonClass("secondary")}
            onClick={async () => {
              await navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy link for your phone"}
          </button>
          {sent && (
            <p className="basis-full text-xs text-ink-2">
              {sent.ok ? (sent.simulated ? `Text to ${sent.to} was recorded, not sent (texting isn't switched on).` : `Link texted to ${sent.to}.`) : `The text to ${sent.to} didn't send: ${sent.error ?? "unknown error"}. Use the link instead.`}
            </p>
          )}
          <p className="basis-full text-xs text-muted">
            {live ? "On a laptop with no camera, choose voice only or type instead." : "Using a guided example? Tap “Use demo camera” when asked."}
          </p>
        </SideCard>

        <SideCard
          active={step.actor === "agent"}
          icon={<Headset className="size-5" aria-hidden />}
          eyebrow="Side 2"
          title="Be the human agent"
          body="This is what your support agent sees: the customer's live camera, the conversation, what the AI saw, and the buttons to join, take over and help."
        >
          <a href={agentHref} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
            <ExternalLink className="size-4" aria-hidden /> Open agent screen
          </a>
          <p className="basis-full text-xs text-muted">Open it next to the customer view. Press Join session, then Take over, whenever you like or when the customer asks for a person.</p>
        </SideCard>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">What&apos;s being said</h3>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing yet. It appears here as soon as the customer says or types something.</p>
        ) : (
          <ol className="mt-2 space-y-2" aria-label="Latest messages">
            {recent.map((t) => {
              const who = SPEAKER[t.speaker] ?? SPEAKER.system;
              return (
                <li key={t.id} className="flex gap-2 text-sm">
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
                    {who.icon} {who.label}
                  </span>
                  <span className="min-w-0 text-ink">{t.text}</span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <Link href={`${reportHref}/${created.id}`} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
            <CheckCircle2 className="size-3.5" aria-hidden /> Open the full record of this conversation
          </Link>
        </div>
      </div>
    </section>
  );
}

function SideCard({ active, icon, eyebrow, title, body, children }: { active: boolean; icon: React.ReactNode; eyebrow: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <article className={cx("flex flex-col rounded-xl border bg-surface p-5", active ? "border-brand ring-2 ring-brand/20" : "border-line")} data-active={active ? "true" : "false"}>
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-brand uppercase">
        {icon} {eyebrow}
        {active && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] text-white normal-case">Your turn</span>}
      </p>
      <h3 className="mt-2 text-[17px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>
    </article>
  );
}
