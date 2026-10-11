import type { User } from "@/lib/domain/types";
import { users } from "@/lib/config/catalog";

/**
 * Identity provider abstraction (docs/06 §2: SSO, MFA).
 *
 * The application only ever asks two things of an identity provider:
 * 1. start / complete an interactive sign-in and tell us which subject signed in;
 * 2. resolve a subject to an active workforce user (role + tenant) on each request.
 *
 * The demo provider below signs in a catalog user with no password. A workforce
 * SSO provider (Microsoft Entra ID, Okta, Auth0 — all OIDC) implements the same
 * interface: `beginSignIn` returns the authorisation URL, `completeSignIn`
 * exchanges the code and validates the ID token, and `resolveUser` maps the
 * token's subject / group claims to a user, role and tenant. MFA is enforced by
 * the customer's IdP and asserted through the `amr` claim.
 */

export type SignInStart = { kind: "redirect"; url: string } | { kind: "direct" };

export type SignInResult = { ok: true; subject: string } | { ok: false; reason: string };

export interface IdentityProvider {
  /** Stable id stored in the session token, e.g. "demo", "entra", "okta". */
  readonly id: string;
  readonly displayName: string;
  /** True for providers that must never be enabled in production. */
  readonly demo: boolean;
  beginSignIn(input: { returnTo: string }): SignInStart;
  completeSignIn(input: Record<string, string | undefined>): Promise<SignInResult>;
  /** Resolve a subject to an active workforce user, or undefined if unknown / disabled. */
  resolveUser(subject: string): User | undefined;
}

/** Configuration an OIDC provider would need; not wired up in the POC. */
export interface OidcProviderConfig {
  id: "entra" | "okta" | "auth0" | "oidc";
  issuer: string;
  clientId: string;
  /** Read from the secrets store, never from source. */
  clientSecretRef: string;
  redirectUri: string;
  /** Claim that carries the role, and how claim values map to roles and tenants. */
  roleClaim: string;
}

/** Demo users who can sign in: active workforce users in the catalog. */
export function demoUsers(): User[] {
  return users.filter((u) => u.status === "active");
}

export class DemoIdentityProvider implements IdentityProvider {
  readonly id = "demo";
  readonly displayName = "Demo sign-in (no password)";
  readonly demo = true;

  beginSignIn(): SignInStart {
    return { kind: "direct" };
  }

  async completeSignIn(input: Record<string, string | undefined>): Promise<SignInResult> {
    const user = input.userId ? this.resolveUser(input.userId) : undefined;
    return user ? { ok: true, subject: user.id } : { ok: false, reason: "Unknown or inactive user" };
  }

  resolveUser(subject: string): User | undefined {
    return users.find((u) => u.id === subject && u.status === "active");
  }
}

let provider: IdentityProvider | undefined;

/** The configured identity provider. Only the demo provider exists in the POC. */
export function getIdentityProvider(): IdentityProvider {
  provider ??= new DemoIdentityProvider();
  return provider;
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
