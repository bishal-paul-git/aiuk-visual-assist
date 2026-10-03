import type { SceneKind } from "@/lib/types";

/** Procedural SVG stand-ins for customer camera frames. No real imagery or camera is used. */
export function Scene({ kind, className, blink = true }: { kind: SceneKind; className?: string; blink?: boolean }) {
  const id = `g-${kind}`;
  return (
    <svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={`Demo camera frame: ${kind.replace("_", " ")}`}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b3442" /><stop offset="1" stopColor="#141a24" />
        </linearGradient>
        <radialGradient id={`${id}-light`} cx="0.25" cy="0.15" r="0.9"><stop offset="0" stopColor="#fff" stopOpacity="0.16" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <filter id={`${id}-blur`}><feGaussianBlur stdDeviation="3.2" /></filter>
        <filter id={`${id}-glow`}><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <rect width="640" height="400" fill={`url(#${id}-bg)`} />
      {body(kind, id, blink)}
      <rect width="640" height="400" fill={`url(#${id}-light)`} />
      <rect width="640" height="400" fill="#000" opacity="0.08" />
    </svg>
  );
}

const Led = ({ x, y, color, on = true, blink, r = 9, id }: { x: number; y: number; color: string; on?: boolean; blink?: boolean; r?: number; id: string }) => (
  <g className={blink ? "anim-blink" : undefined}>
    {on && <circle cx={x} cy={y} r={r * 2.2} fill={color} opacity="0.35" filter={`url(#${id}-glow)`} />}
    <circle cx={x} cy={y} r={r} fill={on ? color : "#2a2f38"} stroke="#0b0e13" strokeWidth="2" />
  </g>
);

function body(kind: SceneKind, id: string, blink: boolean) {
  switch (kind) {
    case "router_front":
      return (
        <g>
          <rect x="0" y="300" width="640" height="100" fill="#3a2f27" opacity="0.7" />
          <rect x="150" y="110" width="340" height="190" rx="14" fill="#e8ebef" />
          <rect x="150" y="110" width="340" height="190" rx="14" fill="none" stroke="#c4c9d1" strokeWidth="2" />
          <rect x="170" y="130" width="300" height="150" rx="8" fill="#f6f7f9" />
          <text x="320" y="170" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="20" fill="#1f2937">ClearWave</text>
          <text x="320" y="190" textAnchor="middle" fontFamily="sans-serif" fontSize="11" fill="#6b7280" letterSpacing="3">HUB 5</text>
          <rect x="200" y="215" width="240" height="40" rx="6" fill="#161b22" />
          <Led id={id} x={235} y={235} color="#22c55e" />
          <Led id={id} x={290} y={235} color="#f59e0b" blink={blink} />
          <Led id={id} x={345} y={235} color="#22c55e" on={false} />
          <Led id={id} x={400} y={235} color="#22c55e" />
        </g>
      );
    case "router_lights":
      return (
        <g>
          <rect x="40" y="90" width="560" height="230" rx="18" fill="#e8ebef" />
          <rect x="70" y="140" width="500" height="130" rx="10" fill="#141920" />
          {[["PWR", 130, "#22c55e", true], ["DSL", 245, "#f59e0b", true], ["NET", 360, "#22c55e", false], ["WIFI", 475, "#22c55e", true]].map(([t, x, c, on], i) => (
            <g key={i}>
              <Led id={id} x={x as number} y={195} r={20} color={c as string} on={on as boolean} blink={t === "DSL" && blink} />
              <text x={x as number} y={250} textAnchor="middle" fontFamily="sans-serif" fontSize="14" fontWeight="600" fill="#9aa3b0" letterSpacing="2">{t}</text>
            </g>
          ))}
        </g>
      );
    case "router_blur":
      return (
        <g>
          <g filter={`url(#${id}-blur)`}>
            <rect x="40" y="90" width="560" height="230" rx="18" fill="#dfe3e8" />
            <rect x="70" y="140" width="500" height="130" rx="10" fill="#1a2028" />
            <circle cx="130" cy="195" r="20" fill="#22c55e" /><circle cx="245" cy="195" r="20" fill="#f59e0b" />
            <circle cx="360" cy="195" r="20" fill="#3a4350" /><circle cx="475" cy="195" r="20" fill="#22c55e" />
          </g>
          <ellipse cx="380" cy="160" rx="170" ry="70" fill="#fff" opacity="0.55" filter={`url(#${id}-glow)`} />
        </g>
      );
    case "router_rear":
      return (
        <g>
          <rect x="60" y="80" width="520" height="250" rx="14" fill="#cfd4db" />
          <rect x="90" y="120" width="460" height="170" rx="8" fill="#2a303a" />
          {[150, 240, 330].map((x, i) => (<g key={i}><rect x={x - 28} y={150} width="56" height="46" rx="4" fill="#0e1218" /><rect x={x - 20} y={158} width="40" height="30" fill="#3b424e" /></g>))}
          <rect x="410" y="150" width="56" height="46" rx="4" fill="#0e1218" />
          <path d="M438 196 C438 260 470 300 470 400" stroke="#facc15" strokeWidth="9" fill="none" />
          <path d="M150 196 C140 270 100 300 80 400" stroke="#3b82f6" strokeWidth="9" fill="none" />
          <circle cx="510" cy="225" r="20" fill="#0e1218" /><path d="M510 245 C520 300 560 330 600 400" stroke="#111" strokeWidth="11" fill="none" />
          <rect x="400" y="268" width="76" height="34" rx="4" fill="#9aa0a8" />
        </g>
      );
    case "boiler_panel":
      return (
        <g>
          <rect x="0" y="0" width="640" height="400" fill="#c9c2b6" opacity="0.25" />
          <rect x="190" y="30" width="260" height="350" rx="12" fill="#f4f5f6" stroke="#cfd3d8" strokeWidth="3" />
          <text x="320" y="75" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="16" fill="#334155">NORTHSTAR ECO 30</text>
          <rect x="230" y="105" width="180" height="90" rx="6" fill="#0f2a1f" />
          <text x="320" y="170" textAnchor="middle" fontFamily="monospace" fontWeight="700" fontSize="56" fill="#86efac">F.22</text>
          <circle cx="260" cy="250" r="22" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="3" /><circle cx="320" cy="250" r="22" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="3" /><circle cx="380" cy="250" r="22" fill="#fca5a5" stroke="#ef4444" strokeWidth="3" />
          <text x="380" y="256" textAnchor="middle" fontFamily="sans-serif" fontSize="12" fontWeight="700" fill="#7f1d1d">RESET</text>
          <rect x="250" y="310" width="140" height="40" rx="6" fill="#e5e7eb" />
        </g>
      );
    case "boiler_pressure":
      return (
        <g>
          <rect x="190" y="30" width="260" height="350" rx="12" fill="#f4f5f6" />
          <circle cx="320" cy="200" r="110" fill="#fff" stroke="#9ca3af" strokeWidth="8" />
          <path d="M240 270 A110 110 0 1 1 400 270" stroke="#e5e7eb" strokeWidth="14" fill="none" />
          <path d="M246 262 A104 104 0 0 1 292 110" stroke="#ef4444" strokeWidth="10" fill="none" />
          <path d="M292 110 A104 104 0 0 1 380 124" stroke="#22c55e" strokeWidth="10" fill="none" />
          <path d="M380 124 A104 104 0 0 1 394 262" stroke="#ef4444" strokeWidth="10" fill="none" />
          <line x1="320" y1="200" x2="340" y2="110" stroke="#111827" strokeWidth="5" strokeLinecap="round" /><circle cx="320" cy="200" r="9" fill="#111827" />
          <text x="320" y="268" textAnchor="middle" fontFamily="sans-serif" fontSize="14" fontWeight="700" fill="#374151">BAR</text>
        </g>
      );
    case "damage_wall":
      return (
        <g>
          <rect width="640" height="400" fill="#d9d5cc" />
          <rect x="0" y="330" width="640" height="70" fill="#7a6a58" />
          <ellipse cx="320" cy="90" rx="170" ry="95" fill="#b69d78" opacity="0.65" />
          <ellipse cx="320" cy="90" rx="110" ry="60" fill="#8f7550" opacity="0.7" />
          <path d="M240 150 q10 40 4 90 M330 160 q-8 50 2 110 M400 140 q6 30 -2 70" stroke="#8f7550" strokeWidth="5" fill="none" opacity="0.6" />
          <path d="M210 60 l30 20 -10 25 40 -10 -5 30" stroke="#f1eee8" strokeWidth="6" fill="none" />
          <rect x="520" y="260" width="22" height="130" fill="#facc15" /><g stroke="#111" strokeWidth="2">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <line key={i} x1="520" x2={i % 2 ? 530 : 534} y1={270 + i * 14} y2={270 + i * 14} />)}</g>
        </g>
      );
    case "damage_vehicle":
      return (
        <g>
          <rect width="640" height="400" fill="#4a5360" />
          <rect x="0" y="300" width="640" height="100" fill="#2d333c" />
          <path d="M60 280 Q70 190 180 170 L400 165 Q520 170 580 280 Z" fill="#8d97a5" />
          <path d="M190 180 L260 120 L420 120 L480 175 Z" fill="#cbd3de" opacity="0.8" />
          <ellipse cx="440" cy="245" rx="60" ry="26" fill="#5b6470" /><path d="M400 238 l30 -8 20 14 -10 18" stroke="#2a2f38" strokeWidth="5" fill="none" />
          <circle cx="170" cy="285" r="42" fill="#15181d" /><circle cx="170" cy="285" r="20" fill="#9aa0a8" /><circle cx="470" cy="285" r="42" fill="#15181d" /><circle cx="470" cy="285" r="20" fill="#9aa0a8" />
        </g>
      );
    case "meter":
      return (
        <g>
          <rect x="140" y="80" width="360" height="240" rx="14" fill="#e5e7eb" />
          <rect x="170" y="130" width="300" height="80" rx="6" fill="#cfe3c8" />
          <text x="320" y="190" textAnchor="middle" fontFamily="monospace" fontWeight="700" fontSize="56" fill="#1f2937" letterSpacing="6">04817</text>
        </g>
      );
  }
}
