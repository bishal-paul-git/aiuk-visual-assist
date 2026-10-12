"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH, STATIC_DEMO } from "@/lib/paths";
import { clipKey, voiceRoleFor } from "@/lib/voice/voices";

/**
 * Voice layer (docs/02 §3.3): British ElevenLabs voices for the assistant and
 * agents, browser speech recognition for the customer. Wrapped behind small
 * hooks so a streaming voice stack can replace it without touching the UI.
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

  return { supported, listening, interim, error };
}
