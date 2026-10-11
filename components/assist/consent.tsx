"use client";

import { Camera, Clock, EyeOff, Headset, ImageIcon, Lock, Mic, MonitorSmartphone } from "lucide-react";
import type { CustomerView } from "@/lib/session/projections";

export const NOTICE_VERSION = "privacy-notice@2";

export function ConsentScreen({ view, onAccept, onDecline }: { view: CustomerView; onAccept: () => void; onDecline: () => void }) {
  const retained = view.evidenceMode === "retained_evidence";
  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-ink">
      <BrandBar view={view} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Show us the problem</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Talk to our visual assistant and point your phone camera at the issue. It&apos;s quicker than describing it — and a member of the team can
          join at any time.
        </p>
        <ul className="mt-6 space-y-4 text-[14px] leading-snug">
          <Item icon={<Camera className="size-5" />} title="Your camera and microphone are used during this session only">
            Nothing is installed. The session ends when you close it.
          </Item>
          <Item icon={<ImageIcon className="size-5" />} title="We don't record video">
            {retained
              ? "Only a few still images needed to solve the problem are saved to your case, under our retention policy."
              : "Still images are used during the session only and are not kept afterwards."}
          </Item>
          <Item icon={<Headset className="size-5" />} title="A person can join whenever you want">
            Tap “Human help” or just ask. They&apos;ll see what&apos;s already been done.
          </Item>
          <Item icon={<EyeOff className="size-5" />} title="Please keep people, ID and bank cards out of view">
            Point the camera only at the equipment or problem.
          </Item>
        </ul>
        <div className="mt-auto pt-8">
          <button
            type="button"
            onClick={onAccept}
            className="flex h-12 w-full items-center justify-center rounded-lg text-[15px] font-semibold text-white"
            style={{ background: view.brandColor }}
          >
            Agree and continue
          </button>
          <button type="button" onClick={onDecline} className="mt-2 h-11 w-full rounded-lg text-[14px] font-medium text-ink-2 hover:bg-surface-2">
            No thanks
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <Lock className="size-3" aria-hidden /> Secure session {view.reference} · Privacy notice v2
          </p>
        </div>
      </main>
    </div>
  );
}

export function PermissionScreen({
  view,
  error,
  busy,
  onEnable,
  onDemo,
  onVoiceOnly,
}: {
  view: CustomerView;
  error?: string;
  busy: boolean;
  onEnable: () => void;
  onDemo?: () => void;
  onVoiceOnly: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-ink">
      <BrandBar view={view} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
        <div className="flex gap-3 text-brand" aria-hidden>
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft">
            <Camera className="size-6" />
          </span>
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft">
            <Mic className="size-6" />
          </span>
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Turn on your camera and microphone</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Your browser will ask for permission. We use the back camera so you can point it at the problem.
        </p>
        {error && (
          <div role="alert" className="mt-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[14px] text-danger">
            {error}
          </div>
        )}
        <div className="mt-auto space-y-2 pt-8">
          <button
            type="button"
            onClick={onEnable}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center rounded-lg text-[15px] font-semibold text-white disabled:opacity-60"
            style={{ background: view.brandColor }}
          >
            {busy ? "Starting camera…" : error ? "Try again" : "Turn on camera"}
          </button>
          {onDemo && (
            <button type="button" onClick={onDemo} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong text-[14px] font-medium">
              <MonitorSmartphone className="size-4" aria-hidden /> Use demo camera (test session)
            </button>
          )}
          <button type="button" onClick={onVoiceOnly} className="h-11 w-full rounded-lg text-[14px] font-medium text-ink-2 hover:bg-surface-2">
            Continue with voice only
          </button>
        </div>
      </main>
    </div>
  );
}

export function EndedScreen({ view }: { view: CustomerView }) {
  const resolved = view.transcript.length > 0 && view.status === "completed";
  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-ink">
      <BrandBar view={view} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-ok-soft text-ok" aria-hidden>
          <Clock className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Session ended</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          {resolved ? "Thanks for showing us. Everything from this session has been added to your case." : "Thanks — you can close this page."}
        </p>
        <p className="mt-6 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-2">
          Reference <span className="font-semibold text-ink">{view.reference}</span>
        </p>
        <p className="mt-2 text-xs text-muted">Quote this if you contact {view.brandName} again — you won&apos;t need to start over.</p>
      </main>
    </div>
  );
}

function BrandBar({ view }: { view: CustomerView }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-line px-5">
      <span className="flex items-center gap-2 text-[15px] font-semibold">
        <span className="size-6 rounded-md" style={{ background: view.brandColor }} aria-hidden />
        {view.brandName}
      </span>
      <span className="text-xs text-muted">Visual support</span>
    </header>
  );
}

function Item({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-ink-2">{children}</span>
      </span>
    </li>
  );
}
