"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, RefreshCw, Video, VideoOff, Volume2 } from "lucide-react";
import { useNow } from "@/lib/client/use-now";
import type { VisualEvent } from "@/lib/domain/types";
import type { Transport } from "@/lib/client/transport";
import type { LiveCall } from "@/lib/client/live-call";
import { formatTimeSec } from "@/lib/format";
import { cx } from "@/components/ui/primitives";

/**
 * Agent's view of the customer camera. While a human agent is with the
 * customer, live video and two-way audio run over WebRTC (`call`). Until the
 * call is live, or when WebRTC fails, the low-rate preview relay shows
 * snapshots; otherwise the latest selected evidence frame, clearly labelled.
 * Nothing shown here is recorded.
 */
export function LiveVideo({
  sessionId,
  transport,
  active,
  latestFrame,
  cameraOn,
  overlay,
  frameSrc,
  call,
}: {
  sessionId: string;
  transport: Transport | null;
  frameSrc: (f: VisualEvent) => string;
  active: boolean;
  latestFrame?: VisualEvent;
  cameraOn: boolean;
  overlay?: React.ReactNode;
  call?: LiveCall;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [liveAt, setLiveAt] = useState<number>(0);
  const urlRef = useRef<string | null>(null);
  const callLive = call?.state.phase === "live" && Boolean(call.remoteStream?.getVideoTracks().length);
  /** Live with sound only: the customer's camera is off, but you can talk. */
  const voiceLive = call?.state.phase === "live" && !callLive && Boolean(call.remoteStream?.getAudioTracks().length);

  useEffect(() => {
    if (!active || !transport || callLive) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const p = await transport.latestPreview(sessionId);
        if (cancelled || !p) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = p.revoke ? p.url : null;
        setSrc(p.url);
        setLiveAt(Date.now());
      } catch {
        /* transient */
      }
    };
    void poll();
    const t = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [active, sessionId, transport, callLive]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const now = useNow(0);
  const isPreview = active && src && now - liveAt < 4000;
  const fallback = call?.state.phase === "fallback";

  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#0b0f17]">
        {callLive ? (
          <RemoteVideo stream={call!.remoteStream!} />
        ) : voiceLive ? (
          <VoiceCall stream={call!.remoteStream!} />
        ) : isPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src!} alt="Live view of the customer's camera" className="h-full w-full object-cover" />
        ) : latestFrame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frameSrc(latestFrame)} alt="Latest selected evidence frame" className="h-full w-full object-cover opacity-90" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/60">
            <VideoOff className="size-8" aria-hidden />
            <span className="text-sm">No video yet</span>
          </div>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
          {callLive ? (
            <>
              <span className="size-1.5 rounded-full bg-[#e5484d] va-pulse" aria-hidden /> <Video className="size-3" aria-hidden /> Live customer camera
            </>
          ) : voiceLive ? (
            <>
              <span className="size-1.5 rounded-full bg-[#e5484d] va-pulse" aria-hidden /> <Mic className="size-3" aria-hidden /> Voice call with the customer
            </>
          ) : isPreview ? (
            <>
              <span className="size-1.5 rounded-full bg-[#e5484d] va-pulse" aria-hidden /> <Video className="size-3" aria-hidden /> {fallback ? "Customer camera · snapshots" : "Live customer camera"}
            </>
          ) : latestFrame ? (
            <>Latest selected frame · {formatTimeSec(latestFrame.timestamp)}</>
          ) : (
            <>Customer camera</>
          )}
        </div>
        {call?.label && <CallState label={call.label} phase={call.state.phase} />}
        {!callLive && !voiceLive && !isPreview && active && (
          <div className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[11px] text-white/80">
            {cameraOn ? "Waiting for live video from the customer's device…" : "Customer camera is off (voice only)"}
          </div>
        )}
        {!active && (
          <div className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[11px] text-white/80">Live preview starts when a human joins or the session escalates</div>
        )}
        {overlay}
      </div>
      {call?.label && <CallControls call={call} />}
    </div>
  );
}

function CallState({ label, phase }: { label: string; phase: string }) {
  return (
    <div
      data-testid="live-video-state"
      role="status"
      className={cx(
        "absolute right-2 top-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold",
        phase === "live" ? "bg-ok text-white" : phase === "fallback" ? "bg-warn text-white" : "bg-black/65 text-white",
      )}
    >
      {phase !== "live" && phase !== "fallback" && <span className="size-2.5 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" aria-hidden />}
      {label}
    </div>
  );
}

/** Agent controls for the call: microphone mute, and a retry after a fallback. */
function CallControls({ call }: { call: LiveCall }) {
  const phase = call.state.phase;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
      <span>
        {phase === "live"
          ? "Two-way audio with the customer · not recorded"
          : phase === "fallback"
            ? call.state.reason === "unsupported"
              ? "Live video isn't available on this device; showing snapshots"
              : "Live video couldn't connect; showing snapshots"
            : "Connecting the call…"}
      </span>
      <div className="flex items-center gap-2">
        {phase === "fallback" && call.state.reason !== "unsupported" && (
          <button type="button" onClick={call.retry} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 font-medium text-ink hover:bg-surface-2">
            <RefreshCw className="size-3.5" aria-hidden /> Retry live video
          </button>
        )}
        <button
          type="button"
          onClick={call.toggleMic}
          disabled={!call.micAvailable}
          aria-pressed={!call.micOn}
          title={call.micAvailable ? undefined : "No microphone available: the customer can't hear you"}
          className={cx(
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 font-medium disabled:opacity-50",
            call.micOn && call.micAvailable ? "border-line bg-surface text-ink hover:bg-surface-2" : "border-danger/30 bg-danger-soft text-danger",
          )}
        >
          {call.micOn && call.micAvailable ? <Mic className="size-3.5" aria-hidden /> : <MicOff className="size-3.5" aria-hidden />}
          {!call.micAvailable ? "No microphone" : call.micOn ? "Mute mic" : "Unmute mic"}
        </button>
      </div>
    </div>
  );
}

/** Camera off: sound only, with a clear picture of what is happening. */
function VoiceCall({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.srcObject = stream;
    a.play().then(
      () => setAudioBlocked(false),
      () => setAudioBlocked(true),
    );
  }, [stream]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-white/80" data-testid="voice-call">
      <Mic className="size-8" aria-hidden />
      <span className="text-sm font-medium">Voice call: the customer&apos;s camera is off</span>
      <span className="text-xs text-white/60">You can talk to each other</span>
      <audio ref={audioRef} autoPlay />
      {audioBlocked && (
        <button
          type="button"
          onClick={() => void audioRef.current?.play().then(() => setAudioBlocked(false), () => {})}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink"
        >
          <Volume2 className="size-3.5" aria-hidden /> Play customer audio
        </button>
      )}
    </div>
  );
}

/** Picture in a muted element (always allowed to autoplay); sound in a separate audio element. */
function RemoteVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (v) {
      v.srcObject = stream;
      void v.play().catch(() => {});
    }
    if (a && stream.getAudioTracks().length) {
      a.srcObject = stream;
      a.play().then(
        () => setAudioBlocked(false),
        () => setAudioBlocked(true),
      );
    }
  }, [stream]);

  return (
    <>
      <video ref={videoRef} playsInline muted autoPlay aria-label="Live video of the customer's camera" className="h-full w-full object-cover" />
      <audio ref={audioRef} autoPlay />
      {audioBlocked && (
        <button
          type="button"
          onClick={() => void audioRef.current?.play().then(() => setAudioBlocked(false), () => {})}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink"
        >
          <Volume2 className="size-3.5" aria-hidden /> Play customer audio
        </button>
      )}
    </>
  );
}
