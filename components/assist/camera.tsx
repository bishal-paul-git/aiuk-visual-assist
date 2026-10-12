"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renderRouterSvg, type RouterScene } from "@/lib/media/router-svg";
import type { FrameSource } from "@/lib/client/frame-capture";

export type CameraMode = "none" | "camera" | "demo";

/** Camera/microphone lifecycle: permissions, facing switch, on/off, mic mute. */
export function useCamera() {
  const [mode, setMode] = useState<CameraMode>("none");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string>();
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(
    async (nextFacing: "environment" | "user" = "environment"): Promise<boolean> => {
      setError(undefined);
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError(
          typeof window !== "undefined" && !window.isSecureContext
            ? "Camera access needs a secure (https) connection."
            : "This browser can't access the camera.",
        );
        return false;
      }
      try {
        stopTracks();
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        s.getAudioTracks().forEach((t) => (t.enabled = micOn));
        streamRef.current = s;
        setStream(s);
        setFacing(nextFacing);
        setMode("camera");
        return true;
      } catch (e) {
        const name = (e as DOMException).name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission was declined. You can allow it in your browser settings and try again."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : "We couldn't start your camera.",
        );
        return false;
      }
    },
    [micOn, stopTracks],
  );

  const useDemo = useCallback(() => {
    stopTracks();
    setMode("demo");
  }, [stopTracks]);

  const turnOff = useCallback(() => {
    stopTracks();
    setMode("none");
  }, [stopTracks]);

  const flip = useCallback(() => {
    if (mode === "camera") void start(facing === "environment" ? "user" : "environment");
  }, [mode, facing, start]);

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { mode, stream, facing, micOn, error, start, useDemo, turnOff, flip, toggleMic };
}

/** Renders the live source and reports the element frames are captured from. */
export function CameraStage({
  mode,
  stream,
  facing,
  scene,
  onSource,
}: {
  mode: CameraMode;
  stream: MediaStream | null;
  facing: "environment" | "user";
  scene?: RouterScene;
  onSource: (el: FrameSource | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (mode !== "camera" || !v) return;
    v.srcObject = stream;
    void v.play().catch(() => {});
    onSource(v);
    return () => onSource(null);
  }, [mode, stream, onSource]);

  if (mode === "demo") return <DemoFeed scene={scene} onSource={onSource} />;
  if (mode === "camera") {
    return (
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-label="Your camera"
        className="absolute inset-0 h-full w-full object-cover"
        style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
      />
    );
  }
  return null;
}

/** Plays the human agent's voice from the live call. Not recorded. */
export function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.srcObject = stream;
    void a.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay className="hidden" />;
}

/** Portrait, like a phone held upright. */
const FEED_W = 450;
const FEED_H = 900;

/** Synthetic camera for test sessions on devices without a camera. */
function DemoFeed({ scene, onSource }: { scene?: RouterScene; onSource: (el: FrameSource | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const key = JSON.stringify(scene ?? null);

  useEffect(() => {
    const parsed = JSON.parse(key) as RouterScene | null;
    const svg = renderRouterSvg(parsed ?? { view: "front", power: "on", internet: "on", wifi: "on", cable: "connected" }, FEED_W, FEED_H);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    img.onload = () => (imgRef.current = img);
  }, [key]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    onSource(c);
    const ctx = c.getContext("2d");
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 66) return;
      last = t;
      const img = imgRef.current;
      if (!ctx || !img) return;
      const dx = Math.sin(t / 900) * 3;
      const dy = Math.cos(t / 1300) * 2;
      ctx.fillStyle = "#cfc8bc";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, dx - 8, dy - 6, c.width + 16, c.height + 12);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      onSource(null);
    };
  }, [onSource]);

  return <canvas ref={canvasRef} width={FEED_W} height={FEED_H} aria-label="Demo camera feed" className="absolute inset-0 h-full w-full object-cover" />;
}
