"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser-native voice layer for the POC (docs/02 §3.3). Wrapped behind small
 * hooks so a provider voice stack (streaming ASR/TTS over WebRTC) can replace
 * it without touching the customer UI.
 */

export function useSpeaker(enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text: string) => {
      if (!supported || !enabled || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      u.rate = 1.02;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang === "en-GB");
      if (voice) u.voice = voice;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(window.speechSynthesis.speaking);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [enabled, supported],
  );

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  useEffect(() => {
    if (!enabled && supported) window.speechSynthesis.cancel();
  }, [enabled, supported]);

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
