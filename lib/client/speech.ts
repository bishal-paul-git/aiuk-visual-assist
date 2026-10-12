"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH, STATIC_DEMO } from "@/lib/paths";
import { clipKey, voiceRoleFor } from "@/lib/voice/voices";
import { DEFAULT_ENDPOINTER, Endpointer, pickRecorderType, rms, type RecogniserEnv } from "./voice-activity";

/**
 * Voice layer (docs/02 §3.3): British ElevenLabs voices for the assistant and
 * agents; for the customer, either the browser's own speech recognition
 * (useListener) or recorded turns transcribed on the server
 * (useRecorderListener, when the deployment has STT_PROVIDER set). Wrapped
 * behind small hooks so a streaming voice stack can replace it without
 * touching the UI.
 */

export interface SpokenLine {
  text: string;
  /** "ai" or "human_agent"; picks the voice. */
  speaker?: string;
  speakerName?: string;
}

interface Manifest {
  clips: Record<string, { file: string }>;
}

let manifestPromise: Promise<Manifest | null> | null = null;
function loadManifest(): Promise<Manifest | null> {
  manifestPromise ??= fetch(`${BASE_PATH}/voice/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

/**
 * Where a line's audio comes from, best first:
 * 1. a pre-recorded ElevenLabs clip (public/voice, British voices; covers the
 *    demo's scripted lines and works on the static site),
 * 2. live ElevenLabs synthesis via /api/tts (server edition with
 *    ELEVENLABS_API_KEY),
 * 3. the browser's own en-GB voice.
 */
async function audioUrlFor(line: SpokenLine): Promise<string | null> {
  const role = voiceRoleFor(line.speaker ?? "ai", line.speakerName);
  const manifest = await loadManifest();
  const clip = manifest?.clips[clipKey(role, line.text)];
  if (clip) return `${BASE_PATH}/voice/${clip.file}`;
  if (STATIC_DEMO) return null;
  try {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: line.text, role }),
    });
    if (!r.ok) return null;
    return URL.createObjectURL(await r.blob());
  } catch {
    return null;
  }
}

/**
 * Speaks assistant and agent lines one at a time, in order. Swappable for a
 * streaming voice stack later without touching the customer UI.
 */
export function useSpeaker(enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window);
  const queue = useRef<SpokenLine[]>([]);
  const busy = useRef(false);
  const current = useRef<HTMLAudioElement | null>(null);
  const enabledRef = useRef(enabled);

  const browserSpeak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      u.rate = 1.02;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang === "en-GB");
      if (voice) u.voice = voice;
      // Some browsers never fire onend (e.g. no voices installed); don't hang the queue.
      const guard = setTimeout(resolve, 2000 + text.length * 90);
      u.onend = () => {
        clearTimeout(guard);
        resolve();
      };
      u.onerror = () => {
        clearTimeout(guard);
        resolve();
      };
      window.speechSynthesis.speak(u);
    });
  }, []);

  const playUrl = useCallback((url: string) => {
    return new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      current.current = audio;
      let settled = false;
      // A stalled clip must not block later lines: give up after 45 s.
      const guard = setTimeout(() => done(false), 45_000);
      function done(ok: boolean) {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        current.current = null;
        resolve(ok);
      }
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      // Autoplay can be blocked until the user interacts; fall back to the browser voice.
      audio.play().catch(() => done(false));
    });
  }, []);

  const drain = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSpeaking(true);
    while (queue.current.length && enabledRef.current) {
      const line = queue.current.shift()!;
      const url = await audioUrlFor(line);
      if (!enabledRef.current) break;
      const played = url ? await playUrl(url) : false;
      if (!played && enabledRef.current) await browserSpeak(line.text);
    }
    busy.current = false;
    setSpeaking(false);
  }, [browserSpeak, playUrl]);

  const speak = useCallback(
    (line: string | SpokenLine) => {
      const l = typeof line === "string" ? { text: line } : line;
      if (!supported || !enabled || !l.text) return;
      queue.current.push(l);
      void drain();
    },
    [drain, enabled, supported],
  );

  /** Stops playback and drops queued lines (no state change; the drain loop settles it). */
  const stopAll = useCallback(() => {
    queue.current = [];
    const a = current.current;
    current.current = null;
    if (a) {
      a.pause();
      a.dispatchEvent(new Event("ended"));
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const cancel = useCallback(() => {
    stopAll();
    setSpeaking(false);
  }, [stopAll]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) stopAll();
  }, [enabled, stopAll]);

  useEffect(() => {
    // Warm the clip list so the first line plays without a fetch delay.
    void loadManifest();
  }, []);

  return { speak, cancel, speaking: speaking && enabled, supported };
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence: number } }> }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function getRecognitionCtor(): (new () => RecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Continuous listening with turn detection by the recogniser. Paused while the
 * assistant speaks to avoid transcribing its own voice.
 */
export function useListener(opts: { active: boolean; onFinal: (text: string, confidence: number) => void }) {
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();
  /** The recognition service failed (offline, dictation off, language missing): worth switching to server STT. */
  const [failed, setFailed] = useState(false);
  const [supported] = useState(() => Boolean(getRecognitionCtor()));
  const recRef = useRef<RecognitionLike | null>(null);
  const activeRef = useRef(opts.active);
  const onFinalRef = useRef(opts.onFinal);

  useEffect(() => {
    onFinalRef.current = opts.onFinal;
  }, [opts.onFinal]);

  useEffect(() => {
    activeRef.current = opts.active;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    if (!opts.active) {
      recRef.current?.abort();
      return;
    }
    if (!recRef.current) {
      const rec = new Ctor();
      rec.lang = "en-GB";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const t = r[0].transcript.trim();
            if (t) onFinalRef.current(t, r[0].confidence || 0.9);
            setInterim("");
          } else {
            text += r[0].transcript;
          }
        }
        if (text) setInterim(text);
      };
      rec.onstart = () => setListening(true);
      rec.onend = () => {
        setListening(false);
        if (activeRef.current) {
          setTimeout(() => {
            if (!activeRef.current) return;
            try {
              rec.start();
            } catch {
              /* already started */
            }
          }, 250);
        }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          activeRef.current = false;
          setError("Microphone access for speech recognition was blocked");
        }
        if (e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported") setFailed(true);
      };
      recRef.current = rec;
    }
    try {
      recRef.current.start();
    } catch {
      /* already running */
    }
  }, [opts.active]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, interim, error, failed };
}

/** What this browser offers for speech capture, for chooseRecogniser. Client only. */
export function readRecogniserEnv(serverStt: boolean, webSpeechFailed = false): RecogniserEnv {
  const w = typeof window === "undefined" ? undefined : (window as unknown as { MediaRecorder?: unknown; AudioContext?: unknown; webkitAudioContext?: unknown });
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    serverStt,
    canRecord: Boolean(w && typeof w.MediaRecorder === "function" && (w.AudioContext || w.webkitAudioContext) && nav?.mediaDevices?.getUserMedia),
    webSpeech: Boolean(getRecognitionCtor()),
    userAgent: nav?.userAgent ?? "",
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    webSpeechFailed,
  };
}

/**
 * What the customer sees while server speech-to-text is in use:
 * - off: not capturing (muted, assistant speaking, or not in use);
 * - listening: waiting for the customer to speak;
 * - hearing: a turn is being recorded;
 * - processing: a turn is being transcribed.
 */
export type RecorderPhase = "off" | "listening" | "hearing" | "processing";

export interface RecordedClip {
  audio: Blob;
  durationMs: number;
}

export type TranscribeFn = (clip: RecordedClip) => Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }>;

const TICK_MS = 50;

/**
 * Server speech-to-text capture. Records the microphone with MediaRecorder,
 * ends each turn by voice activity (an AnalyserNode level fed to
 * Endpointer), then hands the clip to `transcribe`; the server adds the
 * transcript to the session. Audio stays in memory only until it is sent.
 *
 * Where the level meter cannot run (an AudioContext the browser keeps
 * suspended) it falls back to push-to-talk: `talk()` starts a turn and
 * `talk()` again sends it. In hands-free mode `talk()` ends a turn early.
 *
 * Reuses the camera stream's microphone track when there is one, because iOS
 * Safari stops an existing capture when a second one is requested.
 */
export function useRecorderListener(opts: { active: boolean; stream: MediaStream | null; transcribe: TranscribeFn }) {
  const [phase, setPhase] = useState<RecorderPhase>("off");
  const [handsFree, setHandsFree] = useState(true);
  const [error, setError] = useState<string>();
  const transcribeRef = useRef(opts.transcribe);
  const talkRef = useRef<() => void>(() => {});
  const audioTrack = opts.stream?.getAudioTracks().find((t) => t.readyState === "live") ?? null;

  useEffect(() => {
    transcribeRef.current = opts.transcribe;
  }, [opts.transcribe]);

  useEffect(() => {
    if (!opts.active) return;
    let cancelled = false;
    let owned: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    /** One MediaRecorder run. `keep` decides, when it stops, whether the clip is sent. */
    let take: { recorder: MediaRecorder; startedAt: number; keep: boolean } | null = null;
    let manual = false;
    let pending = 0;
    /** The level meter runs (AudioContext not suspended): hands-free endpointing, else tap-to-talk. */
    let meter = false;
    const endpointer = new Endpointer();
    const settle = () => setPhase(pending > 0 ? "processing" : "listening");
    const recording = () => take?.recorder.state === "recording";

    function record(stream: MediaStream, type: string | undefined) {
      const chunks: Blob[] = [];
      const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      const t = { recorder, startedAt: Date.now(), keep: false };
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (cancelled) return;
        const clip = { audio: new Blob(chunks, { type: (recorder.mimeType || type || "audio/webm").split(";")[0] }), durationMs: Date.now() - t.startedAt };
        // Keep listening while the last turn is transcribed.
        take = record(stream, type);
        if (t.keep) void upload(clip);
      };
      recorder.start();
      return t;
    }

    /** End the current recording, uploading it or dropping it. A fresh recording starts straight away. */
    function finish(upload: boolean) {
      if (!take || !recording()) return;
      take.keep = upload;
      manual = false;
      endpointer.reset();
      take.recorder.stop();
    }

    async function upload(clip: RecordedClip) {
      if (clip.audio.size < 400) return settle();
      pending += 1;
      setPhase("processing");
      const r = await transcribeRef.current(clip).catch(() => ({ ok: false as const, status: 0, error: "Network error" }));
      pending -= 1;
      if (cancelled) return;
      if (r.ok) setError(r.text ? undefined : "Sorry, I didn't catch that — please say it again");
      else if (r.status !== 409) setError(r.status === 429 ? "Too many voice messages — please wait a moment" : "Your voice didn't go through — please try again or type");
      settle();
    }

    talkRef.current = () => {
      // A tap is a user gesture: the moment iOS will let a suspended AudioContext
      // run. If it does, later turns are hands-free.
      if (!meter && ctx && ctx.state !== "running") {
        void ctx.resume().then(() => {
          if (!cancelled && ctx?.state === "running") {
            meter = true;
            setHandsFree(true);
          }
        });
      }
      if (!recording()) return;
      if (manual || endpointer.state === "speaking") {
        finish(true);
        settle();
      } else {
        // Start a turn now: drop what was recorded while waiting and record afresh.
        finish(false);
        manual = true;
        setError(undefined);
        setPhase("hearing");
      }
    };

    (async () => {
      try {
        let stream: MediaStream;
        if (audioTrack) stream = new MediaStream([audioTrack]);
        else {
          owned = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          stream = owned;
        }
        if (cancelled) return;
        const type = pickRecorderType((t) => MediaRecorder.isTypeSupported(t));
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctx();
        await ctx.resume().catch(() => undefined);
        if (cancelled) return;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        meter = ctx.state === "running";
        setHandsFree(meter);
        setError(undefined);
        take = record(stream, type);
        setPhase("listening");
        timer = setInterval(() => {
          if (!take || !recording()) return;
          const elapsed = Date.now() - take.startedAt;
          if (manual || !meter) {
            // Push-to-talk: cap the turn; while waiting, keep the recording short.
            if (manual && elapsed >= DEFAULT_ENDPOINTER.maxTurnMs) {
              finish(true);
              settle();
            } else if (!manual && elapsed >= DEFAULT_ENDPOINTER.idleRestartMs) finish(false);
            return;
          }
          analyser.getFloatTimeDomainData(buf);
          const ev = endpointer.push(rms(buf), TICK_MS);
          if (ev === "start") {
            setError(undefined);
            setPhase("hearing");
          } else if (ev === "end" || ev === "discard") {
            finish(ev === "end");
            settle();
          }
        }, TICK_MS);
      } catch (e) {
        if (cancelled) return;
        setError((e as DOMException).name === "NotAllowedError" ? "Microphone access was blocked" : "We couldn't start the microphone");
      }
    })();

    return () => {
      cancelled = true;
      talkRef.current = () => {};
      if (timer) clearInterval(timer);
      if (take && take.recorder.state !== "inactive") take.recorder.stop();
      owned?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
      setPhase("off");
    };
    // A new microphone track (camera restarted or flipped) restarts capture.
  }, [opts.active, audioTrack]);

  const talk = useCallback(() => talkRef.current(), []);
  return { phase: opts.active ? phase : ("off" as const), handsFree, error, talk };
}
