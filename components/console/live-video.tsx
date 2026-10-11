"use client";

import { useEffect, useRef, useState } from "react";
import { Video, VideoOff } from "lucide-react";
import { useNow } from "@/lib/client/use-now";
import type { VisualEvent } from "@/lib/domain/types";
import { formatTimeSec } from "@/lib/format";

/**
 * Agent's view of the customer camera. Uses the low-rate preview relay while
 * a human is present (WebRTC replaces this in the media phase); otherwise
 * shows the latest selected evidence frame, clearly labelled.
 */
export function LiveVideo({
  sessionId,
  active,
  latestFrame,
  cameraOn,
  overlay,
}: {
  sessionId: string;
  active: boolean;
  latestFrame?: VisualEvent;
  cameraOn: boolean;
  overlay?: React.ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [liveAt, setLiveAt] = useState<number>(0);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/preview`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 200) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = url;
          setSrc(url);
          setLiveAt(Date.now());
        }
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
  }, [active, sessionId]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const now = useNow(0);
  const isLive = active && src && now - liveAt < 4000;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#0b0f17]">
      {isLive ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="Live view of the customer's camera" className="h-full w-full object-cover" />
      ) : latestFrame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/sessions/${sessionId}/frames/${latestFrame.id}`} alt="Latest selected evidence frame" className="h-full w-full object-cover opacity-90" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-white/60">
          <VideoOff className="size-8" aria-hidden />
          <span className="text-sm">No video yet</span>
        </div>
      )}
      <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
        {isLive ? (
          <>
            <span className="size-1.5 rounded-full bg-[#e5484d] va-pulse" aria-hidden /> <Video className="size-3" aria-hidden /> Live customer camera
          </>
        ) : latestFrame ? (
          <>Latest selected frame · {formatTimeSec(latestFrame.timestamp)}</>
        ) : (
          <>Customer camera</>
        )}
      </div>
      {!isLive && active && (
        <div className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[11px] text-white/80">
          {cameraOn ? "Waiting for live preview from the customer's device…" : "Customer camera is off (voice only)"}
        </div>
      )}
      {!active && (
        <div className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[11px] text-white/80">Live preview starts when a human joins or the session escalates</div>
      )}
      {overlay}
    </div>
  );
}
