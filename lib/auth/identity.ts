import type { User, UserRole } from "@/lib/domain/types";
import { users } from "@/lib/config/catalog";

/**
 * Identity provider abstraction (docs/06 §2: SSO, MFA).
 *
 * The application only ever asks two things of an identity provider:
 * 1. start / complete an interactive sign-in and tell us which subject signed in;
 * 2. resolve a subject to an active workforce user (role + tenant) on each request.
 *
 * The demo provider below signs in a catalog user with no password. Workforce
 * SSO (Microsoft Entra ID, Okta, Auth0 — all OIDC) is `OidcIdentityProvider` in
 * lib/auth/oidc.ts (server only): `beginSignIn` returns the authorisation URL,
 * `completeSignIn` exchanges the code and validates the ID token, and
 * `resolveUser` maps the subject to a user, role and tenant. MFA is enforced by
 * the customer's IdP and asserted through the `amr` claim. Which providers are
 * enabled is decided in lib/server/identity-provider.ts.
 */

export type SignInStart =
  /** Send the browser to `url`; `transaction` is sealed state the caller keeps in a short-lived, encrypted and signed, HttpOnly cookie. */
  { kind: "redirect"; url: string; transaction: string } | { kind: "direct" };

/** Why an interactive sign-in was refused. Stable codes the sign-in page turns into messages. */
export type SignInErrorCode =
  | "invalid_request"
  | "expired"
  | "idp_error"
  | "idp_unavailable"
  | "token_invalid"
  | "mfa_required"
  | "no_role"
  | "no_tenant"
  | "inactive"
  | "unknown_user";

export type SignInResult =
  | { ok: true; subject: string; /** Raw ID token, kept only as the logout hint. */ idToken?: string; claims?: Record<string, unknown> }
  | { ok: false; code: SignInErrorCode; reason: string };

export interface IdentityProvider {
  /** Stable id stored in the session token, e.g. "demo" or "oidc". */
  readonly id: string;
  readonly displayName: string;
  /** True for providers that must never be enabled in production. */
  readonly demo: boolean;
  beginSignIn(input: { returnTo?: string; baseUrl: string }): Promise<SignInStart>;
  completeSignIn(input: Record<string, string | undefined>): Promise<SignInResult>;
  /** Resolve a subject to an active workforce user, or undefined if unknown / disabled. */
  resolveUser(subject: string): User | undefined;
}

/**
 * OpenID Connect provider configuration, read from the environment by
 * `oidcConfigFromEnv` (lib/auth/oidc.ts). Works with Microsoft Entra ID, Okta,
 * Auth0 or any issuer that publishes `/.well-known/openid-configuration`.
 */
export interface OidcProviderConfig {
  issuer: string;
  clientId: string;
  /** From the platform secret store; omitted for a public client (PKCE only). */
  clientSecret?: string;
  /** Callback URL registered with the IdP. Undefined: derived from the request origin. */
  redirectUri?: string;
  /** Where the IdP returns the browser after RP-initiated logout. */
  postLogoutRedirectUri?: string;
  scopes: string[];
  /** Button label, e.g. "Microsoft" in "Sign in with Microsoft". */
  providerName: string;
  /** Claim carrying role values (Entra app roles: `roles`; Okta: `groups`). */
  roleClaim: string;
  /** Claim carrying the organisation, e.g. Entra `tid`. Unset: tenant comes from the matched catalog user. */
  tenantClaim?: string;
  /** Claim value → app role. Empty: claim values must equal app role names. */
  roleMap: Record<string, UserRole>;
  /** Claim value → tenant id. Empty: claim values must equal catalog tenant ids. */
  tenantMap: Record<string, string>;
  /** Require one of `mfaAmrValues` in the ID token `amr` claim. */
  requireMfa: boolean;
  mfaAmrValues: string[];
}

/** Demo users who can sign in: active workforce users in the catalog. */
export function demoUsers(): User[] {
  return users.filter((u) => u.status === "active");
}

export class DemoIdentityProvider implements IdentityProvider {
  readonly id = "demo";
  readonly displayName = "Demo sign-in (no password)";
  readonly demo = true;

  async beginSignIn(): Promise<SignInStart> {
    return { kind: "direct" };
  }

  async completeSignIn(input: Record<string, string | undefined>): Promise<SignInResult> {
    const user = input.userId ? this.resolveUser(input.userId) : undefined;
    return user ? { ok: true, subject: user.id } : { ok: false, code: "unknown_user", reason: "Unknown or inactive user" };
  }

  resolveUser(subject: string): User | undefined {
    return users.find((u) => u.id === subject && u.status === "active");
  }
}

/** The parts of a user that are safe to send to the browser. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: User["role"];
  tenantId: string;
  status: User["status"];
}

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, tenantId: u.tenantId, status: u.status };
}
