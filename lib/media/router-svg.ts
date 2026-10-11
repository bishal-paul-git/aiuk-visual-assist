/**
 * Renders a router illustration as SVG. Used for (a) seeded/synthetic evidence
 * frames and (b) the "demo camera" feed so the full journey can be exercised on
 * devices without a camera. Pure string output — safe on server and client.
 */

export interface RouterScene {
  view: "front" | "close_up" | "rear" | "wide" | "detail";
  power: string;
  internet: string;
  wifi: string;
  cable: "connected" | "disconnected";
  glare?: boolean;
  /** 0..1 subtle camera shake/offset for the live demo feed. */
  wobble?: number;
  otherDevice?: boolean;
}

const LIGHT: Record<string, string> = { on: "#3BD16F", off: "#2A2F36", red: "#E5484D", amber: "#F5A524" };

export function parseSyntheticRef(ref: string): RouterScene | null {
  // synthetic:<view>:<power>-<internet>-<wifi>:<cable>[:glare][:other]
  if (!ref.startsWith("synthetic:")) return null;
  const [, view, lights, cable, ...flags] = ref.split(":");
  const [power, internet, wifi] = (lights ?? "on-off-on").split("-");
  return {
    view: (view as RouterScene["view"]) ?? "front",
    power,
    internet,
    wifi,
    cable: cable === "disconnected" ? "disconnected" : "connected",
    glare: flags.includes("glare"),
    otherDevice: flags.includes("other"),
  };
}

/**
 * The scene is composed on a 640×480 stage, centred on x = 320. A portrait
 * output (a phone held upright) frames the central 460px of the stage, the
 * way a phone camera would, and extends the wall and desk around it.
 */
export function renderRouterSvg(scene: RouterScene, outWidth = 640, outHeight = 480): string {
  const width = 640;
  const height = 480;
  const fit = outHeight > outWidth ? outWidth / 460 : outWidth / width;
  const left = (outWidth - width * fit) / 2;
  const top = (outHeight - height * fit) / 2;
  const w = scene.wobble ?? 0;
  const dx = Math.sin(w * 6.28) * 6;
  const dy = Math.cos(w * 6.28) * 4;
  const bg = `
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#D9D4CB"/><stop offset="1" stop-color="#C7C0B4"/>
      </linearGradient>
      <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8A6A4A"/><stop offset="1" stop-color="#6E5238"/>
      </linearGradient>
      <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#15181D"/><stop offset="0.5" stop-color="#262B33"/><stop offset="1" stop-color="#121418"/>
      </linearGradient>
      <radialGradient id="glare" cx="0.55" cy="0.62" r="0.35">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/><stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${outWidth}" height="${outHeight}" fill="url(#wall)"/>
    <rect y="${top + height * 0.72 * fit}" width="${outWidth}" height="${outHeight}" fill="url(#desk)"/>`;

  let content = "";
  if (scene.otherDevice) {
    content = `<g transform="translate(${170 + dx} ${250 + dy})">
      <rect width="300" height="70" rx="8" fill="url(#body)"/>
      <rect x="20" y="25" width="60" height="18" rx="3" fill="#0B0D10"/>
      <text x="32" y="39" font-family="monospace" font-size="13" fill="#4FC3F7">12:04</text>
      <circle cx="270" cy="35" r="5" fill="#E5484D"/>
      <text x="110" y="42" font-family="Helvetica, Arial" font-size="14" fill="#6B7280">TV BOX</text>
    </g>`;
  } else if (scene.view === "rear") {
    const plugY = scene.cable === "connected" ? 0 : 22;
    content = `<g transform="translate(${110 + dx} ${150 + dy})">
      <rect width="420" height="210" rx="18" fill="url(#body)"/>
      <g font-family="Helvetica, Arial" font-size="12" fill="#9CA3AF">
        <rect x="40" y="120" width="44" height="34" rx="4" fill="#0A0B0D"/><text x="38" y="178">Power</text>
        <rect x="120" y="120" width="40" height="30" rx="3" fill="#0A0B0D"/><text x="118" y="178">LAN 1</text>
        <rect x="180" y="120" width="40" height="30" rx="3" fill="#0A0B0D"/><text x="178" y="178">LAN 2</text>
        <rect x="290" y="120" width="56" height="30" rx="3" fill="#0A0B0D"/><text x="284" y="178">Broadband</text>
      </g>
      <path d="M62 120 C 62 60, 40 30, 20 -40" stroke="#111" stroke-width="12" fill="none"/>
      <rect x="50" y="110" width="24" height="26" rx="3" fill="#1F2329"/>
      <g transform="translate(0 ${-plugY})">
        <path d="M318 112 C 318 40, 360 10, 380 -60" stroke="#9AA3AD" stroke-width="9" fill="none"/>
        <rect x="304" y="108" width="28" height="22" rx="3" fill="#B8C0C8"/>
      </g>
    </g>`;
  } else {
    const close = scene.view === "close_up" || scene.view === "detail";
    const scale = close ? 1.9 : 1;
    // Close-up: centre the light cluster (group x≈190, y≈213) on the stage.
    const ox = close ? -117 : 0;
    const oy = close ? -279 : 0;
    const lights = [
      ["Power", scene.power],
      ["Internet", scene.internet],
      ["WiFi", scene.wifi],
      ["Voice", "on"],
    ]
      .map(([label, state], i) => {
        const y = 150 + i * 42;
        const color = LIGHT[state] ?? LIGHT.off;
        const glow = state !== "off" ? `<circle cx="150" cy="${y}" r="13" fill="${color}" opacity="0.35"/>` : "";
        return `${glow}<circle cx="150" cy="${y}" r="7" fill="${color}" stroke="#0B0D10" stroke-width="1.5"/>
          <text x="166" y="${y + 5}" font-family="Helvetica, Arial" font-size="15" fill="#C9CED6">${label}</text>`;
      })
      .join("");
    content = `<g transform="translate(${ox + dx} ${oy + dy}) scale(${scale})">
      <g transform="translate(${close ? 40 : 195} ${close ? 60 : 40})">
        <rect x="0" y="30" width="250" height="330" rx="26" fill="url(#body)"/>
        <rect x="10" y="40" width="40" height="310" rx="18" fill="#FFFFFF" opacity="0.04"/>
        <text x="40" y="150" font-family="Helvetica, Arial" font-size="40" font-weight="700" fill="#2E343D" transform="rotate(-8 40 150)">north</text>
        ${lights}
      </g>
    </g>`;
  }

  const glare = scene.glare ? `<ellipse cx="${width * 0.55}" cy="${height * 0.58}" rx="${width * 0.32}" ry="${height * 0.24}" fill="url(#glare)"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}">${bg}<g transform="translate(${left} ${top}) scale(${fit})">${content}${glare}</g></svg>`;
}
