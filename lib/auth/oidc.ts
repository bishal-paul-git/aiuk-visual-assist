import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from "jose";
import type { User, UserRole } from "@/lib/domain/types";
import { tenants, users } from "@/lib/config/catalog";
import { ROLES, isPlatformRole } from "@/lib/auth/rbac";
import type { IdentityProvider, OidcProviderConfig, SignInErrorCode, SignInResult, SignInStart } from "@/lib/auth/identity";

/**
 * Workforce sign-in through OpenID Connect (docs/06 §2: SSO, MFA, RBAC,
 * tenant isolation). Server only: imports node:crypto and must never reach a
 * client bundle.
 *
 * Authorization Code flow with PKCE (S256), `state` and `nonce`:
 * 1. `beginSignIn` discovers the issuer, mints state / nonce / code verifier and
 *    returns the authorisation URL plus a sealed transaction. The route keeps
 *    the transaction in a short-lived, encrypted and signed (AES-GCM), HttpOnly cookie.
 * 2. `completeSignIn` checks the transaction and state, exchanges the code at
 *    the token endpoint, and validates the ID token with `jose`: signature
 *    against the issuer's JWKS (asymmetric algorithms only), `iss`, `aud`,
 *    `azp`, `exp` / `iat` / `nbf` and `nonce`; optionally `amr` for MFA.
 * 3. The claims are mapped to a workforce user: matched by verified email to a
 *    catalog user, or provisioned just in time. Roles and tenant come from the
 *    configured claims (OIDC_ROLE_CLAIM / OIDC_TENANT_CLAIM and their maps).
 *    Users who cannot be mapped to a role and a tenant are refused.
 */

export const OIDC_TX_COOKIE = "va_oidc_tx";
export const OIDC_ID_TOKEN_COOKIE = "va_oidc_idt";
/** A sign-in attempt must complete within this many seconds. */
export const OIDC_TX_TTL_SEC = 600;
/** Allowed clock skew between this server and the IdP when checking exp / iat / nbf. */
export const CLOCK_TOLERANCE_SEC = 60;
/** Tenant id carried by platform roles (aiuk_admin, qa_reviewer), as in the catalog. */
export const PLATFORM_TENANT_ID = "aiuk";

/** Asymmetric JWS algorithms only: never `none`, never HMAC with the client secret. */
const SAFE_ALGS = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA", "Ed25519"];
const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const HTTP_TIMEOUT_MS = 10_000;

export class OidcConfigError extends Error {
  constructor(message: string) {
    super(`[auth] ${message}`);
    this.name = "OidcConfigError";
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

type Env = Record<string, string | undefined>;

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** HTTPS everywhere except a loopback test IdP. */
function requireSecureUrl(value: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OidcConfigError(`${what} is not a valid URL: ${value}`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    throw new OidcConfigError(`${what} must use https: ${value}`);
  }
  return url;
}

function parseJsonMap(name: string, raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OidcConfigError(`${name} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new OidcConfigError(`${name} must be a JSON object of claim value → value`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== "string") throw new OidcConfigError(`${name}: the value for "${k}" must be a string`);
    out[k] = v;
  }
  return out;
}

function list(raw: string | undefined, fallback: string[]): string[] {
  const items = (raw ?? "").split(/[\s,]+/).filter(Boolean);
  return items.length ? items : fallback;
}

/**
 * Read the OIDC configuration from the environment. Undefined when
 * OIDC_ISSUER is not set; throws OidcConfigError when it is set but the rest is
 * incomplete or invalid (fail closed rather than run half-configured).
 */
export function oidcConfigFromEnv(env: Env = process.env): OidcProviderConfig | undefined {
  const issuer = env.OIDC_ISSUER?.trim();
  if (!issuer) return undefined;
  requireSecureUrl(issuer, "OIDC_ISSUER");
  const clientId = env.OIDC_CLIENT_ID?.trim();
  if (!clientId) throw new OidcConfigError("OIDC_CLIENT_ID is required when OIDC_ISSUER is set");

  const base = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  const basePath = (env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
  const redirectUri = env.OIDC_REDIRECT_URI?.trim() || (base ? `${base}${basePath}/api/auth/callback` : undefined);
  if (redirectUri) requireSecureUrl(redirectUri, "OIDC_REDIRECT_URI");
  const postLogoutRedirectUri = env.OIDC_POST_LOGOUT_REDIRECT_URI?.trim() || (base ? `${base}${basePath}/sign-in?signed_out=1` : undefined);

  const scopes = list(env.OIDC_SCOPES, ["openid", "profile", "email"]);
  if (!scopes.includes("openid")) scopes.unshift("openid");

  const roleMapRaw = parseJsonMap("OIDC_ROLE_MAP", env.OIDC_ROLE_MAP);
  const roleMap: Record<string, UserRole> = {};
  for (const [claimValue, role] of Object.entries(roleMapRaw)) {
    if (!ROLES.includes(role as UserRole)) throw new OidcConfigError(`OIDC_ROLE_MAP: "${role}" is not a role (${ROLES.join(", ")})`);
    roleMap[claimValue] = role as UserRole;
  }
  const tenantMap = parseJsonMap("OIDC_TENANT_MAP", env.OIDC_TENANT_MAP);
  for (const tenantId of Object.values(tenantMap)) {
    if (!tenants.some((t) => t.id === tenantId)) throw new OidcConfigError(`OIDC_TENANT_MAP: "${tenantId}" is not a known tenant id`);
  }

  const clientSecret = env.OIDC_CLIENT_SECRET || undefined;
  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    postLogoutRedirectUri,
    scopes,
    providerName: env.OIDC_PROVIDER_NAME?.trim() || "SSO",
    roleClaim: env.OIDC_ROLE_CLAIM?.trim() || "roles",
    tenantClaim: env.OIDC_TENANT_CLAIM?.trim() || undefined,
    roleMap,
    tenantMap,
    requireMfa: env.OIDC_REQUIRE_MFA === "1" || env.OIDC_REQUIRE_MFA === "true",
    mfaAmrValues: list(env.OIDC_MFA_AMR_VALUES, ["mfa"]),
  };
}

// ---------------------------------------------------------------------------
// Sealed transaction (state, nonce, PKCE verifier) for the short-lived cookie
// ---------------------------------------------------------------------------

export interface OidcTransaction {
  v: 1;
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  returnTo?: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

/**
 * AES-256-GCM with a key derived from AUTH_SECRET (HKDF, domain-separated from
 * the session cookie HMAC): the cookie is authenticated (tamper-proof) and the
 * PKCE verifier and nonce are not readable even by someone holding the cookie.
 */
function txKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "visual-assist oidc transaction v1", 32));
}

export function sealTransaction(tx: OidcTransaction, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", txKey(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(tx), "utf8"), cipher.final()]);
  return [iv, data, cipher.getAuthTag()].map((b) => b.toString("base64url")).join(".");
}

export function unsealTransaction(value: string | undefined, secret: string, nowSec: number): OidcTransaction | undefined {
  if (!value || value.length > 2048) return undefined;
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  const [iv, data, tag] = parts.map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== 12 || tag.length !== 16 || data.length === 0) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", txKey(secret), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const tx = JSON.parse(plain) as OidcTransaction;
    if (tx?.v !== 1 || typeof tx.state !== "string" || typeof tx.nonce !== "string" || typeof tx.verifier !== "string") return undefined;
    if (typeof tx.redirectUri !== "string" || typeof tx.exp !== "number" || tx.exp <= nowSec) return undefined;
    return tx;
  } catch {
    return undefined;
  }
}

function random(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------------------
// Claims → workforce user
// ---------------------------------------------------------------------------

/** Read a claim by exact name (Auth0 namespaced claims contain dots), then as a dot path (Keycloak `realm_access.roles`). */
export function claimValues(claims: Record<string, unknown>, name: string): string[] {
  let value: unknown = claims[name];
  if (value === undefined && name.includes(".")) {
    value = name.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), claims);
  }
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  return [];
}

export type ClaimMapping =
  | { ok: true; user: User; source: "catalog" | "jit"; roleFrom: "claim" | "catalog"; tenantFrom: "claim" | "catalog" | "platform" }
  | { ok: false; code: Extract<SignInErrorCode, "no_role" | "no_tenant" | "inactive">; reason: string };

function claimString(claims: Record<string, unknown>, name: string): string | undefined {
  const v = claims[name];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Stable, opaque user id for a just-in-time user: derived from issuer + subject, never from the email. */
export function jitUserId(issuer: string, sub: string): string {
  return `usr_oidc_${createHash("sha256").update(`${issuer}|${sub}`).digest("hex").slice(0, 20)}`;
}

/**
 * Map validated ID token claims to a workforce user.
 *
 * - Catalog match: by email, only when the IdP has not said the email is
 *   unverified (`email_verified: false`). A disabled or invited catalog user is refused.
 * - Role: the most privileged app role mapped from `roleClaim` (the IdP is
 *   authoritative); otherwise the matched catalog user's role; otherwise refused.
 * - Tenant: platform roles use the platform tenant; otherwise exactly one tenant
 *   mapped from `tenantClaim`, else the matched catalog user's tenant; otherwise refused.
 */
export function mapClaimsToUser(claims: Record<string, unknown>, config: OidcProviderConfig, issuer = config.issuer): ClaimMapping {
  const sub = claimString(claims, "sub");
  if (!sub) return { ok: false, code: "no_role", reason: "ID token has no subject" };

  const upn = claimString(claims, "preferred_username") ?? claimString(claims, "upn");
  const email = claimString(claims, "email") ?? (upn?.includes("@") ? upn : undefined);
  const emailTrusted = claims.email_verified !== false && claims.email_verified !== "false";
  const catalogUser = email && emailTrusted ? users.find((u) => u.email.toLowerCase() === email.toLowerCase()) : undefined;
  if (catalogUser && catalogUser.status !== "active") {
    return { ok: false, code: "inactive", reason: `Catalog user ${catalogUser.id} is ${catalogUser.status}` };
  }

  const roleValues = claimValues(claims, config.roleClaim);
  const hasRoleMap = Object.keys(config.roleMap).length > 0;
  const mappedRoles = roleValues
    .map((v) => (hasRoleMap ? config.roleMap[v] : ROLES.includes(v as UserRole) ? (v as UserRole) : undefined))
    .filter((r): r is UserRole => Boolean(r));
  const claimRole = ROLES.find((r) => mappedRoles.includes(r));
  const role = claimRole ?? catalogUser?.role;
  if (!role) {
    const seen = roleValues.length ? roleValues.slice(0, 10).join(", ") : "none";
    return { ok: false, code: "no_role", reason: `No Visual Assist role mapped from claim "${config.roleClaim}" (values: ${seen})` };
  }

  let tenantId: string | undefined;
  let tenantFrom: "claim" | "catalog" | "platform";
  if (isPlatformRole(role)) {
    tenantId = PLATFORM_TENANT_ID;
    tenantFrom = "platform";
  } else {
    const hasTenantMap = Object.keys(config.tenantMap).length > 0;
    const mappedTenants = config.tenantClaim
      ? [
          ...new Set(
            claimValues(claims, config.tenantClaim)
              .map((v) => (hasTenantMap ? config.tenantMap[v] : tenants.some((t) => t.id === v) ? v : undefined))
              .filter((t): t is string => Boolean(t)),
          ),
        ]
      : [];
    if (mappedTenants.length > 1) {
      return { ok: false, code: "no_tenant", reason: `Claim "${config.tenantClaim}" maps to more than one tenant (${mappedTenants.join(", ")})` };
    }
    tenantId = mappedTenants[0] ?? catalogUser?.tenantId;
    tenantFrom = mappedTenants[0] ? "claim" : "catalog";
    if (!tenantId || tenantId === PLATFORM_TENANT_ID) {
      return {
        ok: false,
        code: "no_tenant",
        reason: config.tenantClaim
          ? `No tenant mapped from claim "${config.tenantClaim}"`
          : "No tenant: OIDC_TENANT_CLAIM is not set and the user is not in the catalog",
      };
    }
  }

  const given = claimString(claims, "given_name");
  const family = claimString(claims, "family_name");
  const name = catalogUser?.name ?? claimString(claims, "name") ?? ([given, family].filter(Boolean).join(" ") || email || "Workforce user");
  const user: User = {
    id: catalogUser?.id ?? jitUserId(issuer, sub),
    tenantId,
    role,
    name,
    email: catalogUser?.email ?? email ?? "",
    status: "active",
    ...(catalogUser?.teamId && catalogUser.tenantId === tenantId ? { teamId: catalogUser.teamId } : {}),
  };
  return { ok: true, user, source: catalogUser ? "catalog" : "jit", roleFrom: claimRole ? "claim" : "catalog", tenantFrom };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  id_token_signing_alg_values_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface OidcDeps {
  /** Secret the transaction cookie key is derived from (AUTH_SECRET). */
  secret: () => string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Clock in epoch milliseconds; injected for tests. */
  now?: () => number;
}

class OidcFlowError extends Error {
  constructor(
    readonly code: SignInErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const g = globalThis as unknown as { __aiukOidcDirectory?: Map<string, User> };

/**
 * Users who signed in through OIDC, keyed by user id (the session subject).
 * In memory: after a restart users sign in again (usually silently at the IdP).
 */
export function oidcDirectory(): Map<string, User> {
  return (g.__aiukOidcDirectory ??= new Map());
}

function stripSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

export class OidcIdentityProvider implements IdentityProvider {
  readonly id = "oidc";
  readonly demo = false;
  readonly displayName: string;
  private discovery?: { value: OidcMetadata; at: number };
  private jwks?: { uri: string; get: ReturnType<typeof createRemoteJWKSet> };

  constructor(
    readonly config: OidcProviderConfig,
    private readonly deps: OidcDeps,
  ) {
    this.displayName = config.providerName;
  }

  private get fetch(): typeof fetch {
    return this.deps.fetch ?? globalThis.fetch;
  }

  private nowMs(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Issuer discovery (`/.well-known/openid-configuration`), cached for an hour. */
  async metadata(): Promise<OidcMetadata> {
    if (this.discovery && this.nowMs() - this.discovery.at < DISCOVERY_TTL_MS) return this.discovery.value;
    const url = `${stripSlash(this.config.issuer)}/.well-known/openid-configuration`;
    const res = await this.fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!res.ok) throw new OidcFlowError("idp_unavailable", `Discovery failed: HTTP ${res.status}`);
    const m = (await res.json()) as Partial<OidcMetadata>;
    // OIDC Discovery §4.3: the issuer in the document must be the issuer we asked for.
    if (typeof m.issuer !== "string" || stripSlash(m.issuer) !== stripSlash(this.config.issuer)) {
      throw new OidcFlowError("idp_unavailable", `Discovery issuer mismatch: expected ${this.config.issuer}, got ${String(m.issuer)}`);
    }
    for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
      if (typeof m[key] !== "string") throw new OidcFlowError("idp_unavailable", `Discovery document has no ${key}`);
      requireSecureUrl(m[key], key);
    }
    if (m.end_session_endpoint !== undefined) requireSecureUrl(m.end_session_endpoint, "end_session_endpoint");
    const value = m as OidcMetadata;
    this.discovery = { value, at: this.nowMs() };
    return value;
  }

  private keySet(uri: string) {
    if (this.jwks?.uri !== uri) {
      const f = this.deps.fetch;
      this.jwks = {
        uri,
        get: createRemoteJWKSet(new URL(uri), {
          timeoutDuration: HTTP_TIMEOUT_MS,
          ...(f ? { [customFetch]: (u: string, o: RequestInit) => f(u, o) } : {}),
        }),
      };
    }
    return this.jwks.get;
  }

  private algorithms(m: OidcMetadata): string[] {
    const advertised = m.id_token_signing_alg_values_supported ?? ["RS256"];
    const algs = advertised.filter((a) => SAFE_ALGS.includes(a));
    if (algs.length === 0) throw new OidcFlowError("idp_unavailable", `No supported ID token algorithm (issuer offers ${advertised.join(", ")})`);
    return algs;
  }

  private redirectUriFor(baseUrl: string): string {
    return this.config.redirectUri ?? `${stripSlash(baseUrl)}/api/auth/callback`;
  }

  async beginSignIn(input: { returnTo?: string; baseUrl: string }): Promise<SignInStart> {
    const m = await this.metadata();
    const tx: OidcTransaction = {
      v: 1,
      state: random(),
      nonce: random(),
      verifier: random(48),
      redirectUri: this.redirectUriFor(input.baseUrl),
      ...(input.returnTo ? { returnTo: input.returnTo } : {}),
      exp: Math.floor(this.nowMs() / 1000) + OIDC_TX_TTL_SEC,
    };
    const url = new URL(m.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", tx.redirectUri);
    url.searchParams.set("scope", this.config.scopes.join(" "));
    url.searchParams.set("state", tx.state);
    url.searchParams.set("nonce", tx.nonce);
    url.searchParams.set("code_challenge", pkceChallenge(tx.verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return { kind: "redirect", url: url.toString(), transaction: sealTransaction(tx, this.deps.secret()) };
  }

  /**
   * Input: `code`, `state`, `error`, `error_description` from the callback
   * query and `transaction` (the transaction cookie value).
   */
  async completeSignIn(input: Record<string, string | undefined>): Promise<SignInResult> {
    try {
      const tx = unsealTransaction(input.transaction, this.deps.secret(), Math.floor(this.nowMs() / 1000));
      if (!tx) throw new OidcFlowError("expired", "Sign-in transaction missing, tampered with or expired");
      if (input.error)
        throw new OidcFlowError(
          "idp_error",
          `IdP returned ${input.error.slice(0, 80)}${input.error_description ? `: ${input.error_description.slice(0, 200)}` : ""}`,
        );
      if (!input.state || !safeEqual(input.state, tx.state)) throw new OidcFlowError("invalid_request", "State mismatch");
      if (!input.code) throw new OidcFlowError("invalid_request", "No authorisation code");

      const m = await this.metadata();
      const idToken = await this.exchangeCode(m, input.code, tx);
      const claims = await this.validateIdToken(m, idToken, tx.nonce);

      if (this.config.requireMfa) {
        const amr = claimValues(claims, "amr");
        if (!amr.some((v) => this.config.mfaAmrValues.includes(v))) {
          throw new OidcFlowError("mfa_required", `MFA required: amr was [${amr.join(", ")}], expected one of [${this.config.mfaAmrValues.join(", ")}]`);
        }
      }

      const mapped = mapClaimsToUser(claims, this.config, m.issuer);
      if (!mapped.ok) throw new OidcFlowError(mapped.code, mapped.reason);
      oidcDirectory().set(mapped.user.id, mapped.user);
      return {
        ok: true,
        subject: mapped.user.id,
        idToken,
        claims: {
          sub: claims.sub,
          amr: claimValues(claims, "amr"),
          source: mapped.source,
          roleFrom: mapped.roleFrom,
          tenantFrom: mapped.tenantFrom,
        },
      };
    } catch (e) {
      if (e instanceof OidcFlowError) return { ok: false, code: e.code, reason: e.message };
      if (e instanceof OidcConfigError) return { ok: false, code: "idp_unavailable", reason: e.message };
      return { ok: false, code: "idp_unavailable", reason: (e as Error).message ?? "Sign-in failed" };
    }
  }

  private async exchangeCode(m: OidcMetadata, code: string, tx: OidcTransaction): Promise<string> {
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: tx.redirectUri, code_verifier: tx.verifier });
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
    const { clientId, clientSecret } = this.config;
    if (clientSecret) {
      const methods = m.token_endpoint_auth_methods_supported ?? ["client_secret_basic"];
      if (methods.includes("client_secret_basic") || !methods.includes("client_secret_post")) {
        // RFC 6749 §2.3.1: form-encode both parts before Basic encoding.
        const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
        headers.Authorization = `Basic ${Buffer.from(`${enc(clientId)}:${enc(clientSecret)}`).toString("base64")}`;
      } else {
        body.set("client_id", clientId);
        body.set("client_secret", clientSecret);
      }
    } else {
      body.set("client_id", clientId);
    }

    let res: Response;
    try {
      res = await this.fetch(m.token_endpoint, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    } catch (e) {
      throw new OidcFlowError("idp_unavailable", `Token endpoint unreachable: ${(e as Error).message}`);
    }
    const json = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown; error_description?: unknown };
    if (!res.ok) {
      const err = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
      throw new OidcFlowError(res.status >= 500 ? "idp_unavailable" : "token_invalid", `Token exchange failed: ${err.slice(0, 120)}`);
    }
    if (typeof json.id_token !== "string") throw new OidcFlowError("token_invalid", "Token response has no id_token");
    return json.id_token;
  }

  private async validateIdToken(m: OidcMetadata, idToken: string, nonce: string): Promise<JWTPayload> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, this.keySet(m.jwks_uri), {
        issuer: m.issuer,
        audience: this.config.clientId,
        algorithms: this.algorithms(m),
        clockTolerance: CLOCK_TOLERANCE_SEC,
        requiredClaims: ["sub", "iat", "exp"],
        currentDate: new Date(this.nowMs()),
      }));
    } catch (e) {
      if (e instanceof OidcFlowError) throw e;
      throw new OidcFlowError("token_invalid", `ID token rejected: ${(e as Error).message}`);
    }
    // OIDC Core §3.1.3.7: with several audiences, azp must be this client; if present, it must be this client.
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if ((aud.length > 1 || payload.azp !== undefined) && payload.azp !== this.config.clientId) {
      throw new OidcFlowError("token_invalid", "ID token rejected: azp is not this client");
    }
    if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, nonce)) {
      throw new OidcFlowError("token_invalid", "ID token rejected: nonce mismatch");
    }
    return payload;
  }

  resolveUser(subject: string): User | undefined {
    const user = oidcDirectory().get(subject);
    if (!user) return undefined;
    // A catalog account disabled since sign-in takes effect immediately.
    const catalog = users.find((u) => u.id === subject);
    if (catalog && catalog.status !== "active") return undefined;
    return user;
  }

  /** RP-initiated logout URL when the issuer advertises `end_session_endpoint`. */
  async logoutUrl(input: { idTokenHint?: string; baseUrl: string }): Promise<string | undefined> {
    let m: OidcMetadata;
    try {
      m = await this.metadata();
    } catch {
      return undefined;
    }
    if (!m.end_session_endpoint) return undefined;
    const url = new URL(m.end_session_endpoint);
    if (input.idTokenHint) url.searchParams.set("id_token_hint", input.idTokenHint);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("post_logout_redirect_uri", this.config.postLogoutRedirectUri ?? `${stripSlash(input.baseUrl)}/sign-in?signed_out=1`);
    return url.toString();
  }
}
