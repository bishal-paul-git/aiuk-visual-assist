import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { newSessionClaims, signSession, verifySession } from "@/lib/auth/session-token";
import { DemoIdentityProvider } from "@/lib/auth/identity";
import { securityEvents } from "@/lib/auth/security-log";
import { authSecret, checkUser, safeNextPath, userFromToken } from "@/lib/server/auth";
import { users } from "@/lib/config/catalog";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const NOW = 1_800_000_000;

function tamperPayload(token: string, patch: Record<string, unknown>): string {
  const [v, payload, sig] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return [v, Buffer.from(JSON.stringify({ ...claims, ...patch })).toString("base64url"), sig].join(".");
}

describe("session cookie signing", () => {
  const token = signSession(newSessionClaims("usr_sarah", "demo", NOW), SECRET);

  it("round-trips valid claims", () => {
    const r = verifySession(token, SECRET, NOW + 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.sub).toBe("usr_sarah");
      expect(r.claims.idp).toBe("demo");
      expect(r.claims.exp).toBe(NOW + 8 * 3600);
    }
  });

  it("rejects a token signed with another secret", () => {
    expect(verifySession(token, `${SECRET}-other`, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects tampered claims (privilege escalation by editing the subject)", () => {
    expect(verifySession(tamperPayload(token, { sub: "usr_james" }), SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySession(tamperPayload(token, { exp: NOW + 10 ** 9 }), SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered or truncated signature", () => {
    const [v, p, sig] = token.split(".");
    const flipped = sig.slice(0, -2) + (sig.endsWith("AA") ? "AB" : "AA");
    expect(verifySession([v, p, flipped].join("."), SECRET, NOW).ok).toBe(false);
    expect(verifySession([v, p, sig.slice(0, 10)].join("."), SECRET, NOW).ok).toBe(false);
    expect(verifySession([v, p, ""].join("."), SECRET, NOW).ok).toBe(false);
  });

  it("rejects expired tokens and tokens issued in the future", () => {
    expect(verifySession(token, SECRET, NOW + 8 * 3600)).toEqual({ ok: false, reason: "expired" });
    const future = signSession(newSessionClaims("usr_sarah", "demo", NOW + 3600), SECRET);
    expect(verifySession(future, SECRET, NOW)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects malformed input", () => {
    for (const bad of [undefined, null, "", "abc", "v2.a.b", "v1.a", "v1.a.b.c", "x".repeat(5000)]) {
      expect(verifySession(bad, SECRET, NOW).ok).toBe(false);
    }
    // Validly signed but not a claims object.
    const junk = "v1." + Buffer.from('"hello"').toString("base64url");
    const sig = createHmac("sha256", SECRET).update(junk).digest("base64url");
    expect(verifySession(`${junk}.${sig}`, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("server identity resolution", () => {
  const secret = authSecret();

  it("resolves a valid cookie to the current catalog user", () => {
    const t = signSession(newSessionClaims("usr_tom", "demo"), secret);
    expect(userFromToken(t)?.name).toBe("Tom Hughes");
  });

  it("refuses inactive users, unknown users, other identity providers and forged cookies", () => {
    expect(userFromToken(signSession(newSessionClaims("usr_lena", "demo"), secret))).toBeNull(); // invited, not active
    expect(userFromToken(signSession(newSessionClaims("usr_nobody", "demo"), secret))).toBeNull();
    expect(userFromToken(signSession(newSessionClaims("usr_tom", "okta"), secret))).toBeNull();
    expect(userFromToken(signSession(newSessionClaims("usr_james", "demo"), "attacker-secret-attacker-secret-attacker"))).toBeNull();
    expect(userFromToken(undefined)).toBeNull();
  });

  it("demo provider signs in active users only", async () => {
    const idp = new DemoIdentityProvider();
    expect(await idp.completeSignIn({ userId: "usr_sarah" })).toEqual({ ok: true, subject: "usr_sarah" });
    expect((await idp.completeSignIn({ userId: "usr_lena" })).ok).toBe(false);
    expect((await idp.completeSignIn({})).ok).toBe(false);
  });
});

describe("authorisation responses", () => {
  afterEach(() => {
    securityEvents().length = 0;
  });
  const sarah = users.find((u) => u.id === "usr_sarah")!;

  it("returns 401 JSON when signed out, without auditing anonymous noise", async () => {
    const r = checkUser(null, "session.view");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(401);
      expect(await r.response.json()).toEqual({ error: "Sign in required", code: "unauthenticated" });
    }
    expect(securityEvents()).toHaveLength(0);
  });

  it("returns 403 JSON and audits a permission denial", async () => {
    const r = checkUser(sarah, "session.view", { tenantId: "tnt_brightwater" }, { sessionId: "ses_x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(await r.response.json()).toEqual({ error: "This belongs to another client organisation.", code: "forbidden" });
    }
    const [e] = securityEvents();
    expect(e.eventType).toBe("security.permission_denied");
    expect(e.actorId).toBe("usr_sarah");
    expect(e.tenantId).toBe("tnt_northline");
    expect(e.payload).toMatchObject({ permission: "session.view", resourceTenantId: "tnt_brightwater", sessionId: "ses_x" });
  });

  it("allows permitted users", () => {
    const r = checkUser(sarah, "session.take_over", { tenantId: "tnt_northline" });
    expect(r.ok).toBe(true);
  });

  it("only accepts same-origin relative return paths", () => {
    expect(safeNextPath("/console/sessions/ses_1")).toBe("/console/sessions/ses_1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "console", 42, undefined]) expect(safeNextPath(bad)).toBeUndefined();
  });
});
