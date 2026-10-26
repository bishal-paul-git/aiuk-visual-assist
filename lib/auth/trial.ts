/**
 * The trial login for client testers (isomorphic; the check itself is in
 * lib/server/trial.ts).
 *
 * A tester opens the client portal, sees an email and password already filled
 * in and clicks Log in. It is a convenience for a trial, not a security
 * boundary: the password is shown to the tester. It signs in as a supervisor of
 * one client, so a single login can play both the customer and the agent, and
 * it cannot change settings. Production uses single sign-on instead.
 */

export const TRIAL_USER_ID = "usr_demo";
export const DEFAULT_TRIAL_EMAIL = "demo@northline.example";
export const DEFAULT_TRIAL_PASSWORD = "VisualAssist-Trial";
/** Sessions the trial account may start per day, on the whole server. Guards AI and SMS spend. */
export const DEFAULT_TRIAL_MAX_SESSIONS_PER_DAY = 40;

type Env = Record<string, string | undefined>;

export interface TrialConfig {
  email: string;
  password: string;
  /** Fill the login form in for the tester. Set TRIAL_PREFILL=0 to make them type it. */
  prefill: boolean;
  maxSessionsPerDay: number;
}

export function trialConfig(env: Env = process.env): TrialConfig {
  const max = Number(env.TRIAL_MAX_SESSIONS_PER_DAY);
  return {
    email: (env.TRIAL_LOGIN_EMAIL?.trim() || DEFAULT_TRIAL_EMAIL).toLowerCase(),
    password: env.TRIAL_LOGIN_PASSWORD || DEFAULT_TRIAL_PASSWORD,
    prefill: env.TRIAL_PREFILL !== "0",
    maxSessionsPerDay: Number.isFinite(max) && max >= 0 ? Math.round(max) : DEFAULT_TRIAL_MAX_SESSIONS_PER_DAY,
  };
}
