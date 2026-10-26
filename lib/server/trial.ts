import { createHash, timingSafeEqual } from "node:crypto";
import { trialConfig, TRIAL_USER_ID } from "@/lib/auth/trial";

/** Server side of the trial login (lib/auth/trial.ts). */

const sha = (v: string) => createHash("sha256").update(v).digest();

/** Constant-time check of the trial email and password. */
export function checkTrialCredentials(email: string, password: string, env: Record<string, string | undefined> = process.env): boolean {
  const cfg = trialConfig(env);
  const okEmail = timingSafeEqual(sha(email.trim().toLowerCase()), sha(cfg.email));
  const okPassword = timingSafeEqual(sha(password), sha(cfg.password));
  return okEmail && okPassword;
}

/** Counts events per key inside a sliding window. */
export class SlidingWindow {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private prune(key: string, now: number): number[] {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length) this.hits.set(key, recent);
    else this.hits.delete(key);
    return recent;
  }

  /** Events recorded for `key` inside the window. */
  count(key: string, now = Date.now()): number {
    return this.prune(key, now).length;
  }

  /** True when `key` has already used up its allowance. */
  blocked(key: string, now = Date.now()): boolean {
    return this.count(key, now) >= this.limit;
  }

  record(key: string, now = Date.now()) {
    this.hits.set(key, [...this.prune(key, now), now]);
  }

  reset(key?: string) {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }
}

const g = globalThis as unknown as { __aiukTrialFailures?: SlidingWindow; __aiukTrialSessions?: SlidingWindow };

/** Wrong-password attempts: 8 per 10 minutes per client address. */
export const trialFailures = (g.__aiukTrialFailures ??= new SlidingWindow(8, 10 * 60 * 1000));

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sessions started by the trial account in the last 24 hours, on this server.
 * Returns false (and records nothing) once the daily allowance is used up.
 */
export function takeTrialSession(userId: string, env: Record<string, string | undefined> = process.env, now = Date.now()): boolean {
  if (userId !== TRIAL_USER_ID) return true;
  const { maxSessionsPerDay } = trialConfig(env);
  const window = (g.__aiukTrialSessions ??= new SlidingWindow(Infinity, DAY_MS));
  if (window.count(userId, now) >= maxSessionsPerDay) return false;
  window.record(userId, now);
  return true;
}

/** Tests only. */
export function resetTrialLimits() {
  trialFailures.reset();
  g.__aiukTrialSessions = undefined;
}
