"use client";

import { SessionRuntime, type SessionSnapshot } from "@/lib/runtime/session-runtime";
import { seedSessions } from "@/lib/runtime/seed";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { RoutingReasoningProvider } from "@/lib/providers/routing";
import { users } from "@/lib/config/catalog";
import { getScenario } from "@/lib/providers/mock/scenarios";
import type { Actor, Command } from "@/lib/session/orchestrator";
import type { FrameTrigger, SessionChannel } from "@/lib/domain/types";
import { consolePath, customerPath, syntheticFrameUrl, type Result, type Transport } from "./transport";
import { demoCustomerLabel } from "@/lib/domain/labels";
import { can, commandPermission, denialMessage } from "@/lib/auth/rbac";
import { actorTypeFor } from "@/lib/auth/security-log";

/**
 * Browser-hosted runtime for the static demo (GitHub Pages). Every tab runs
 * the same orchestrator; the tab that handles a command executes its effects
 * and publishes the resulting snapshot. Other tabs on the device apply newer
 * snapshots, so a phone view and the agent console in two tabs (or two iframes)
 * stay in step.
 */

const NS = "va.demo.v1";
const K = {
  epoch: `${NS}.seedEpoch`,
  index: `${NS}.sessions`,
  session: (id: string) => `${NS}.session.${id}`,
  frame: (id: string) => `${NS}.frame.${id}`,
  frames: `${NS}.frames`,
};
const MAX_FRAMES = 40;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    storage()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Wipe everything the demo stored on this device. */
export function resetDemo() {
  const s = storage();
  if (!s) return;
  for (const key of Object.keys(s)) if (key.startsWith(NS)) s.removeItem(key);
}

function decodeDataUrl(dataUrl: string): { mime: string; data: Uint8Array } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return { mime: m[1], data };
}

export function createBrowserTransport(): Transport {
  const rt = new SessionRuntime(new RoutingReasoningProvider(new MockReasoningProvider()), new MockToolExecutor());

  // One seed epoch per device so every tab generates identical seed history.
  let epoch = readJson<number>(K.epoch);
  if (!epoch) {
    epoch = Date.now();
    writeJson(K.epoch, epoch);
  }
  seedSessions(rt, epoch);

  // Apply sessions created or changed in earlier visits / other tabs.
  for (const id of readJson<string[]>(K.index) ?? []) {
    const snap = readJson<SessionSnapshot>(K.session(id));
    if (snap) rt.importSnapshot(snap);
  }

  const frameUrls = new Map<string, string>();
  const previews = new Map<string, { url: string; at: number }>();
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(NS) : null;

  let applying = false;
  rt.onCommit = (id) => {
    if (applying) return;
    const snap = rt.snapshot(id);
    if (!snap) return;
    const index = new Set(readJson<string[]>(K.index) ?? []);
    index.add(id);
    writeJson(K.index, [...index]);
    writeJson(K.session(id), snap);
    channel?.postMessage({ type: "session", id });
  };

  const applyRemote = (id: string) => {
    const snap = readJson<SessionSnapshot>(K.session(id));
    if (!snap) return;
    applying = true;
    try {
      rt.importSnapshot(snap);
    } finally {
      applying = false;
    }
  };

  channel?.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data as { type: string; id: string; url?: string; at?: number };
    if (msg.type === "session") applyRemote(msg.id);
    if (msg.type === "preview" && msg.url) previews.set(msg.id, { url: msg.url, at: msg.at ?? Date.now() });
  });
  window.addEventListener("storage", (e) => {
    const prefix = `${NS}.session.`;
    if (e.key?.startsWith(prefix)) applyRemote(e.key.slice(prefix.length));
  });

  // Max-duration checks only from a visible tab to avoid duplicate escalations.
  setInterval(() => {
    if (document.visibilityState === "visible") rt.tick();
  }, 10_000);

  const customerActor = (id: string): Actor => ({ type: "customer", id: `customer:${id}`, name: rt.get(id)?.state.session.customerLabel ?? "Customer" });
  /** The demo identity acting in the console, checked with the same RBAC rules as the server. */
  const agentActor = (agentId: string, sessionId: string, commandType: string): Actor | string => {
    const u = users.find((x) => x.id === agentId);
    const tenantId = rt.get(sessionId)?.state.session.tenantId;
    const permission = commandPermission(commandType);
    if (!u || !tenantId || !permission) return "Not permitted";
    if (!can(u, permission, { tenantId })) return denialMessage(u, permission, { tenantId });
    return { type: actorTypeFor(u), id: u.id, name: u.name };
  };
  const result = (error?: string): Result => (error ? { ok: false, error } : { ok: true });
  const byToken = (token: string) => rt.idForToken(token);

  function rememberFrame(frameId: string, dataUrl: string) {
    frameUrls.set(frameId, dataUrl);
    const list = (readJson<string[]>(K.frames) ?? []).filter((x) => x !== frameId);
    list.push(frameId);
    while (list.length > MAX_FRAMES) storage()?.removeItem(K.frame(list.shift()!));
    writeJson(K.frames, list);
    if (!writeJson(K.frame(frameId), dataUrl)) {
      // Storage full: drop the oldest half of stored frames and retry once.
      for (const old of list.splice(0, Math.ceil(list.length / 2))) storage()?.removeItem(K.frame(old));
      writeJson(K.frames, list);
      writeJson(K.frame(frameId), dataUrl);
    }
  }

  return {
    mode: "browser",
    async customerSnapshot(token) {
      const id = byToken(token);
      return id ? rt.customerView(id) : undefined;
    },
    async agentSnapshot(id) {
      return rt.agentView(id);
    },
    subscribeCustomer(token, onData, onStatus) {
      const id = byToken(token);
      if (!id) {
        onStatus("closed");
        return () => {};
      }
      onStatus("open");
      const push = () => {
        const v = rt.customerView(id);
        if (v) onData(v);
      };
      push();
      return rt.subscribe(id, push);
    },
    subscribeAgent(id, onData, onStatus) {
      onStatus("open");
      const push = () => {
        const v = rt.agentView(id);
        if (v) onData(v);
      };
      push();
      return rt.subscribe(id, push);
    },
    subscribeLive(onData, onStatus) {
      onStatus("open");
      const push = () => onData(rt.summaries().filter((s) => s.live));
      push();
      return rt.subscribeAll(push);
    },
    async customerCommand(token, command) {
      const id = byToken(token);
      if (!id) return result("This link is invalid or has expired");
      return result(rt.dispatch(id, command as Command, customerActor(id)).error);
    },
    async uploadFrame(token, frame) {
      const id = byToken(token);
      if (!id) return result("This link is invalid or has expired");
      const image = decodeDataUrl(frame.dataUrl);
      if (!image) return result("Invalid frame");
      const frameId = rt.storeFrame(id, image.mime, image.data);
      rememberFrame(frameId, frame.dataUrl);
      const err = rt.dispatch(
        id,
        {
          type: "frame.captured",
          trigger: frame.trigger as FrameTrigger,
          frameReference: `mem:${frameId}`,
          width: frame.width,
          height: frame.height,
          bytes: frame.bytes,
          evidenceRequestId: frame.evidenceRequestId,
        },
        customerActor(id),
      ).error;
      return result(err);
    },
    async uploadPreview(token, dataUrl) {
      const id = byToken(token);
      if (!id) return;
      const at = Date.now();
      previews.set(id, { url: dataUrl, at });
      channel?.postMessage({ type: "preview", id, url: dataUrl, at });
    },
    async agentCommand(id, agentId, command) {
      const actor = agentActor(agentId, id, String(command.type));
      if (typeof actor === "string") return result(actor);
      return result(rt.dispatch(id, command as Command, actor).error);
    },
    async latestPreview(id) {
      const p = previews.get(id);
      return p && Date.now() - p.at < 10_000 ? { url: p.url, revoke: false } : null;
    },
    frameUrl(sessionId, frame) {
      const synthetic = syntheticFrameUrl(frame.frameReference);
      if (synthetic) return synthetic;
      const frameId = frame.frameReference.replace(/^mem:/, "");
      const cached = frameUrls.get(frameId) ?? readJson<string>(K.frame(frameId));
      if (cached) {
        frameUrls.set(frameId, cached);
        return cached;
      }
      return syntheticFrameUrl("synthetic:front:off-off-off:connected")!;
    },
    async createSession(input) {
      try {
        const scenario = input.scenario === "live" ? undefined : getScenario(input.scenario).key;
        const { id, token } = rt.create({
          workflowKey: input.workflowKey,
          tenantId: input.tenantId,
          channel: input.channel as SessionChannel,
          customerLabel: demoCustomerLabel(),
          scenario,
        });
        return { ok: true, id, customerPath: customerPath(token), consolePath: consolePath(id) };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async capabilities() {
      return { liveReasoning: false, model: null, speechToText: false, mode: "browser" };
    },
    async transcribe() {
      return { ok: false, status: 404, error: "Speech-to-text needs the server edition" };
    },
  };
}
