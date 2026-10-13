import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTurnCache, resolveIceServers, turnTtlSec, twilioTurnConfigured } from "@/lib/server/turn";

const ENV = { TURN_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "secret-token" };
const TWILIO_BODY = {
  ice_servers: [
    { url: "stun:global.stun.twilio.com:3478", urls: "stun:global.stun.twilio.com:3478" },
    { url: "turn:global.turn.twilio.com:3478?transport=udp", urls: "turn:global.turn.twilio.com:3478?transport=udp", username: "u1", credential: "c1" },
  ],
};
const ok = () => new Response(JSON.stringify(TWILIO_BODY), { status: 201, headers: { "content-type": "application/json" } });

describe("Twilio TURN", () => {
  beforeEach(() => resetTurnCache());

  it("is only used when TURN_PROVIDER=twilio and Twilio credentials are set", async () => {
    expect(twilioTurnConfigured(ENV)).toBe(true);
    expect(twilioTurnConfigured({ ...ENV, TURN_PROVIDER: "" })).toBe(false);
    expect(twilioTurnConfigured({ TURN_PROVIDER: "twilio" })).toBe(false);
    const fetchMock = vi.fn(async () => ok());
    const servers = await resolveIceServers({ ICE_SERVERS: '[{"urls":"stun:stun.example.com:3478"}]' }, fetchMock as unknown as typeof fetch);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(servers).toEqual([{ urls: "stun:stun.example.com:3478" }]);
  });

  it("mints a token with basic auth and the TTL, and returns its TURN servers", async () => {
    const fetchMock = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => ok());
    const servers = await resolveIceServers({ ...ENV, TWILIO_TURN_TTL_SEC: "7200" }, fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Tokens.json");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Basic ${Buffer.from("ACtest:secret-token").toString("base64")}`);
    expect(String(init?.body)).toBe("Ttl=7200");
    expect(servers).toContainEqual({ urls: "turn:global.turn.twilio.com:3478?transport=udp", username: "u1", credential: "c1" });
  });

  it("reuses the token until an hour before expiry, then mints a new one", async () => {
    let t = 0;
    const now = () => t;
    const fetchMock = vi.fn(async () => ok());
    const f = fetchMock as unknown as typeof fetch;
    await resolveIceServers(ENV, f, now);
    t = 22 * 3600_000;
    await resolveIceServers(ENV, f, now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    t = 23.5 * 3600_000;
    await resolveIceServers(ENV, f, now);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to ICE_SERVERS when Twilio fails", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    const servers = await resolveIceServers({ ...ENV, ICE_SERVERS: '[{"urls":"stun:stun.example.com:3478"}]' }, fetchMock as unknown as typeof fetch);
    expect(servers).toEqual([{ urls: "stun:stun.example.com:3478" }]);
  });

  it("bounds the TTL between 1 hour and 48 hours", () => {
    expect(turnTtlSec({})).toBe(86_400);
    expect(turnTtlSec({ TWILIO_TURN_TTL_SEC: "60" })).toBe(86_400);
    expect(turnTtlSec({ TWILIO_TURN_TTL_SEC: "7200" })).toBe(7200);
  });
});
