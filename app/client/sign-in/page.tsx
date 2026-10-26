import { connection } from "next/server";
import { ClientSignInPage } from "@/components/client/client-sign-in";
import { DEFAULT_TRIAL_EMAIL, DEFAULT_TRIAL_PASSWORD, trialConfig } from "@/lib/auth/trial";
import { STATIC_EXPORT } from "@/lib/server/platform-data";
import { identityProviders } from "@/lib/server/identity-provider";
import { staffPasswordRequired } from "@/lib/server/staff-password";

export const metadata = { title: "Log in" };

export default async function ClientSignIn() {
  // Server edition: read the environment per request, so TRIAL_* changes apply without a rebuild.
  // The online demo is built once, with the default login filled in.
  if (!STATIC_EXPORT) await connection();
  const cfg = STATIC_EXPORT ? { email: DEFAULT_TRIAL_EMAIL, password: DEFAULT_TRIAL_PASSWORD, prefill: true } : trialConfig();
  // Which sign-in methods exist is known here, so the form is on screen straight away.
  const methods = STATIC_EXPORT
    ? { sso: null, demo: true, staffPassword: false }
    : (() => {
        const { oidc, demo } = identityProviders();
        return { sso: oidc ? { name: oidc.displayName, mfa: oidc.config.requireMfa } : null, demo: Boolean(demo), staffPassword: Boolean(demo) && staffPasswordRequired() };
      })();
  return <ClientSignInPage prefill={cfg.prefill ? { email: cfg.email, password: cfg.password } : undefined} methods={methods} />;
}
