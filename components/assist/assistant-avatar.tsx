import { cx } from "@/components/ui/primitives";

/**
 * Who the customer is talking to: the AI assistant (a friendly drawn face in
 * the client's colour) or a person (their initials). Rings pulse while the
 * voice is speaking, so the customer can see who is talking even with the
 * camera off.
 */
export function AssistantAvatar({
  who,
  name,
  color,
  speaking = false,
  size = 96,
  className,
}: {
  who: "ai" | "human";
  name: string;
  color: string;
  speaking?: boolean;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span className={cx("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} role="img" aria-label={who === "ai" ? `${name}, virtual assistant` : `${name}, support team`}>
      {speaking && (
        <>
          <span className="va-ring absolute inset-0 rounded-full" style={{ background: color }} aria-hidden />
          <span className="va-ring absolute inset-0 rounded-full [animation-delay:0.6s]" style={{ background: color }} aria-hidden />
        </>
      )}
      {who === "ai" ? (
        <svg viewBox="0 0 96 96" width={size} height={size} className="relative" aria-hidden>
          <defs>
            <linearGradient id="va-av-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#e8edf5" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="46" fill={color} />
          <circle cx="48" cy="48" r="40" fill="url(#va-av-bg)" />
          {/* Headset band and mic: a support assistant */}
          <path d="M22 50a26 26 0 0 1 52 0" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
          <rect x="16" y="46" width="10" height="16" rx="5" fill={color} />
          <rect x="70" y="46" width="10" height="16" rx="5" fill={color} />
          <path d="M75 62c0 8-8 13-17 13" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <circle cx="57" cy="75" r="3.5" fill={color} />
          {/* Face */}
          <ellipse cx="38" cy="48" rx="4" ry={speaking ? 4.5 : 5} fill="#1b2433" />
          <ellipse cx="58" cy="48" rx="4" ry={speaking ? 4.5 : 5} fill="#1b2433" />
          {speaking ? (
            <ellipse cx="48" cy="62" rx="7" ry="4.5" fill="#1b2433" className="va-mouth" />
          ) : (
            <path d="M39 60q9 7 18 0" fill="none" stroke="#1b2433" strokeWidth="3.5" strokeLinecap="round" />
          )}
        </svg>
      ) : (
        <span className="relative flex size-full items-center justify-center rounded-full border-4 border-white/90 bg-violet font-semibold text-white" style={{ fontSize: size * 0.36 }}>
          {initials || "?"}
        </span>
      )}
    </span>
  );
}
