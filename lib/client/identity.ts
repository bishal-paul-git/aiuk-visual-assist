"use client";

import { useSyncExternalStore } from "react";
import { users } from "@/lib/config/catalog";
import { demoUsers, toPublicUser, type PublicUser } from "@/lib/auth/identity";
import { BASE_PATH, STATIC_DEMO } from "@/lib/paths";

/**
 * Who is using this browser.
 *
 * - Server edition: the signed-in user from the HttpOnly session cookie
 *   (`/api/auth/me`). The browser never sees or forges the token.
 * - Static demo: a demo identity kept in localStorage, switchable by role.
 *   The in-browser runtime applies the same RBAC rules to it.
 *
 * The UI uses this to label the user and hide controls; the server (or the
 * browser runtime in the demo) is what enforces permissions.
 */

export type IdentityState = { status: "loading" } | { status: "signed_out" } | { status: "signed_in"; user: PublicUser; demo: boolean };

const DEMO_KEY = "va.demo.identity";
/** Earlier versions stored the console agent here. */
const LEGACY_KEY = "va.console.agent";
export const DEFAULT_DEMO_USER_ID = "usr_sarah";
/** Until a tester picks someone, the platform is shown as its administrator. */
const DEFAULT_PLATFORM_USER_ID = "usr_james";

const listeners = new Set<() => void>();
let state: IdentityState = { status: "loading" };
let started = false;

function emit(next: IdentityState) {
  state = next;
  listeners.forEach((l) => l());
}

/** True once the tester has picked a demo identity (or one is stored). */
let chosen = false;

/** The identity for someone who hasn't picked one: an agent in the console, the administrator in the platform. */
function defaultDemoId(): string {
  return typeof window !== "undefined" && window.location.pathname.includes("/platform") ? DEFAULT_PLATFORM_USER_ID : DEFAULT_DEMO_USER_ID;
}

function readDemoId(): string {
  try {
    const stored = window.localStorage.getItem(DEMO_KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (stored) {
      chosen = true;
      return stored;
    }
  } catch {
    /* storage unavailable */
  }
  return defaultDemoId();
}

function demoState(id: string): IdentityState {
  const u = demoUsers().find((x) => x.id === id) ?? users.find((x) => x.id === DEFAULT_DEMO_USER_ID)!;
  return { status: "signed_in", user: toPublicUser(u), demo: true };
}

async function loadServer() {
  try {
    const r = await fetch(`${BASE_PATH}/api/auth/me`, { cache: "no-store" });
    const d = (await r.json()) as { user: PublicUser | null; provider?: { demo: boolean } };
    emit(d.user ? { status: "signed_in", user: d.user, demo: Boolean(d.provider?.demo) } : { status: "signed_out" });
  } catch {
    emit({ status: "signed_out" });
  }
}

function start() {
  if (started) return;
  started = true;
  if (STATIC_DEMO) emit(demoState(readDemoId()));
  else void loadServer();
}

export function useIdentity(): IdentityState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      start();
      return () => listeners.delete(cb);
    },
    snapshot,
    () => SERVER_SNAPSHOT,
  );
}
const SERVER_SNAPSHOT: IdentityState = { status: "loading" };

function snapshot(): IdentityState {
  // Static demo, no identity picked yet: follow the area being viewed.
  if (STATIC_DEMO && !chosen && state.status === "signed_in") {
    const want = defaultDemoId();
    if (state.user.id !== want) state = demoState(want);
  }
  return state;
}

/** The current user id, or "" while unknown / signed out. */
export function currentUserId(): string {
  const s = snapshot();
  return s.status === "signed_in" ? s.user.id : "";
}

/** Static demo only: switch to another demo identity. */
export function setDemoIdentity(id: string) {
  chosen = true;
  try {
    window.localStorage.setItem(DEMO_KEY, id);
  } catch {
    /* storage unavailable — the choice lasts for this page only */
  }
  emit(demoState(id));
}

/** Server edition: sign in as a demo user. Returns where to go next. */
export async function signInDemo(userId: string, next?: string, password?: string): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  if (STATIC_DEMO) {
    setDemoIdentity(userId);
    return { ok: true, next: next ?? "/" };
  }
  try {
    const r = await fetch(`${BASE_PATH}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, next, password }),
    });
    const d = (await r.json().catch(() => ({}))) as { user?: PublicUser; next?: string; error?: string };
    if (!r.ok || !d.user) return { ok: false, error: d.error ?? "Sign-in failed" };
    emit({ status: "signed_in", user: d.user, demo: true });
    return { ok: true, next: d.next ?? "/" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Server edition: end the local session. For single sign-on sessions the
 * result carries the identity provider's logout URL, to end the IdP session too.
 */
export async function signOut(): Promise<{ logoutUrl?: string }> {
  if (STATIC_DEMO) return {};
  const d = await fetch(`${BASE_PATH}/api/auth/sign-out`, { method: "POST" })
    .then((r) => r.json() as Promise<{ logoutUrl?: string }>)
    .catch(() => ({}) as { logoutUrl?: string });
  emit({ status: "signed_out" });
  return { logoutUrl: typeof d.logoutUrl === "string" && /^https?:\/\//.test(d.logoutUrl) ? d.logoutUrl : undefined };
}

/** Sign-in methods enabled on this deployment (server edition). */
export interface SignInMethods {
  sso: { name: string; mfa: boolean } | null;
  demo: boolean;
  /** Picking a demo account needs the staff password (STAFF_SIGNIN_PASSWORD). */
  staffPassword?: boolean;
}

/** Server edition: which sign-in methods to offer. The static demo only has demo identities. */
export async function loadSignInMethods(): Promise<SignInMethods> {
  if (STATIC_DEMO) return { sso: null, demo: true };
  try {
    const r = await fetch(`${BASE_PATH}/api/auth/me`, { cache: "no-store" });
    if (!r.ok) return { sso: null, demo: false };
    const d = (await r.json()) as { signIn?: SignInMethods };
    return d.signIn ?? { sso: null, demo: true };
  } catch {
    return { sso: null, demo: false };
  }
}

/** Server edition: URL that starts single sign-on, returning to `next` afterwards. */
export function ssoSignInUrl(next?: string): string {
  return `${BASE_PATH}/api/auth/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`;
}
