"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, CameraOff, CheckCircle2, ChevronRight, Headset, Loader2, Lock, Mic, MicOff, PhoneOff, RefreshCw, ShieldCheck, Star, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Chip } from "@/components/ui/primitives";
import { ConnectionIndicator } from "@/components/ui/domain";
import { CameraPanel } from "@/components/visual/CameraPanel";
import { clientById } from "@/lib/data/clients";
import { ASSIST_STATES, STATE_INDEX, type AssistState } from "./states";

/** In-phone bottom sheet (stays within the device frame, unlike the admin Modal). */
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="anim-rise relative w-full rounded-t-xl bg-white p-5 text-ink shadow-pop">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded text-ink-soft hover:bg-subtle"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CtrlButton({ label, icon, onClick, active, danger, prominent, pressed }: { label: string; icon: ReactNode; onClick: () => void; active?: boolean; danger?: boolean; prominent?: boolean; pressed?: boolean }) {
  return (
    <button
      onClick={onClick} aria-label={label} aria-pressed={pressed}
      className={cn(
        "flex min-h-[56px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-[11px] font-semibold transition-colors",
        danger ? "border-bad bg-bad text-white hover:opacity-90"
          : prominent ? "border-brand bg-brand text-white hover:bg-brand-strong"
          : active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-subtle",
      )}
    >
      {icon}<span>{label}</span>
    </button>
  );
}

export function CustomerExperience({ index, onIndexChange, className }: { index: number; onIndexChange: (i: number) => void; className?: string }) {
  const s: AssistState = ASSIST_STATES[index];
  const client = clientById("clearwave");
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [rear, setRear] = useState(true);
  const [flipping, setFlipping] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flipTimer.current) clearTimeout(flipTimer.current); }, []);
  // reset local feedback when walking back
  useEffect(() => { if (s.id !== "complete") { setRating(0); setFeedbackSent(false); } }, [s.id]);

  const go = (id: AssistState["id"]) => onIndexChange(STATE_INDEX[id]);
  const flip = () => {
    setFlipping(true); setRear((r) => !r);
    if (flipTimer.current) clearTimeout(flipTimer.current);
    flipTimer.current = setTimeout(() => setFlipping(false), 650);
  };

  const preCamera = s.id === "connecting" || s.id === "permission";
  const complete = s.id === "complete";
  const lastCaptions = s.captions.slice(-3);
  const handover = s.id === "human_joining";
  const voiceLabel = muted && s.voice === "Listening" ? "Mic muted" : s.voice;

  return (
    <div className={cn("relative flex flex-col overflow-hidden bg-subtle text-ink", className)}>
      {/* Client header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold text-white" style={{ background: client?.accent }}>{client?.initials}</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{client?.name}</p>
            <p className="truncate text-[10px] text-ink-mute">Powered by Absolute Intelligence</p>
          </div>
        </div>
        {!complete && <ConnectionIndicator q={s.connection} />}
      </header>

      {complete ? (
        <div className="flex-1 overflow-y-auto bg-white p-5">
          <div className="flex items-center gap-2 text-ok"><CheckCircle2 size={22} /><h1 className="text-lg font-semibold text-ink">Session complete</h1></div>
          <p className="mt-1 text-sm text-ink-soft">Thank you for showing us the problem. Here is what we covered.</p>
          <div className="mt-4 rounded-lg border border-line p-4">
            <p className="label">Summary</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li>ClearWave Hub 5 router identified.</li>
              <li>Power light solid green; DSL light flashing amber.</li>
              <li>Internet light could not be read clearly, so an adviser reviewed your images.</li>
              <li>Loose DSL filter re-seated. Service restored.</li>
            </ul>
            <p className="mt-3 text-xs text-ink-mute">Case reference <span className="num font-semibold text-ink">CW-558210</span>. A text summary has been sent to your mobile.</p>
          </div>
          <div className="mt-4 rounded-lg border border-line p-4">
            {feedbackSent ? (
              <p role="status" className="text-sm font-medium text-ok">Thanks for your feedback.</p>
            ) : (
              <>
                <p className="text-sm font-semibold">How was this session?</p>
                <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)}
                      className="flex h-11 w-11 items-center justify-center rounded hover:bg-subtle">
                      <Star size={24} className={n <= rating ? "fill-warn text-warn" : "text-ink-mute"} />
                    </button>
                  ))}
                </div>
                <button disabled={!rating} onClick={() => setFeedbackSent(true)} className="mt-3 h-11 w-full rounded bg-brand text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">Send feedback</button>
              </>
            )}
          </div>
          <button onClick={() => onIndexChange(0)} className="mt-4 h-11 w-full rounded border border-line text-sm font-semibold hover:bg-subtle">Start again (demo)</button>
        </div>
      ) : (
        <>
          {/* Camera */}
          <div className="relative min-h-[200px] flex-1 bg-black">
            {preCamera || !cameraOn ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink px-6 text-center text-white">
                {preCamera ? <Loader2 size={26} className={cn(s.id === "connecting" && "animate-spin")} aria-hidden /> : <CameraOff size={28} aria-hidden />}
                <p className="text-sm font-semibold">{preCamera ? (s.id === "connecting" ? "Connecting…" : "Camera access needed") : "Your camera is off"}</p>
                <p className="text-xs text-white/70">{preCamera ? "Your video will appear here once connected." : "The adviser cannot see your view. Turn the camera on to continue."}</p>
              </div>
            ) : (
              <CameraPanel
                scene={s.scene} overlays={s.showBoxes} analysing={s.overlay === "scan"} live={false} rounded={false}
                label={rear ? "Rear camera" : "Front camera"} className="absolute inset-0"
              >
                {s.overlay === "framing_guide" && <div className="pointer-events-none absolute inset-x-[14%] inset-y-[22%] rounded border-2 border-dashed border-white/80" aria-hidden />}
                {s.overlay === "steady" && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                    <div className="h-28 w-28 rounded-full border-2 border-white/90" style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />
                  </div>
                )}
                {s.overlay === "move_closer" && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                    <span className="rounded bg-warn px-2 py-1 text-xs font-bold text-black">MOVE CLOSER</span>
                  </div>
                )}
                {s.overlay === "scan" && <span className="absolute right-3 top-3 rounded bg-info px-1.5 py-0.5 text-[10px] font-bold text-white">ANALYSING</span>}
                {handover && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 text-white">
                    <Loader2 size={26} className="animate-spin" aria-hidden />
                    <p className="text-sm font-semibold">Priya is joining…</p>
                  </div>
                )}
                {flipping && <div className="anim-fade-in absolute inset-0 flex items-center justify-center bg-black/80 text-xs font-semibold text-white" role="status"><RefreshCw size={16} className="mr-2 animate-spin" />Switching camera</div>}
              </CameraPanel>
            )}
            {muted && !preCamera && <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white"><MicOff size={11} />Muted</span>}
          </div>

          {/* Instruction */}
          <section aria-live="polite" className={cn("shrink-0 border-t border-line bg-white px-4 py-3", s.id === "closer_view" && "border-l-4 border-l-warn", handover && "border-l-4 border-l-human")}>
            <div className="flex items-center justify-between gap-2">
              <p className="label">{handover ? "Handover" : "Ava says"}</p>
              <Chip tone={s.voiceTone} dot pulse={s.voice === "AI speaking" || s.voice === "Listening" || s.voice === "Analysing"}>{voiceLabel}</Chip>
            </div>
            <p className="mt-1 text-[17px] font-semibold leading-snug">{s.instruction}</p>
            {s.instructionHint && <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{s.instructionHint}</p>}
            {s.id === "permission" && (
              <div className="mt-3 rounded-lg border border-line bg-subtle p-3">
                <p className="flex items-center gap-2 text-sm font-semibold"><Lock size={14} aria-hidden />support.clearwave.example wants to use your camera and microphone</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => go("connecting")} className="h-11 flex-1 rounded border border-line bg-white text-sm font-semibold hover:bg-subtle">Block</button>
                  <button onClick={() => go("greeting")} className="h-11 flex-1 rounded bg-brand text-sm font-semibold text-white hover:bg-brand-strong">Allow</button>
                </div>
              </div>
            )}
          </section>

          {/* Captions */}
          <section aria-label="Live captions" className="h-[84px] shrink-0 space-y-1 overflow-y-auto border-t border-line bg-subtle px-4 py-2">
            {lastCaptions.map((c, i) => (
              <p key={i} className={cn("text-[13px] leading-snug", c.speaker === "customer" ? "text-ink-soft" : c.speaker === "system" ? "italic text-ink-mute" : "text-ink")}>
                <span className="font-semibold">{c.speaker === "ai" ? "Ava" : c.speaker === "customer" ? "You" : c.speaker === "human" ? "Priya" : "System"}: </span>{c.text}
              </p>
            ))}
          </section>

          {/* Privacy strip */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-white px-4 py-1.5 text-[11px] text-ink-soft">
            <span className="flex min-w-0 items-center gap-1.5"><ShieldCheck size={13} className="shrink-0 text-ok" aria-hidden /><span className="truncate">Only selected still images are analysed. Video is not recorded.</span></span>
            <button onClick={() => setPrivacy(true)} className="flex min-h-[44px] shrink-0 items-center font-semibold text-brand underline">Details</button>
          </div>

          {/* Controls */}
          <nav aria-label="Session controls" className="flex shrink-0 gap-2 border-t border-line bg-white px-3 pb-4 pt-2.5">
            <CtrlButton label={muted ? "Unmute" : "Mute"} pressed={muted} active={muted} onClick={() => setMuted((m) => !m)} icon={muted ? <MicOff size={20} /> : <Mic size={20} />} />
            <CtrlButton label={cameraOn ? "Camera" : "Camera off"} pressed={!cameraOn} active={!cameraOn} onClick={() => setCameraOn((c) => !c)} icon={cameraOn ? <Camera size={20} /> : <CameraOff size={20} />} />
            <CtrlButton label="Switch" onClick={flip} icon={<RefreshCw size={20} />} />
            <CtrlButton label="Human help" prominent onClick={() => go("human_joining")} icon={<Headset size={20} />} />
            <CtrlButton label="End" danger onClick={() => setConfirmEnd(true)} icon={<PhoneOff size={20} />} />
          </nav>
        </>
      )}

      <Sheet open={privacy} onClose={() => setPrivacy(false)} title="How your video is used">
        <ul className="space-y-2 text-sm text-ink-soft">
          <li className="flex gap-2"><ChevronRight size={14} className="mt-1 shrink-0" aria-hidden />Your live video is used only so the adviser can see the problem. It is not recorded.</li>
          <li className="flex gap-2"><ChevronRight size={14} className="mt-1 shrink-0" aria-hidden />Selected still images may be analysed by AI and attached to your case.</li>
          <li className="flex gap-2"><ChevronRight size={14} className="mt-1 shrink-0" aria-hidden />Retained images are deleted after 14 days. You can ask ClearWave to delete them sooner.</li>
          <li className="flex gap-2"><ChevronRight size={14} className="mt-1 shrink-0" aria-hidden />You can turn your camera off or end the session at any time.</li>
        </ul>
        <button onClick={() => setPrivacy(false)} className="mt-4 h-11 w-full rounded bg-ink text-sm font-semibold text-white">Close</button>
      </Sheet>

      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End this session?">
        <p className="text-sm text-ink-soft">The adviser will no longer be able to see your camera. You will receive a summary.</p>
        <div className="mt-4 flex gap-2">
          <button onClick={() => setConfirmEnd(false)} className="h-11 flex-1 rounded border border-line text-sm font-semibold hover:bg-subtle">Keep going</button>
          <button onClick={() => { setConfirmEnd(false); go("complete"); }} className="h-11 flex-1 rounded bg-bad text-sm font-semibold text-white hover:opacity-90">End session</button>
        </div>
      </Sheet>
    </div>
  );
}
