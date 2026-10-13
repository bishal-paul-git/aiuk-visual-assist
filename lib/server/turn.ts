import type { IceServer } from "@/lib/media/live-call";
import { parseIceServers } from "@/lib/media/live-call";

/**
 * TURN credentials minted from Twilio Network Traversal.
 *
 * Twilio TURN credentials expire (TWILIO_TURN_TTL_SEC, default 24 h), so a
 * fixed ICE_SERVERS value stops working. With TURN_PROVIDER=twilio and the
 * same TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN used for SMS, the server mints a
 * token on demand and reuses it until an hour before it expires. If Twilio
 * cannot be reached, clients fall back to ICE_SERVERS (or public STUN), so
 * live video still works on simple networks and the preview relay covers the rest.
 */

type Env = Record<string, string | undefined>;

interface Cached {
  servers: IceServer[];
  expiresAt: number;
}

const REFRESH_MARGIN_MS = 60 * 60 * 1000;
let cached: Cached | undefined;
let inflight: Promise<IceServer[] | undefined> | undefined;

export function twilioTurnConfigured(env: Env = process.env): boolean {
  return (env.TURN_PROVIDER ?? "").toLowerCase() === "twilio" && Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
}

export function turnTtlSec(env: Env = process.env): number {
  const n = Number(env.TWILIO_TURN_TTL_SEC);
  return Number.isFinite(n) && n >= 3600 && n <= 172_800 ? Math.round(n) : 86_400;
}

/** ICE servers for an authorised client: Twilio-minted TURN when configured, else ICE_SERVERS, else public STUN. */
export async function resolveIceServers(env: Env = process.env, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Promise<IceServer[]> {
  const fallback = parseIceServers(env.ICE_SERVERS);
  if (!twilioTurnConfigured(env)) return fallback;
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now()) return cached.servers;
  inflight ??= mintTwilio(env, fetchImpl, now).finally(() => {
    inflight = undefined;
  });
  return (await inflight) ?? fallback;
}

async function mintTwilio(env: Env, fetchImpl: typeof fetch, now: () => number): Promise<IceServer[] | undefined> {
  const sid = env.TWILIO_ACCOUNT_SID!;
  const ttl = turnTtlSec(env);
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Tokens.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Ttl: String(ttl) }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { ice_servers?: { urls?: string | string[]; url?: string; username?: string; credential?: string }[] };
    const servers = parseIceServers(JSON.stringify((body.ice_servers ?? []).map((s) => ({ urls: s.urls ?? s.url, username: s.username, credential: s.credential }))));
    const hasTurn = servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith("turn")));
    if (!hasTurn) return undefined;
    cached = { servers, expiresAt: now() + ttl * 1000 };
    return servers;
  } catch {
    return undefined;
  }
}

/** Tests only. */
export function resetTurnCache() {
  cached = undefined;
  inflight = undefined;
}
