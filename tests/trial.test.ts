import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TRIAL_EMAIL, DEFAULT_TRIAL_PASSWORD, TRIAL_USER_ID, trialConfig } from "@/lib/auth/trial";
import { checkTrialCredentials, resetTrialLimits, SlidingWindow, takeTrialSession } from "@/lib/server/trial";

const jar = vi.hoisted(() => ({ set: [] as { name: string; value: string }[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: (name: string, value: string) => jar.set.push({ name, value }) }),
}));

describe("trial configuration", () => {
  it("has a ready-made login and lets the owner change it", () => {
    expect(trialConfig({})).toEqual({ email: DEFAULT_TRIAL_EMAIL, password: DEFAULT_TRIAL_PASSWORD, prefill: true, maxSessionsPerDay: 40 });
    expect(trialConfig({ TRIAL_LOGIN_EMAIL: " Tester@Example.com ", TRIAL_LOGIN_PASSWORD: "x y z", TRIAL_PREFILL: "0", TRIAL_MAX_SESSIONS_PER_DAY: "5" })).toEqual({
      email: "tester@example.com",
      password: "x y z",
      prefill: false,
      maxSessionsPerDay: 5,
    });
    expect(trialConfig({ TRIAL_MAX_SESSIONS_PER_DAY: "nope" }).maxSessionsPerDay).toBe(40);
  });

  it("checks the email (any case) and the exact password", () => {
    expect(checkTrialCredentials(DEFAULT_TRIAL_EMAIL.toUpperCase(), DEFAULT_TRIAL_PASSWORD, {})).toBe(true);
    expect(checkTrialCredentials(DEFAULT_TRIAL_EMAIL, "wrong", {})).toBe(false);
    expect(checkTrialCredentials("someone@else.example", DEFAULT_TRIAL_PASSWORD, {})).toBe(false);
    expect(checkTrialCredentials("a@b.c", "pw", { TRIAL_LOGIN_EMAIL: "a@b.c", TRIAL_LOGIN_PASSWORD: "pw" })).toBe(true);
    expect(checkTrialCredentials(DEFAULT_TRIAL_EMAIL, DEFAULT_TRIAL_PASSWORD, { TRIAL_LOGIN_PASSWORD: "changed" })).toBe(false);
  });
});

describe("limits", () => {
  beforeEach(() => resetTrialLimits());

  it("a sliding window forgets old events", () => {
    const w = new SlidingWindow(2, 1000);
    w.record("a", 0);
    w.record("a", 100);
    expect(w.blocked("a", 200)).toBe(true);
    expect(w.blocked("b", 200)).toBe(false);
    expect(w.blocked("a", 1050)).toBe(false);
    expect(w.count("a", 1200)).toBe(0);
  });

  it("only the trial account has a daily allowance, and it resets after a day", () => {
    const env = { TRIAL_MAX_SESSIONS_PER_DAY: "2" };
    expect([1, 2, 3].map((n) => takeTrialSession(TRIAL_USER_ID, env, n))).toEqual([true, true, false]);
    expect(takeTrialSession("usr_tom", env, 4)).toBe(true);
    expect(takeTrialSession(TRIAL_USER_ID, env, 24 * 3600 * 1000 + 5)).toBe(true);
  });
});

describe("POST /api/auth/trial", () => {
  let POST: (r: Request) => Promise<Response>;
  let resetIdentityProviders: () => void;
  const post = (body: unknown, ip = "203.0.113.7") =>
    POST(new Request("http://localhost/api/auth/trial", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

  beforeAll(async () => {
    process.env.AUTH_SECRET = "trial-test-secret-0123456789abcdefghijkl";
    ({ POST } = await import("@/app/api/auth/trial/route"));
    ({ resetIdentityProviders } = await import("@/lib/server/identity-provider"));
  });
  beforeEach(() => {
    resetTrialLimits();
    jar.set.length = 0;
  });
  afterEach(() => {
    delete process.env.OIDC_ISSUER;
    delete process.env.ALLOW_DEMO_SIGNIN;
    resetIdentityProviders();
  });

  it("signs the trial supervisor in with the ready-made login", async () => {
    const res = await post({ email: DEFAULT_TRIAL_EMAIL, password: DEFAULT_TRIAL_PASSWORD });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ next: "/client", user: { id: TRIAL_USER_ID, role: "supervisor", tenantId: "tnt_northline" } });
    expect(jar.set.map((c) => c.name)).toEqual(["va_session"]);
    expect((await (await post({ email: DEFAULT_TRIAL_EMAIL, password: DEFAULT_TRIAL_PASSWORD, next: "/client/results" })).json()).next).toBe("/client/results");
    expect((await (await post({ email: DEFAULT_TRIAL_EMAIL, password: DEFAULT_TRIAL_PASSWORD, next: "https://evil.example" })).json()).next).toBe("/client");
  });

  it("refuses a wrong login without setting a session, and throttles repeated guesses", async () => {
    for (let i = 0; i < 8; i++) expect((await post({ email: DEFAULT_TRIAL_EMAIL, password: "nope" })).status).toBe(401);
    expect(jar.set).toHaveLength(0);
    const blocked = await post({ email: DEFAULT_TRIAL_EMAIL, password: DEFAULT_TRIAL_PASSWORD });
    expect(blocked.status).toBe(429);
    // Another address is not affected.
    expect((await post({ email: DEFAULT_TRIAL_EMAIL, password: DEFAULT_TRIAL_PASSWORD }, "198.51.100.9")).status).toBe(200);
  });

  it("is off when single sign-on replaces the demo sign-in", async () => {
    process.env.OIDC_ISSUER = "https://login.example.com";
    process.env.OIDC_CLIENT_ID = "client";
    process.env.OIDC_CLIENT_SECRET = "secret-secret-secret-secret-1234";
    resetIdentityProviders();
    try {
      expect((await post({ email: DEFAULT_TRIAL_EMAIL, password: DEFAULT_TRIAL_PASSWORD })).status).toBe(403);
    } finally {
      delete process.env.OIDC_CLIENT_ID;
      delete process.env.OIDC_CLIENT_SECRET;
    }
  });
});

describe("staff password for the person-picker", () => {
  let signIn: (r: Request) => Promise<Response>;
  const pick = (userId: string, password?: string) =>
    signIn(new Request("http://localhost/api/auth/sign-in", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.50" }, body: JSON.stringify({ userId, password }) }));

  beforeAll(async () => {
    process.env.AUTH_SECRET = "trial-test-secret-0123456789abcdefghijkl";
    ({ POST: signIn } = await import("@/app/api/auth/sign-in/route"));
  });
  beforeEach(() => {
    resetTrialLimits();
    jar.set.length = 0;
  });
  afterEach(() => {
    delete process.env.STAFF_SIGNIN_PASSWORD;
  });

  it("is open by default, as before", async () => {
    expect((await pick("usr_james")).status).toBe(200);
  });

  it("asks for the password once it is set, for every account except the trial one", async () => {
    process.env.STAFF_SIGNIN_PASSWORD = "correct horse battery";
    expect((await pick("usr_james")).status).toBe(401);
    expect((await pick("usr_james", "wrong")).status).toBe(401);
    expect(jar.set).toHaveLength(0);
    expect((await pick("usr_james", "correct horse battery")).status).toBe(200);
    expect(jar.set).toHaveLength(1);
    expect((await pick("usr_priya", "correct horse battery")).status).toBe(200);
    // The trial account has its own login and is not asked.
    expect((await pick(TRIAL_USER_ID)).status).toBe(200);
  });

  it("ignores a password that is too short to protect anything, and throttles guessing", async () => {
    process.env.STAFF_SIGNIN_PASSWORD = "short";
    expect((await pick("usr_james")).status).toBe(200);
    process.env.STAFF_SIGNIN_PASSWORD = "correct horse battery";
    for (let i = 0; i < 8; i++) await pick("usr_james", "guess");
    expect((await pick("usr_james", "correct horse battery")).status).toBe(429);
  });
});
