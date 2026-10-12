import { DemoIdentityProvider, type IdentityProvider } from "@/lib/auth/identity";
import { OidcIdentityProvider, oidcConfigFromEnv } from "@/lib/auth/oidc";
import { authSecret } from "@/lib/server/auth-secret";

/**
 * Which identity providers are enabled (server edition).
 *
 * - OIDC_ISSUER unset: the demo provider only (no passwords; not for real use).
 * - OIDC_ISSUER set: workforce sign-in through OpenID Connect. The demo
 *   provider is disabled unless ALLOW_DEMO_SIGNIN=1.
 *
 * Read once per process. An incomplete OIDC configuration throws, so a
 * misconfigured deployment fails closed instead of falling back to demo sign-in.
 */

export interface IdentityProviders {
  oidc?: OidcIdentityProvider;
  demo?: DemoIdentityProvider;
  /** Every enabled provider; sessions are accepted only from these. */
  all: IdentityProvider[];
}

const g = globalThis as unknown as { __aiukIdentityProviders?: IdentityProviders };

export function buildIdentityProviders(env: Record<string, string | undefined> = process.env): IdentityProviders {
  const config = oidcConfigFromEnv(env);
  const oidc = config ? new OidcIdentityProvider(config, { secret: authSecret }) : undefined;
  const demo = !oidc || env.ALLOW_DEMO_SIGNIN === "1" ? new DemoIdentityProvider() : undefined;
  return { oidc, demo, all: [oidc, demo].filter((p): p is NonNullable<typeof p> => Boolean(p)) };
}

export function identityProviders(): IdentityProviders {
  return (g.__aiukIdentityProviders ??= buildIdentityProviders());
}

/** The enabled provider with this id (as stored in a session token), if any. */
export function getIdentityProvider(id: string): IdentityProvider | undefined {
  return identityProviders().all.find((p) => p.id === id);
}

/** Tests only: re-read the environment on next use. */
export function resetIdentityProviders(): void {
  g.__aiukIdentityProviders = undefined;
}
