"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Captions,
  FlaskConical,
  Headset,
  Info,
  Keyboard,
  Mic,
  MicOff,
  PhoneOff,
  ScanLine,
  Send,
  SwitchCamera,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { CustomerView } from "@/lib/session/projections";
import { useCustomerStream } from "@/lib/client/use-transport";
import { captureFrame, isSourceReady, MotionMeter, type FrameSource } from "@/lib/client/frame-capture";
import { useListener, useSpeaker } from "@/lib/client/speech";
import { formatDuration } from "@/lib/format";
import { useNow } from "@/lib/client/use-now";
import { cx } from "@/components/ui/primitives";
import { CameraStage, useCamera } from "./camera";
import { ConsentScreen, EndedScreen, NOTICE_VERSION, PermissionScreen } from "./consent";

type Phase = "consent" | "permissions" | "live";
type CaptureState = { state: "idle" } | { state: "framing" } | { state: "steady"; progress: number } | { state: "sending" } | { state: "error"; message: string };
type Quality = "good" | "fair" | "poor" | "lost";

const STEADY_MS = 1200;
const SETTLE_MS = 1500;
const MAX_WAIT_MS = 9000;

export function AssistApp({ token, initial, serverNow }: { token: string; initial: CustomerView; serverNow: number }) {
  const { data: view, status: streamStatus, transport } = useCustomerStream(token, initial);
  const [phase, setPhase] = useState<Phase>(initial.customerState === "consent" ? "consent" : "live");
  const cam = useCamera();
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string>();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [capture, setCapture] = useState<CaptureState>({ state: "idle" });
  const [uploadRtt, setUploadRtt] = useState<number>();
  const sourceRef = useRef<FrameSource | null>(null);
  const meterRef = useRef<MotionMeter | null>(null);
  const capturedFor = useRef<string | null>(null);

  const ended = view.status === "completed" || view.status === "failed";
  const send = useCallback(
    async (command: Record<string, unknown>) => {
      if (!transport) return false;
      const r = await transport.customerCommand(token, command);
      if (!r.ok && r.error) setNotice(r.error);
      return r.ok;
    },
    [token, transport],
  );

  // --- Voice ----------------------------------------------------------------
  const speaker = useSpeaker(soundOn && phase === "live" && !ended);
  const lastSpoken = useRef<string | null>(initial.transcript.at(-1)?.id ?? null);
  useEffect(() => {
    if (phase !== "live") return;
    const idx = view.transcript.findIndex((t) => t.id === lastSpoken.current);
    const fresh = view.transcript.slice(idx + 1).filter((t) => t.speaker === "ai" || t.speaker === "human_agent");
    if (view.transcript.length) lastSpoken.current = view.transcript.at(-1)!.id;
    for (const t of fresh) speaker.speak(t.text);
  }, [view.transcript, phase, speaker]);

  const onFinal = useCallback(
    (text: string, confidence: number) => {
      void send({ type: "customer.utterance", text, confidence });
    },
    [send],
  );
  const listener = useListener({ active: phase === "live" && !ended && cam.micOn && !speaker.speaking, onFinal });

  // --- Session start -------------------------------------------------------
  async function startWith(mode: "camera" | "demo" | "voice") {
    setBusy(true);
    let camera = false;
    if (mode === "camera") camera = await cam.start("environment");
    else if (mode === "demo") {
      cam.useDemo();
      camera = true;
    }
    setBusy(false);
    if (mode === "camera" && !camera) return;
    await send({ type: "media.update", media: { camera, microphone: true } });
    if (view.customerState === "consent") await send({ type: "customer.consent", accepted: true, noticeVersion: NOTICE_VERSION });
    setPhase("live");
  }

  // --- Demo walkthrough: accept the notice and use the demo camera ---------
  // The demo stage opens this page with ?autoplay=1. Everything after this
  // (the conversation, the agent) is driven through the normal commands.
  const autoplay = useAutoplay();
  const startRef = useRef(startWith);
  startRef.current = startWith;
  useEffect(() => {
    if (!autoplay || ended) return;
    if (phase === "consent") {
      const t = setTimeout(() => setPhase("permissions"), 2500);
      return () => clearTimeout(t);
    }
    if (phase === "permissions") {
      const t = setTimeout(() => void startRef.current("demo"), 1500);
      return () => clearTimeout(t);
    }
  }, [autoplay, phase, ended]);

  // --- Media gateway: stability-gated evidence capture ---------------------
  const req = view.evidenceRequest;
  const doCapture = useCallback(
    async (manual: boolean) => {
      const src = sourceRef.current;
      if (!req || !isSourceReady(src) || capturedFor.current === req.id) return;
      capturedFor.current = req.id;
      const frame = captureFrame(src);
      if (!frame) return;
      setCapture({ state: "sending" });
      const trigger = manual ? "customer_capture" : req.requestedBy === "human" ? "human_request" : req.reason === "initial" ? "workflow_checkpoint" : "uncertainty_confirmation";
      const started = performance.now();
      if (!transport) return;
      const r = await transport.uploadFrame(token, { ...frame, trigger, evidenceRequestId: req.id });
      setUploadRtt(performance.now() - started);
      if (!r.ok) {
        capturedFor.current = null;
        setCapture({ state: "error", message: "That didn't send — trying again" });
      } else setCapture({ state: "idle" });
    },
    [req, token, transport],
  );

  useEffect(() => {
    if (!req || cam.mode === "none" || phase !== "live") {
      setCapture({ state: "idle" });
      return;
    }
    if (capturedFor.current === req.id) return;
    meterRef.current ??= new MotionMeter();
    meterRef.current.reset();
    const started = Date.now();
    let stable = 0;
    const timer = setInterval(() => {
      const src = sourceRef.current;
      if (!isSourceReady(src) || capturedFor.current === req.id) return;
      const diff = meterRef.current!.sample(src);
      const elapsed = Date.now() - started;
      if (elapsed < SETTLE_MS) {
        setCapture({ state: "framing" });
        return;
      }
      stable = diff !== null && diff < 7 ? stable + 200 : Math.max(0, stable - 400);
      setCapture({ state: "steady", progress: Math.min(1, stable / STEADY_MS) });
      if (stable >= STEADY_MS || elapsed > MAX_WAIT_MS) {
        clearInterval(timer);
        void doCapture(false);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [req, cam.mode, phase, doCapture]);

  // --- Low-rate preview relay while a human is present ---------------------
  useEffect(() => {
    if (!view.previewRequested || cam.mode === "none" || ended || phase !== "live") return;
    const timer = setInterval(() => {
      const src = sourceRef.current;
      if (!isSourceReady(src)) return;
      const f = captureFrame(src, 360, 0.5);
      if (f) void transport?.uploadPreview(token, f.dataUrl);
    }, 1000);
    return () => clearInterval(timer);
  }, [view.previewRequested, cam.mode, ended, phase, token, transport]);

  // --- Connection quality ---------------------------------------------------
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  useEffect(() => {
    if (streamStatus === "open") setOfflineSince(null);
    else setOfflineSince((s) => s ?? Date.now());
  }, [streamStatus]);
  const quality: Quality = offlineSince ? "lost" : uploadRtt === undefined || uploadRtt < 1200 ? "good" : uploadRtt < 3000 ? "fair" : "poor";
  const reportedQuality = useRef<Quality>("good");
  useEffect(() => {
    if (phase !== "live" || ended || quality === reportedQuality.current || quality === "lost") return;
    reportedQuality.current = quality;
    void send({ type: "media.update", media: { quality } });
  }, [quality, phase, ended, send]);

  // --- Timer -----------------------------------------------------------------
  const now = useNow(serverNow);
  const startedAt = view.transcript[0] ? Date.parse(view.transcript[0].timestamp) : now;

  const onSource = useCallback((el: FrameSource | null) => {
    sourceRef.current = el;
  }, []);

  // --- Render ----------------------------------------------------------------
  if (ended) return <EndedScreen view={view} />;
  if (phase === "consent")
    return (
      <ConsentScreen
        view={view}
        onAccept={() => setPhase("permissions")}
        onDecline={() => void send({ type: "customer.consent", accepted: false, noticeVersion: NOTICE_VERSION })}
      />
    );
  if (phase === "permissions" || (phase === "live" && cam.mode === "none" && view.customerState === "consent"))
    return (
      <PermissionScreen
        view={view}
        error={cam.error}
        busy={busy}
        onEnable={() => void startWith("camera")}
        onDemo={view.scenario ? () => void startWith("demo") : undefined}
        onVoiceOnly={() => void startWith("voice")}
      />
    );

  const s = view.customerState;
  const human = view.ownerType === "human" || s === "human_connected";
  const speakerName = view.instruction.from === "human" ? view.humanName ?? "Support" : view.instruction.from === "ai" ? view.agentName : `${view.brandName} support`;
  const lastUser = [...view.transcript].reverse().find((t) => t.speaker === "customer");
  const helpDisabled = s === "escalating" || human;
  const quickReplies =
    s === "guidance"
      ? ["Done", "Not yet", "I can't do that"]
      : s === "conversation" && !lastUser
        ? ["My broadband isn't working", "The internet light is off"]
        : s === "conversation"
          ? ["Yes", "No"]
          : [];

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#06090f] text-white">
      {/* Camera */}
      <div className="absolute inset-0">
        <CameraStage mode={cam.mode} stream={cam.stream} facing={cam.facing} scene={view.demoScene} onSource={onSource} />
        {cam.mode === "none" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white/70">
            <CameraOff className="size-10" aria-hidden />
            <p className="text-sm">Camera is off — you&apos;re on voice only.</p>
            <button type="button" onClick={() => void cam.start("environment").then((ok) => ok && send({ type: "media.update", media: { camera: true } }))} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">
              Turn camera on
            </button>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 to-transparent" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="size-5 rounded" style={{ background: view.brandColor }} aria-hidden />
          {view.brandName}
          <span className="flex items-center gap-1 rounded-full bg-white/12 px-2 py-0.5 text-[11px] font-medium">
            <span className="size-1.5 rounded-full bg-[#3bd16f] va-pulse" aria-hidden /> Live
            <span className="tabular text-white/70">{formatDuration((now - startedAt) / 1000)}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {view.scenario && (
            <span className="flex items-center gap-1 rounded-full border border-dashed border-white/30 px-2 py-0.5 text-[10px] text-white/70" title="Test session — AI responses are simulated">
              <FlaskConical className="size-3" aria-hidden /> Test
            </span>
          )}
          <QualityIndicator quality={quality} />
          <button type="button" onClick={() => setSoundOn((v) => !v)} aria-label={soundOn ? "Turn assistant voice off" : "Turn assistant voice on"} className="rounded-full p-2 hover:bg-white/10">
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <button type="button" onClick={() => setShowTranscript(true)} aria-label="Show transcript" className="rounded-full p-2 hover:bg-white/10">
            <Captions className="size-4" />
          </button>
        </div>
      </header>

      {/* Instruction (one primary instruction at a time) */}
      <div className="relative z-10 mx-3 mt-3" aria-live="polite">
        <div className="rounded-2xl bg-white/95 px-4 py-3 text-ink shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {view.instruction.from === "human" ? (
              <Headset className="size-3.5 text-violet" aria-hidden />
            ) : view.instruction.from === "system" ? (
              <Info className="size-3.5" aria-hidden />
            ) : (
              <span className="flex size-4 items-center justify-center rounded text-[8px] font-bold text-white" style={{ background: view.brandColor }} aria-hidden>
                AI
              </span>
            )}
            {speakerName}
            {view.instruction.from === "ai" && <span className="font-normal normal-case tracking-normal">· virtual assistant</span>}
            {speaker.speaking && <SpeakingBars />}
          </div>
          <p className="mt-1 text-[17px] font-medium leading-snug">{view.instruction.text}</p>
        </div>
        {view.previewRequested && cam.mode !== "none" && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px]">
            <span className="size-1.5 rounded-full bg-[#e5484d]" aria-hidden /> Your camera is visible to {view.humanName ?? "the support team"}
          </p>
        )}
      </div>

      {/* Centre overlays */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        <CentreOverlay view={view} capture={capture} cameraOn={cam.mode !== "none"} onCaptureNow={() => void doCapture(true)} />
      </div>

      {/* Bottom: speech + controls */}
      <div className="relative z-10 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {notice && (
          <div role="status" className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-danger px-3 py-2 text-xs">
            {notice}
            <button type="button" onClick={() => setNotice(undefined)} aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {quality === "lost" && <div className="mb-2 rounded-lg bg-warn px-3 py-2 text-xs font-medium">Reconnecting… your session is safe.</div>}

        {(listener.interim || lastUser) && (
          <p className="mb-2 line-clamp-2 px-1 text-[13px] text-white/75">
            <span className="font-semibold text-white/90">You: </span>
            {listener.interim || lastUser?.text}
          </p>
        )}

        {quickReplies.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send({ type: "customer.utterance", text: q, confidence: 1 })}
                className="shrink-0 rounded-full border border-white/30 bg-white/10 px-3.5 py-2 text-[13px] font-medium backdrop-blur hover:bg-white/20"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {(typing || !listener.supported) && (
          <form
            className="mb-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              setDraft("");
              void send({ type: "customer.utterance", text, confidence: 1 });
            }}
          >
            <label className="sr-only" htmlFor="say">
              Type a message
            </label>
            <input
              id="say"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={listener.supported ? "Type a message" : "Type here — voice input isn't available in this browser"}
              className="h-11 min-w-0 flex-1 rounded-full border border-white/25 bg-black/50 px-4 text-[15px] text-white placeholder:text-white/50"
              autoComplete="off"
            />
            <button type="submit" aria-label="Send" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-ink">
              <Send className="size-4" />
            </button>
          </form>
        )}

        <div className="mb-3 flex items-center justify-center gap-2 text-[12px] text-white/70">
          {listener.supported && cam.micOn && !speaker.speaking && (
            <>
              <span className="size-2 rounded-full bg-[#3bd16f] va-pulse" aria-hidden /> Listening — just speak
            </>
          )}
          {speaker.speaking && "Assistant is speaking…"}
          {!cam.micOn && "Microphone muted"}
          {listener.supported && (
            <button type="button" onClick={() => setTyping((v) => !v)} className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-white/80">
              <Keyboard className="size-3.5" aria-hidden /> {typing ? "Hide keyboard" : "Type instead"}
            </button>
          )}
        </div>

        <nav aria-label="Session controls" className="grid grid-cols-5 gap-1 rounded-2xl bg-black/55 p-2 backdrop-blur">
          <Control label={cam.micOn ? "Mute" : "Unmute"} onClick={() => { cam.toggleMic(); void send({ type: "media.update", media: { microphone: !cam.micOn } }); }} active={!cam.micOn}>
            {cam.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </Control>
          <Control
            label={cam.mode === "none" ? "Camera on" : "Camera off"}
            onClick={async () => {
              if (cam.mode === "none") {
                const ok = await cam.start("environment");
                if (ok) void send({ type: "media.update", media: { camera: true } });
              } else {
                cam.turnOff();
                void send({ type: "media.update", media: { camera: false } });
              }
            }}
            active={cam.mode === "none"}
          >
            {cam.mode === "none" ? <CameraOff className="size-5" /> : <Camera className="size-5" />}
          </Control>
          <Control label="Flip camera" onClick={cam.flip} disabled={cam.mode !== "camera"}>
            <SwitchCamera className="size-5" />
          </Control>
          <Control label={human ? "Human joined" : s === "escalating" ? "Connecting…" : "Human help"} onClick={() => void send({ type: "customer.request_human" })} disabled={helpDisabled} highlight>
            <Headset className="size-5" />
          </Control>
          <Control label="End" onClick={() => setConfirmEnd(true)} danger>
            <PhoneOff className="size-5" />
          </Control>
        </nav>
      </div>

      {showTranscript && <TranscriptSheet view={view} onClose={() => setShowTranscript(false)} />}
      {confirmEnd && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60 p-3 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="end-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-ink">
            <h2 id="end-title" className="text-lg font-semibold">
              End this session?
            </h2>
            <p className="mt-1 text-sm text-ink-2">{s === "resolved" ? "Glad that's sorted." : "If the problem isn't fixed, you can ask for a person instead."}</p>
            <div className="mt-5 grid gap-2">
              <button type="button" className="h-11 rounded-lg bg-danger font-semibold text-white" onClick={() => { cam.turnOff(); void send({ type: "session.end" }); }}>
                End session
              </button>
              {s !== "resolved" && !helpDisabled && (
                <button type="button" className="h-11 rounded-lg border border-line-strong font-medium" onClick={() => { setConfirmEnd(false); void send({ type: "customer.request_human" }); }}>
                  Talk to a person instead
                </button>
              )}
              <button type="button" className="h-11 rounded-lg font-medium text-ink-2" onClick={() => setConfirmEnd(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CentreOverlay({ view, capture, cameraOn, onCaptureNow }: { view: CustomerView; capture: CaptureState; cameraOn: boolean; onCaptureNow: () => void }) {
  const s = view.customerState;
  const req = view.evidenceRequest;
  if (req && !cameraOn) {
    return (
      <Card>
        <p className="font-semibold">Your camera is off</p>
        <p className="mt-1 text-sm text-white/75">Turn it on to show this, or tap Human help.</p>
      </Card>
    );
  }
  if (req) {
    const label =
      capture.state === "sending" ? "Sending…" : capture.state === "steady" ? (capture.progress >= 1 ? "Got it" : "Hold steady…") : capture.state === "error" ? capture.message : req.prompt;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center">
        <div className="relative aspect-[4/3] w-[82%] max-w-sm">
          {["left-0 top-0 border-l-4 border-t-4 rounded-tl-xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-xl"].map((c) => (
            <span key={c} className={cx("absolute size-10 border-white/90", c)} aria-hidden />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-[14px] font-medium backdrop-blur" role="status">
          {capture.state === "steady" && <ProgressRing value={capture.progress} />}
          {label}
        </div>
        {(s === "need_closer_view" || s === "need_another_angle") && (
          <p className="mt-2 rounded-full bg-warn/90 px-3 py-1 text-xs font-semibold">{s === "need_closer_view" ? "Closer view needed" : "Try another angle"}</p>
        )}
        {capture.state !== "sending" && (
          <button type="button" onClick={onCaptureNow} className="mt-3 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10">
            Capture now
          </button>
        )}
      </div>
    );
  }
  if (s === "analysing") {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        <div className="va-scan absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-white/15 to-transparent" aria-hidden />
        <span className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-[14px] font-medium" role="status">
          <ScanLine className="size-4" aria-hidden /> Checking what I can see…
        </span>
      </div>
    );
  }
  if (s === "waiting_action") return <Chip>{view.instruction.text.includes("test") ? "Running a line test…" : "Updating your account…"}</Chip>;
  if (s === "escalating") {
    return (
      <Card>
        <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
        <p className="font-semibold">Connecting you to a person</p>
        <p className="mt-1 text-sm text-white/75">They&apos;ll see everything you&apos;ve shown so far — no need to repeat anything. Please stay on the line.</p>
      </Card>
    );
  }
  if (s === "human_connected" && view.humanName) return <Chip icon={<Headset className="size-4" />}>{view.humanName} is with you</Chip>;
  if (s === "resolved") {
    return (
      <Card>
        <CheckCircle2 className="mx-auto mb-2 size-10 text-[#3bd16f]" aria-hidden />
        <p className="text-lg font-semibold">All sorted</p>
        <p className="mt-1 text-sm text-white/75">You can end the session whenever you&apos;re ready.</p>
      </Card>
    );
  }
  return null;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-black/65 px-5 py-5 text-center backdrop-blur" role="status">
      {children}
    </div>
  );
}

function Chip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-[14px] font-medium" role="status">
      {icon}
      {children}
    </span>
  );
}

function Control({
  label,
  onClick,
  children,
  disabled,
  danger,
  active,
  highlight,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  highlight?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium disabled:opacity-45">
      <span
        className={cx(
          "flex size-12 items-center justify-center rounded-full",
          danger ? "bg-[#e5484d]" : active ? "bg-white text-ink" : highlight ? "bg-white/20 ring-1 ring-white/40" : "bg-white/12",
        )}
        aria-hidden
      >
        {children}
      </span>
      {label}
    </button>
  );
}

function QualityIndicator({ quality }: { quality: Quality }) {
  const bars = { good: 3, fair: 2, poor: 1, lost: 0 }[quality];
  const label = { good: "Good connection", fair: "Fair connection", poor: "Weak connection", lost: "Reconnecting" }[quality];
  return (
    <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px]" title={label}>
      <span className="flex h-3 items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((b) => (
          <span key={b} className={cx("w-0.5 rounded-sm", b <= bars ? "bg-white" : "bg-white/30")} style={{ height: `${b * 4}px` }} />
        ))}
      </span>
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}

function SpeakingBars() {
  return (
    <span className="ml-auto flex h-3 items-end gap-0.5" aria-label="Speaking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="va-pulse w-0.5 rounded-sm bg-current" style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.2}s` }} />
      ))}
    </span>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r={r} stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" fill="none" />
      <circle cx="10" cy="10" r={r} stroke="#3bd16f" strokeWidth="2.5" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - value)} transform="rotate(-90 10 10)" strokeLinecap="round" />
    </svg>
  );
}

function TranscriptSheet({ view, onClose }: { view: CustomerView; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-white text-ink" role="dialog" aria-modal="true" aria-labelledby="transcript-title">
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <h2 id="transcript-title" className="font-semibold">
          Conversation
        </h2>
        <button type="button" onClick={onClose} aria-label="Close transcript" className="rounded-full p-2 hover:bg-surface-2">
          <X className="size-5" />
        </button>
      </div>
      <ol className="flex-1 space-y-3 overflow-y-auto p-4">
        {view.transcript.map((t) => (
          <li key={t.id} className={cx("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px]", t.speaker === "customer" ? "ml-auto bg-brand text-white" : t.speaker === "system" ? "mx-auto bg-surface-2 text-center text-xs text-muted" : "bg-surface-2")}>
            {t.speaker !== "customer" && t.speaker !== "system" && <div className="mb-0.5 text-[11px] font-semibold text-muted">{t.speakerName}</div>}
            {t.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

const noSubscribe = () => () => {};
function useAutoplay(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("autoplay") === "1",
    () => false,
  );
}
