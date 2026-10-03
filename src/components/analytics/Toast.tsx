"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info } from "lucide-react";

export interface ToastMsg { id: number; text: string; tone?: "ok" | "info" }

/** Minimal local toast (no global provider). Usage: const { toast, node } = useToast(); render {node}. */
export function useToast() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const n = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const toast = useCallback((text: string, tone: "ok" | "info" = "ok") => {
    const id = ++n.current;
    setItems((x) => [...x, { id, text, tone }]);
    timers.current.push(window.setTimeout(() => setItems((x) => x.filter((m) => m.id !== id)), 4200));
  }, []);
  const node: ReactNode = (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col gap-2" aria-live="polite">
      {items.map((m) => (
        <div key={m.id} className="anim-rise pointer-events-auto flex max-w-sm items-start gap-2 rounded border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
          {m.tone === "info" ? <Info size={15} className="mt-px shrink-0 text-info" /> : <CheckCircle2 size={15} className="mt-px shrink-0 text-ok" />}
          <span>{m.text}</span>
        </div>
      ))}
    </div>
  );
  return { toast, node };
}
