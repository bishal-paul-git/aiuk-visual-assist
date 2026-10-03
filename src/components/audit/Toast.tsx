"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

/** Minimal local toast for admin demo pages. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const node = msg ? (
    <div role="status" aria-live="polite" className="anim-rise fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded border border-line bg-ink px-3.5 py-2.5 text-[13px] text-white shadow-pop">
      <CheckCircle2 size={15} className="text-ok" />{msg}
    </div>
  ) : null;
  return { show, node };
}
