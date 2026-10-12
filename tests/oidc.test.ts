import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK, type JWTPayload } from "jose";
import type { OidcProviderConfig, SignInResult } from "@/lib/auth/identity";
import {
  OidcConfigError,
  OidcIdentityProvider,
  jitUserId,
  mapClaimsToUser,
  oidcConfigFromEnv,
  oidcDirectory,
  pkceChallenge,
  sealTransaction,
  unsealTransaction,
} from "@/lib/auth/oidc";
import { buildIdentityProviders } from "@/lib/server/identity-provider";

/**
 * OIDC sign-in against a fake issuer: a locally generated RS256 key pair, and a
 * mocked fetch serving discovery, the JWKS and the token endpoint.
 */

const ISSUER = "https://idp.example.test/tenant-1/v2.0";
const CLIENT_ID = "va-client-id";
const CLIENT_SECRET = "s3cret value/with+symbols";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const BASE_URL = "https://assist.example.test";
const KID = "test-key-1";

const ENTRA_TID = "11111111-2222-3333-4444-555555555555";

function config(overrides: Partial<OidcProviderConfig> = {}): OidcProviderConfig {
  return {
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: `${BASE_URL}/api/auth/callback`,
    scopes: ["openid", "profile", "email"],
    providerName: "Microsoft",
    roleClaim: "roles",
    tenantClaim: "tid",
    roleMap: { "VisualAssist.Agent": "agent", "VisualAssist.Supervisor": "supervisor", "VisualAssist.PlatformAdmin": "aiuk_admin" },
    tenantMap: { [ENTRA_TID]: "tnt_northline" },
    requireMfa: false,
    mfaAmrValues: ["mfa"],
    ...overrides,
  };
}

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
  otherKey = (await generateKeyPair("RS256")).privateKey;
});

afterEach(() => {
  oidcDirectory().clear();
});

interface Harness {
  idp: OidcIdentityProvider;
  /** Token endpoint requests, for assertions on the exchange. */
  tokenRequests: { headers: Headers; body: URLSearchParams }[];
  /** Run begin → IdP → callback; `claims` customises the ID token the IdP issues. */
  signIn(opts?: { claims?: (nonce: string) => JWTPayload; key?: CryptoKey; state?: (state: string) => string; expiresIn?: number }): Promise<SignInResult>;
}

function harness(cfg: OidcProviderConfig = config(), discoveryExtra: Record<string, unknown> = {}): Harness {
  const tokenRequests: Harness["tokenRequests"] = [];
  let issue: (code: string) => Promise<string> = async () => {
    throw new Error("no sign-in in progress");
  };

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: "https://idp.example.test/authorize",
        token_endpoint: "https://idp.example.test/token",
        jwks_uri: "https://idp.example.test/keys",
        end_session_endpoint: "https://idp.example.test/logout",
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        code_challenge_methods_supported: ["S256"],
        ...discoveryExtra,
      });
    }
    if (url === "https://idp.example.test/keys") return Response.json({ keys: [publicJwk] });
    if (url === "https://idp.example.test/token") {
      const body = new URLSearchParams(String(init?.body));
      tokenRequests.push({ headers: new Headers(init?.headers), body });
      return Response.json({ access_token: "at", token_type: "Bearer", id_token: await issue(body.get("code") ?? "") });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const idp = new OidcIdentityProvider(cfg, { secret: () => SECRET, fetch: fakeFetch });

  return {
    idp,
    tokenRequests,
    async signIn(opts = {}) {
      const start = await idp.beginSignIn({ returnTo: "/console", baseUrl: BASE_URL });
      if (start.kind !== "redirect") throw new Error("expected a redirect");
      const auth = new URL(start.url);
      const nonce = auth.searchParams.get("nonce")!;
      const state = auth.searchParams.get("state")!;
      const verifier = unsealTransaction(start.transaction, SECRET, Math.floor(Date.now() / 1000))!.verifier;
      expect(auth.searchParams.get("code_challenge")).toBe(pkceChallenge(verifier));
      issue = async (code) => {
        expect(code).toBe("auth-code-1");
        const now = Math.floor(Date.now() / 1000);
        const claims = opts.claims?.(nonce) ?? defaultClaims(nonce);
        return new SignJWT(claims)
          .setProtectedHeader({ alg: "RS256", kid: KID })
          .setIssuedAt(now - 5)
          .setExpirationTime(now + (opts.expiresIn ?? 3600))
          .sign(opts.key ?? privateKey);
      };
      return idp.completeSignIn({ code: "auth-code-1", state: opts.state ? opts.state(state) : state, transaction: start.transaction });
    },
  };
}

function defaultClaims(nonce: string, extra: JWTPayload = {}): JWTPayload {
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: "entra-oid-abc",
    nonce,
    tid: ENTRA_TID,
    name: "Robin Taylor",
    email: "robin.taylor@northline.example",
    roles: ["VisualAssist.Agent"],
    amr: ["pwd", "mfa"],
    ...extra,
  };
}

describe("OIDC sign-in", () => {
  it("starts an Authorization Code + PKCE flow with state and nonce", async () => {
    const { idp } = harness();
    const start = await idp.beginSignIn({ returnTo: "/platform", baseUrl: BASE_URL });
    expect(start.kind).toBe("redirect");
    if (start.kind !== "redirect") return;
    const url = new URL(start.url);
    expect(url.origin + url.pathname).toBe("https://idp.example.test/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(`${BASE_URL}/api/auth/callback`);
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toHaveLength(43);
    expect(url.searchParams.get("nonce")).toHaveLength(43);
    // The verifier and nonce are sealed (encrypted) in the transaction cookie; only the challenge is sent.
    const tx = unsealTransaction(start.transaction, SECRET, Math.floor(Date.now() / 1000))!;
    expect(start.url).not.toContain(tx.verifier);
    expect(Buffer.from(start.transaction.replace(/\./g, ""), "base64url").toString("latin1")).not.toContain(tx.verifier);
    expect(start.transaction).not.toContain(Buffer.from(tx.verifier).toString("base64url").slice(0, 20));
    expect(unsealTransaction(start.transaction, SECRET, Math.floor(Date.now() / 1000))?.returnTo).toBe("/platform");
  });

  it("signs in a valid user: JIT-provisioned with the mapped role and tenant", async () => {
    const h = harness();
    const r = await h.signIn();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subject).toBe(jitUserId(ISSUER, "entra-oid-abc"));
    const user = h.idp.resolveUser(r.subject);
    expect(user).toMatchObject({ role: "agent", tenantId: "tnt_northline", name: "Robin Taylor", email: "robin.taylor@northline.example", status: "active" });
    expect(r.idToken).toMatch(/^ey/);

    // Token exchange: client_secret_basic, PKCE verifier, the same redirect URI.
    const [req] = h.tokenRequests;
    expect(req.body.get("grant_type")).toBe("authorization_code");
    expect(req.body.get("code_verifier")).toHaveLength(64);
    expect(req.body.get("redirect_uri")).toBe(`${BASE_URL}/api/auth/callback`);
    expect(req.body.get("client_secret")).toBeNull();
    const basic = Buffer.from(req.headers.get("authorization")!.replace(/^Basic /, ""), "base64").toString();
    expect(basic).toBe(`${CLIENT_ID}:${encodeURIComponent(CLIENT_SECRET).replace(/%20/g, "+")}`);
  });

  it("matches a catalog user by email and keeps their id", async () => {
    const h = harness();
    const r = await h.signIn({ claims: (nonce) => defaultClaims(nonce, { email: "Tom.Hughes@northline.example", roles: ["VisualAssist.Supervisor"] }) });
    expect(r.ok && r.subject).toBe("usr_tom");
    expect(h.idp.resolveUser("usr_tom")).toMatchObject({ role: "supervisor", tenantId: "tnt_northline", teamId: "team_nl_l1", name: "Tom Hughes" });
  });

  it("rejects a bad nonce", async () => {
    const r = await harness().signIn({ claims: (nonce) => defaultClaims(`${nonce}x`) });
    expect(r).toMatchObject({ ok: false, code: "token_invalid" });
    expect(!r.ok && r.reason).toMatch(/nonce/);
    expect(oidcDirectory().size).toBe(0);
  });

  it("rejects a missing nonce", async () => {
    const r = await harness().signIn({ claims: (nonce) => ({ ...defaultClaims(nonce), nonce: undefined }) });
    expect(r).toMatchObject({ ok: false, code: "token_invalid" });
  });

  it("rejects a token for another audience", async () => {
    const r = await harness().signIn({ claims: (nonce) => defaultClaims(nonce, { aud: "someone-else" }) });
    expect(r).toMatchObject({ ok: false, code: "token_invalid" });
    expect(!r.ok && r.reason).toMatch(/aud/);
  });

  it("rejects several audiences without azp = this client", async () => {
    const r = await harness().signIn({ claims: (nonce) => defaultClaims(nonce, { aud: [CLIENT_ID, "other-api"] }) });
    expect(r).toMatchObject({ ok: false, code: "token_invalid" });
    expect(!r.ok && r.reason).toMatch(/azp/);
  });

  it("rejects another issuer", async () => {
    const r = await harness().signIn({ claims: (nonce) => defaultClaims(nonce, { iss: "https://evil.example.test" }) });
    expect(r).toMatchObject({ ok: false, code: "token_invalid" });
    expect(!r.ok && r.reason).toMatch(/iss/);
  });

  it("rejects an expired token", async () => {
    const r = await harness().signIn({ expiresIn: -600 });
    expect(r).toMatchObject({ ok: false, code: "token_invalid" });
    expect(!r.ok && r.reason).toMatch(/exp/);
  });

  it("rejects a token signed by a key outside the issuer's JWKS", async () => {
    const r = await harness().signIn({ key: otherKey });
    expect(r).toMatchObject({ ok: false, code: "token_invalid" });
    expect(!r.ok && r.reason).toMatch(/signature/);
  });

  it("rejects a state mismatch and a tampered or missing transaction", async () => {
    expect(await harness().signIn({ state: (s) => `${s}x` })).toMatchObject({ ok: false, code: "invalid_request" });
    const { idp } = harness();
    const start = await idp.beginSignIn({ baseUrl: BASE_URL });
    if (start.kind !== "redirect") throw new Error("expected a redirect");
    const state = new URL(start.url).searchParams.get("state")!;
    expect(await idp.completeSignIn({ code: "c", state, transaction: undefined })).toMatchObject({ ok: false, code: "expired" });
    expect(await idp.completeSignIn({ code: "c", state, transaction: start.transaction.replace(/.$/, "A") + "A" })).toMatchObject({
      ok: false,
      code: "expired",
    });
  });

  it("rejects an expired transaction", () => {
    const now = 1_800_000_000;
    const sealed = sealTransaction({ v: 1, state: "s", nonce: "n", verifier: "v", redirectUri: "https://x/cb", exp: now + 600 }, SECRET);
    expect(unsealTransaction(sealed, SECRET, now)).toBeDefined();
    expect(unsealTransaction(sealed, SECRET, now + 600)).toBeUndefined();
    expect(unsealTransaction(sealed, `${SECRET}-other`, now)).toBeUndefined();
  });

  it("reports an IdP error such as access_denied", async () => {
    const { idp } = harness();
    const start = await idp.beginSignIn({ baseUrl: BASE_URL });
    if (start.kind !== "redirect") throw new Error("expected a redirect");
    const state = new URL(start.url).searchParams.get("state")!;
    const r = await idp.completeSignIn({ error: "access_denied", error_description: "User cancelled", state, transaction: start.transaction });
    expect(r).toMatchObject({ ok: false, code: "idp_error" });
  });

  it("denies a user whose roles do not map to an app role", async () => {
    const r = await harness().signIn({ claims: (nonce) => defaultClaims(nonce, { roles: ["Finance.Reader"], email: "someone@northline.example" }) });
    expect(r).toMatchObject({ ok: false, code: "no_role" });
    expect(!r.ok && r.reason).toMatch(/Finance\.Reader/);
    expect(oidcDirectory().size).toBe(0);
  });

  it("denies a user with no role claim at all", async () => {
    const r = await harness().signIn({ claims: (nonce) => defaultClaims(nonce, { roles: undefined, email: "someone@northline.example" }) });
    expect(r).toMatchObject({ ok: false, code: "no_role" });
  });

  it("enforces MFA through the amr claim when required", async () => {
    const h = harness(config({ requireMfa: true }));
    expect(await h.signIn({ claims: (nonce) => defaultClaims(nonce, { amr: ["pwd"] }) })).toMatchObject({ ok: false, code: "mfa_required" });
    expect(await h.signIn({ claims: (nonce) => defaultClaims(nonce, { amr: undefined }) })).toMatchObject({ ok: false, code: "mfa_required" });
    expect((await h.signIn({ claims: (nonce) => defaultClaims(nonce, { amr: ["pwd", "mfa"] }) })).ok).toBe(true);
  });

  it("does not require MFA unless configured", async () => {
    expect((await harness().signIn({ claims: (nonce) => defaultClaims(nonce, { amr: ["pwd"] }) })).ok).toBe(true);
  });

  it("uses client_secret_post when the issuer does not support basic", async () => {
    const h = harness(config(), { token_endpoint_auth_methods_supported: ["client_secret_post"] });
    expect((await h.signIn()).ok).toBe(true);
    expect(h.tokenRequests[0].body.get("client_secret")).toBe(CLIENT_SECRET);
    expect(h.tokenRequests[0].headers.get("authorization")).toBeNull();
  });

  it("refuses an issuer whose discovery document names a different issuer", async () => {
    const h = harness(config(), { issuer: "https://evil.example.test" });
    await expect(h.idp.beginSignIn({ baseUrl: BASE_URL })).rejects.toThrow(/issuer mismatch/);
  });

  it("refuses HMAC-signed ID tokens even if the issuer advertises them", async () => {
    const h = harness(config(), { id_token_signing_alg_values_supported: ["HS256"] });
    const r = await h.signIn();
    expect(r).toMatchObject({ ok: false, code: "idp_unavailable" });
  });

  it("builds the RP-initiated logout URL", async () => {
    const { idp } = harness(config({ postLogoutRedirectUri: `${BASE_URL}/sign-in?signed_out=1` }));
    const url = new URL((await idp.logoutUrl({ idTokenHint: "hint", baseUrl: BASE_URL }))!);
    expect(url.origin + url.pathname).toBe("https://idp.example.test/logout");
    expect(url.searchParams.get("id_token_hint")).toBe("hint");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(`${BASE_URL}/sign-in?signed_out=1`);
  });
});

describe("OIDC claim mapping", () => {
  const base = { sub: "abc", email: "new.person@example.test", name: "New Person" };

  it("maps role and tenant claims through the configured maps", () => {
    const r = mapClaimsToUser({ ...base, roles: ["VisualAssist.Supervisor"], tid: ENTRA_TID }, config());
    expect(r).toMatchObject({ ok: true, source: "jit", roleFrom: "claim", tenantFrom: "claim", user: { role: "supervisor", tenantId: "tnt_northline" } });
  });

  it("picks the most privileged mapped role", () => {
    const r = mapClaimsToUser({ ...base, roles: ["VisualAssist.Agent", "VisualAssist.Supervisor", "Other"], tid: ENTRA_TID }, config());
    expect(r.ok && r.user.role).toBe("supervisor");
  });

  it("gives platform roles the platform tenant without a tenant claim", () => {
    const r = mapClaimsToUser({ ...base, roles: ["VisualAssist.PlatformAdmin"] }, config());
    expect(r).toMatchObject({ ok: true, tenantFrom: "platform", user: { role: "aiuk_admin", tenantId: "aiuk" } });
  });

  it("uses role names directly when no role map is set (e.g. Okta groups named after roles)", () => {
    const cfg = config({ roleMap: {}, roleClaim: "groups", tenantClaim: "org", tenantMap: {} });
    expect(mapClaimsToUser({ ...base, groups: ["Everyone", "client_admin"], org: "tnt_brightwater" }, cfg)).toMatchObject({
      ok: true,
      user: { role: "client_admin", tenantId: "tnt_brightwater" },
    });
    expect(mapClaimsToUser({ ...base, groups: ["client_admin"], org: "tnt_unknown" }, cfg)).toMatchObject({ ok: false, code: "no_tenant" });
  });

  it("reads nested and namespaced claims", () => {
    const nested = config({ roleMap: {}, roleClaim: "realm_access.roles" });
    expect(mapClaimsToUser({ ...base, realm_access: { roles: ["agent"] }, tid: ENTRA_TID }, nested)).toMatchObject({ ok: true, user: { role: "agent" } });
    const ns = config({ roleMap: {}, roleClaim: "https://assist.example.com/roles" });
    expect(mapClaimsToUser({ ...base, "https://assist.example.com/roles": ["agent"], tid: ENTRA_TID }, ns)).toMatchObject({ ok: true });
  });

  it("denies a client role whose tenant cannot be mapped", () => {
    expect(mapClaimsToUser({ ...base, roles: ["VisualAssist.Agent"], tid: "unknown-tenant" }, config())).toMatchObject({ ok: false, code: "no_tenant" });
    expect(mapClaimsToUser({ ...base, roles: ["VisualAssist.Agent"] }, config({ tenantClaim: undefined }))).toMatchObject({ ok: false, code: "no_tenant" });
  });

  it("denies a tenant claim that maps to more than one tenant", () => {
    const cfg = config({ tenantClaim: "groups", tenantMap: { "NL-Staff": "tnt_northline", "BW-Staff": "tnt_brightwater" } });
    expect(mapClaimsToUser({ ...base, roles: ["VisualAssist.Agent"], groups: ["NL-Staff", "BW-Staff"] }, cfg)).toMatchObject({ ok: false, code: "no_tenant" });
  });

  it("falls back to the matched catalog user's role and tenant", () => {
    const r = mapClaimsToUser({ sub: "x", email: "priya.shah@northline.example" }, config({ tenantClaim: undefined }));
    expect(r).toMatchObject({
      ok: true,
      source: "catalog",
      roleFrom: "catalog",
      tenantFrom: "catalog",
      user: { id: "usr_priya", role: "client_admin", tenantId: "tnt_northline" },
    });
  });

  it("lets IdP role claims override the catalog role", () => {
    const r = mapClaimsToUser({ sub: "x", email: "sarah.jennings@northline.example", roles: ["VisualAssist.Supervisor"], tid: ENTRA_TID }, config());
    expect(r).toMatchObject({ ok: true, user: { id: "usr_sarah", role: "supervisor" } });
  });

  it("refuses inactive catalog users and does not match unverified emails", () => {
    expect(mapClaimsToUser({ sub: "x", email: "lena.morris@brightwater.example" }, config())).toMatchObject({ ok: false, code: "inactive" });
    // Unverified email: no catalog match, so no catalog role to fall back on.
    expect(mapClaimsToUser({ sub: "x", email: "priya.shah@northline.example", email_verified: false }, config())).toMatchObject({ ok: false, code: "no_role" });
  });
});

describe("OIDC configuration", () => {
  const env = {
    OIDC_ISSUER: ISSUER,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: CLIENT_SECRET,
    PUBLIC_BASE_URL: `${BASE_URL}/`,
    OIDC_PROVIDER_NAME: "Microsoft",
    OIDC_TENANT_CLAIM: "tid",
    OIDC_ROLE_MAP: JSON.stringify({ "VisualAssist.Agent": "agent" }),
    OIDC_TENANT_MAP: JSON.stringify({ [ENTRA_TID]: "tnt_northline" }),
    OIDC_REQUIRE_MFA: "1",
    AUTH_SECRET: SECRET,
  };

  it("reads the environment with sensible defaults", () => {
    const cfg = oidcConfigFromEnv(env)!;
    expect(cfg).toMatchObject({
      issuer: ISSUER,
      redirectUri: `${BASE_URL}/api/auth/callback`,
      postLogoutRedirectUri: `${BASE_URL}/sign-in?signed_out=1`,
      scopes: ["openid", "profile", "email"],
      providerName: "Microsoft",
      roleClaim: "roles",
      tenantClaim: "tid",
      roleMap: { "VisualAssist.Agent": "agent" },
      requireMfa: true,
      mfaAmrValues: ["mfa"],
    });
    expect(oidcConfigFromEnv({})).toBeUndefined();
    expect(oidcConfigFromEnv({ ...env, OIDC_SCOPES: "profile email" })!.scopes).toEqual(["openid", "profile", "email"]);
  });

  it("fails closed on incomplete or invalid configuration", () => {
    expect(() => oidcConfigFromEnv({ OIDC_ISSUER: ISSUER })).toThrow(OidcConfigError);
    expect(() => oidcConfigFromEnv({ ...env, OIDC_ISSUER: "http://idp.example.test" })).toThrow(/https/);
    expect(() => oidcConfigFromEnv({ ...env, OIDC_ROLE_MAP: "{not json" })).toThrow(/OIDC_ROLE_MAP/);
    expect(() => oidcConfigFromEnv({ ...env, OIDC_ROLE_MAP: JSON.stringify({ Admins: "superuser" }) })).toThrow(/not a role/);
    expect(() => oidcConfigFromEnv({ ...env, OIDC_TENANT_MAP: JSON.stringify({ x: "tnt_missing" }) })).toThrow(/tenant/);
  });

  it("disables demo sign-in when OIDC is configured, unless ALLOW_DEMO_SIGNIN=1", () => {
    expect(buildIdentityProviders({}).all.map((p) => p.id)).toEqual(["demo"]);
    expect(buildIdentityProviders(env).all.map((p) => p.id)).toEqual(["oidc"]);
    expect(buildIdentityProviders({ ...env, ALLOW_DEMO_SIGNIN: "1" }).all.map((p) => p.id)).toEqual(["oidc", "demo"]);
  });
});
