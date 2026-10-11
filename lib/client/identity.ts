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

export type IdentityState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; user: PublicUser; demo: boolean };

const DEMO_KEY = "va.demo.identity";
/** Earlier versions stored the console agent here. */
const LEGACY_KEY = "va.console.agent";
export const DEFAULT_DEMO_USER_ID = "usr_sarah";

const listeners = new Set<() => void>();
let state: IdentityState = { status: "loading" };
let started = false;

function emit(next: IdentityState) {
  state = next;
  listeners.forEach((l) => l());
}

function readDemoId(): string {
  try {
    return window.localStorage.getItem(DEMO_KEY) ?? window.localStorage.getItem(LEGACY_KEY) ?? DEFAULT_DEMO_USER_ID;
  } catch {
    return DEFAULT_DEMO_USER_ID;
  }
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
    () => state,
    () => SERVER_SNAPSHOT,
  );
}
const SERVER_SNAPSHOT: IdentityState = { status: "loading" };

/** The current user id, or "" while unknown / signed out. */
export function currentUserId(): string {
  return state.status === "signed_in" ? state.user.id : "";
}

/** Static demo only: switch to another demo identity. */
export function setDemoIdentity(id: string) {
  try {
    window.localStorage.setItem(DEMO_KEY, id);
  } catch {
    /* storage unavailable — the choice lasts for this page only */
  }
  emit(demoState(id));
}

/** Server edition: sign in as a demo user. Returns where to go next. */
export async function signInDemo(userId: string, next?: string): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  if (STATIC_DEMO) {
    setDemoIdentity(userId);
    return { ok: true, next: next ?? "/" };
  }
  try {
    const r = await fetch(`${BASE_PATH}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, next }),
    });
    const d = (await r.json().catch(() => ({}))) as { user?: PublicUser; next?: string; error?: string };
    if (!r.ok || !d.user) return { ok: false, error: d.error ?? "Sign-in failed" };
    emit({ status: "signed_in", user: d.user, demo: true });
    return { ok: true, next: d.next ?? "/" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function signOut(): Promise<void> {
  if (STATIC_DEMO) return;
  await fetch(`${BASE_PATH}/api/auth/sign-out`, { method: "POST" }).catch(() => undefined);
  emit({ status: "signed_out" });
}
