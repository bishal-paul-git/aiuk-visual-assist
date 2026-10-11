export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatMinutes(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function secondsBetween(a?: string, b?: string | number): number {
  if (!a) return NaN;
  const end = typeof b === "number" ? b : b ? Date.parse(b) : Date.now();
  return (end - Date.parse(a)) / 1000;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const timeSecFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/London" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "Europe/London" });

export const formatTime = (iso?: string) => (iso ? timeFmt.format(new Date(iso)) : "—");
export const formatTimeSec = (iso?: string) => (iso ? timeSecFmt.format(new Date(iso)) : "—");
export const formatDateTime = (iso?: string) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");
export const formatDay = (iso: string | number) => dayFmt.format(new Date(iso));

export function formatRelative(iso?: string, now = Date.now()): string {
  if (!iso) return "—";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function formatGBP(n: number, digits = 2): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function pct(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function confidencePct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Request-time timestamp for seeding client clocks (kept out of component bodies). */
export function serverNow(): number {
  return Date.now();
}
