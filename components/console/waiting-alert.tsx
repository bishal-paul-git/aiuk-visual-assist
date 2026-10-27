"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BellRing, BellOff, X } from "lucide-react";
import { useLiveSessions } from "@/lib/client/use-transport";
import { useIdentity } from "@/lib/client/identity";
import { tenantScope } from "@/lib/auth/rbac";
import { consolePath } from "@/lib/client/transport";
import { cx } from "@/components/ui/primitives";

const PREF_KEY = "va_alert_sound";

/** Two rising tones, played with Web Audio so no sound file is needed. Repeats until someone joins. */
function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  for (const [i, f] of [660, 880, 660, 880].entries()) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const at = t + i * 0.22;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + 0.21);
  }
}

/**
 * Tells a human agent, wherever they are in the console or portal, that a
 * customer is waiting: a sound (repeated every 15 s until someone joins), a
 * banner with a Join button, a flashing tab title and a desktop notification.
 * Browsers only allow sound after a click, so the bell button switches it on.
 */
export function WaitingAlert({ variant = "light" }: { variant?: "light" | "navy" }) {
  const { data: all } = useLiveSessions([]);
  const id = useIdentity();
  const scope = id.status === "signed_in" ? tenantScope({ ...id.user, status: "active" }) : undefined;
  const waiting = all.filter((s) => s.status === "escalated" && (!scope || s.tenantId === scope));
  const [soundOn, setSoundOn] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const enable = async () => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctxRef.current ??= new Ctx();
    await ctxRef.current.resume().catch(() => undefined);
    chime(ctxRef.current);
    setSoundOn(true);
    try {
      localStorage.setItem(PREF_KEY, "1");
    } catch {
      /* private mode */
    }
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  };

  // Remember the choice; the first click anywhere re-enables sound after a reload.
  useEffect(() => {
    let wanted = false;
    try {
      wanted = localStorage.getItem(PREF_KEY) === "1";
    } catch {
      /* private mode */
    }
    if (!wanted) return;
    const once = () => void enable();
    window.addEventListener("pointerdown", once, { once: true });
    return () => window.removeEventListener("pointerdown", once);
     
  }, []);

  const ids = waiting.map((s) => s.id).join(",");
  // A new customer waiting: notify once.
  useEffect(() => {
    const now = new Set(ids ? ids.split(",") : []);
    if (seen.current === null) {
      seen.current = now;
      return;
    }
    const fresh = [...now].filter((x) => !seen.current!.has(x));
    seen.current = now;
    if (!fresh.length) return;
    if (soundOn && ctxRef.current) chime(ctxRef.current);
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      const s = waiting.find((w) => w.id === fresh[0]);
      new Notification("A customer is waiting for a person", { body: s?.escalation?.reasonDetail ?? "Open the live queue to join.", tag: fresh[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  // Keep reminding while someone waits.
  useEffect(() => {
    if (!ids || !soundOn) return;
    const t = setInterval(() => ctxRef.current && chime(ctxRef.current), 15_000);
    return () => clearInterval(t);
  }, [ids, soundOn]);

  // Flash the tab title so a background tab is noticed.
  useEffect(() => {
    if (!ids) return;
    const original = document.title;
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `🔔 Customer waiting (${ids.split(",").length})` : original;
    }, 1000);
    return () => {
      clearInterval(t);
      document.title = original;
    };
  }, [ids]);

  // Not while already looking at that customer's session.
  const path = usePathname();
  const query = useSearchParams();
  const here = (sid: string) => path.endsWith(`/${sid}`) || query.get("id") === sid;
  // Newest first: the customer who has just asked is the one the agent heard.
  const others = waiting
    .filter((s) => !dismissed.includes(s.id) && !here(s.id))
    .sort((x, y) => (y.escalation?.requestedAt ?? "").localeCompare(x.escalation?.requestedAt ?? ""));
  const banner = others[0];

  return (
    <>
      <button
        type="button"
        onClick={() => (soundOn ? setSoundOn(false) : void enable())}
        className={cx(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
          variant === "navy" ? "text-white hover:bg-white/10" : "border border-line text-ink hover:bg-surface-2",
          !soundOn && waiting.length > 0 && "va-pulse",
        )}
        aria-label={soundOn ? "Turn off waiting-customer sound" : "Turn on waiting-customer sound"}
      >
        {soundOn ? <BellRing className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
        <span className="hidden sm:inline">{soundOn ? "Alerts on" : "Turn on alerts"}</span>
      </button>
      {banner && (
        <div role="status" aria-live="assertive" data-testid="waiting-alert" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-50 sm:bottom-6 mx-auto flex max-w-lg items-center gap-3 rounded-xl bg-danger px-4 py-3 text-white shadow-lg">
          <BellRing className="size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">A customer is waiting for a person</p>
            <p className="truncate text-xs text-white/85">
              {banner.reference} · {banner.escalation?.reasonDetail ?? "They asked for help."}
              {others.length > 1 && ` · ${others.length - 1} more waiting`}
            </p>
          </div>
          <Link href={consolePath(banner.id)} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-danger">
            Join now
          </Link>
          <button type="button" onClick={() => setDismissed((d) => [...d, banner.id])} aria-label="Hide" className="shrink-0 rounded p-1 hover:bg-white/15">
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
