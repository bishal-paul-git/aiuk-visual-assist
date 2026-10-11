import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import { seedSessions } from "@/lib/runtime/seed";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { attachStore, createStoreFromEnv, FileSessionStore, MemorySessionStore } from "@/lib/server/store";
import { setLogSink } from "@/lib/server/log";

const customer = { type: "customer" as const, id: "c", name: "Test" };
const flush = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function runtime() {
  return new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
}

let dir: string;
let restoreLog: () => void;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-store-"));
  restoreLog = setLogSink(() => {});
});

afterEach(() => {
  restoreLog();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("file session store", () => {
  it("round-trips snapshots with atomic writes and no leftover temp files", async () => {
    const rt = runtime();
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    const store = new FileSessionStore(dir);
    await store.saveSession(rt.snapshot(id)!);
    await store.idle();
    const files = fs.readdirSync(path.join(dir, "sessions"));
    expect(files).toEqual([`${id}.json`]);

    const loaded = new FileSessionStore(dir).load();
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0].state.session.id).toBe(id);
    expect(loaded.sessions[0].token).toBe(rt.tokenFor(id));
  });

  it("never lets an older snapshot overwrite a newer one", async () => {
    const rt = runtime();
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    const old = structuredClone(rt.snapshot(id)!);
    rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
    const store = new FileSessionStore(dir);
    await store.saveSession(rt.snapshot(id)!);
    await store.saveSession(old);
    const [snap] = new FileSessionStore(dir).load().sessions;
    expect(snap.state.seq).toBe(rt.snapshot(id)!.state.seq);
  });

  it("removes stale temp files and skips corrupt snapshots on load", () => {
    const store = new FileSessionStore(dir);
    fs.writeFileSync(path.join(dir, "sessions", "ses_x.json.123.abcd.tmp"), "{partial");
    fs.writeFileSync(path.join(dir, "sessions", "ses_bad.json"), "not json");
    const r = store.load();
    expect(r.sessions).toHaveLength(0);
    expect(fs.readdirSync(path.join(dir, "sessions"))).toEqual(["ses_bad.json"]);
    expect(store.status().lastError).toMatch(/ses_bad\.json/);
  });

  it("stores frames on disk, reads them lazily and deletes them with the session", async () => {
    const store = new FileSessionStore(dir);
    await store.saveFrame({ id: "mem_abc", sessionId: "ses_1", mime: "image/jpeg", data: new Uint8Array([1, 2, 3]), createdAt: 42 });
    const f = store.readFrameSync("ses_1", "mem_abc")!;
    expect([...f.data]).toEqual([1, 2, 3]);
    expect(f).toMatchObject({ sessionId: "ses_1", mime: "image/jpeg", createdAt: 42 });
    expect(store.readFrameSync("ses_2", "mem_abc")).toBeUndefined();
    expect(store.readFrameSync("../etc", "passwd")).toBeUndefined();
    await store.deleteSession("ses_1");
    expect(store.readFrameSync("ses_1", "mem_abc")).toBeUndefined();
  });

  it("rejects ids that could escape the data directory", async () => {
    const store = new FileSessionStore(dir);
    await expect(store.saveFrame({ id: "../x", sessionId: "ses_1", mime: "image/jpeg", data: new Uint8Array([1]), createdAt: 1 })).rejects.toThrow(/Unsafe id/);
  });

  it("is selected by DATA_DIR, otherwise memory", () => {
    expect(createStoreFromEnv({ DATA_DIR: dir })).toBeInstanceOf(FileSessionStore);
    expect(createStoreFromEnv({})).toBeInstanceOf(MemorySessionStore);
  });
});

describe("runtime persistence", () => {
  it("seeds only when the store is empty, persists the seed and restores it after a restart", async () => {
    const rt1 = runtime();
    const p1 = attachStore(rt1, new FileSessionStore(dir), { seed: (rt) => seedSessions(rt, Date.parse("2026-10-11T12:00:00Z")), debounceMs: 1 });
    expect(p1.seeded).toBe(true);
    await p1.flush();
    const count = rt1.allSessionIds().length;
    expect(count).toBeGreaterThan(50);
    expect(fs.readdirSync(path.join(dir, "sessions"))).toHaveLength(count);

    let seededAgain = false;
    const rt2 = runtime();
    const p2 = attachStore(rt2, new FileSessionStore(dir), { seed: () => (seededAgain = true) });
    expect(seededAgain).toBe(false);
    expect(p2.restored).toBe(count);
    expect(rt2.summaries().filter((s) => s.live)).toHaveLength(4);
    expect(rt2.idForToken("demo-escalated")).toBe("ses_a12467");
  });

  it("writes through on commit (debounced) and keeps frames and references across restarts", async () => {
    const rt1 = runtime();
    const p1 = attachStore(rt1, new FileSessionStore(dir), { debounceMs: 20 });
    const { id, token } = rt1.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Acct", scenario: "power_cycle_fix" });
    rt1.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
    rt1.dispatch(id, { type: "customer.utterance", text: "my broadband is down" }, customer);
    // Inside the debounce window nothing has been written yet.
    expect(fs.existsSync(path.join(dir, "sessions", `${id}.json`))).toBe(false);
    await flush(10);
    const frameId = rt1.storeFrame(id, "image/jpeg", new Uint8Array([9, 9, 9]));
    rt1.dispatch(id, { type: "frame.captured", trigger: "workflow_checkpoint", frameReference: `mem:${frameId}`, width: 1, height: 1, bytes: 3 }, customer);
    await flush(10);
    await p1.flush();
    const seq = rt1.snapshot(id)!.state.seq;

    const rt2 = runtime();
    const p2 = attachStore(rt2, new FileSessionStore(dir));
    expect(rt2.idForToken(token)).toBe(id);
    expect(rt2.snapshot(id)!.state.seq).toBe(seq);
    expect([...rt2.getFrame(id, `mem:${frameId}`)!.data]).toEqual([9, 9, 9]);
    expect(rt2.getFrame("ses_other", `mem:${frameId}`)).toBeUndefined();
    // New sessions continue the reference sequence rather than reusing numbers.
    const before = rt2.snapshot(id)!.state.session.reference;
    const next = rt2.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "B", scenario: "power_cycle_fix" });
    expect(Number(rt2.snapshot(next.id)!.state.session.reference.slice(3))).toBeGreaterThan(Number(before.slice(3)));
    // Let rt1's async effects settle before the temp dir is removed.
    await flush(40);
    await p1.flush();
    await p2.flush();
  });

  it("flushes pending writes synchronously (process exit path)", () => {
    const rt = runtime();
    const p = attachStore(rt, new FileSessionStore(dir), { debounceMs: 60_000 });
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    p.flushSync();
    expect(fs.existsSync(path.join(dir, "sessions", `${id}.json`))).toBe(true);
  });

  it("does not write anything for the in-memory store", async () => {
    const rt = runtime();
    const store = new MemorySessionStore();
    const p = attachStore(rt, store, { seed: (r) => seedSessions(r, Date.parse("2026-10-11T12:00:00Z")), debounceMs: 1 });
    rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    await p.flush();
    expect(p.seeded).toBe(true);
    expect(store.status()).toMatchObject({ kind: "memory", durable: false, sessions: 0 });
  });

  it("awaits asynchronous stores before reporting ready", async () => {
    const rt = runtime();
    const inner = new MemorySessionStore();
    const asyncStore = Object.assign(Object.create(inner) as MemorySessionStore, { load: async () => ({ sessions: [] }) });
    const p = attachStore(rt, asyncStore, { seed: (r) => seedSessions(r, Date.parse("2026-10-11T12:00:00Z")) });
    expect(p.isReady()).toBe(false);
    await p.ready;
    expect(p.isReady()).toBe(true);
    expect(p.seeded).toBe(true);
  });
});
