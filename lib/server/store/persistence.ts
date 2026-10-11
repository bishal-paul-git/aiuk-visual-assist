import type { SessionRuntime } from "@/lib/runtime/session-runtime";
import { log } from "@/lib/server/log";
import type { SessionStore, StoreLoadResult } from "./types";

export interface Persistence {
  store: SessionStore;
  /** Resolves once stored sessions are loaded into the runtime (immediately for local stores). */
  ready: Promise<void>;
  isReady(): boolean;
  /** Sessions restored from the store at boot. */
  restored: number;
  /** True when the store was empty and demo history was generated. */
  seeded: boolean;
  /** Write every pending session now. */
  flush(): Promise<void>;
  /** Best-effort synchronous flush for process exit. */
  flushSync(): void;
}

export interface AttachOptions {
  /** Upper bound on how long a committed change waits before it is written. */
  debounceMs?: number;
  /** Generates history when the store holds no sessions. */
  seed?: (rt: SessionRuntime) => void;
}

/**
 * Connects a runtime to a store: restores persisted sessions, seeds only when
 * the store is empty, then writes through on every commit. Writes for one
 * session are coalesced: the first commit opens a window of `debounceMs`, and
 * the latest snapshot at the end of the window is written (so a session that
 * changes constantly is still saved at least that often).
 */
export function attachStore(rt: SessionRuntime, store: SessionStore, opts: AttachOptions = {}): Persistence {
  const debounceMs = opts.debounceMs ?? 250;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Set<Promise<void>>();
  let ready = false;

  const p: Persistence = {
    store,
    ready: Promise.resolve(),
    isReady: () => ready,
    restored: 0,
    seeded: false,
    async flush() {
      for (const id of [...timers.keys()]) write(id);
      while (inflight.size) await Promise.all([...inflight]);
    },
    flushSync() {
      if (!store.saveSessionSync) return;
      for (const [id, t] of timers) {
        clearTimeout(t);
        const snap = rt.snapshot(id);
        if (snap) store.saveSessionSync(snap);
      }
      timers.clear();
    },
  };

  function write(id: string) {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    const snap = rt.snapshot(id);
    if (!snap) return;
    const op = store
      .saveSession(snap)
      .catch((err) => log.error("store.save_failed", { sessionId: id, store: store.kind, err }))
      .finally(() => inflight.delete(op));
    inflight.add(op);
  }

  function schedule(id: string) {
    if (timers.has(id)) return; // already scheduled — the write picks up the latest state
    const t = setTimeout(() => write(id), debounceMs);
    if (typeof t === "object" && "unref" in t) t.unref();
    timers.set(id, t);
  }

  function hydrate(result: StoreLoadResult) {
    let skipped = 0;
    for (const snap of result.sessions) if (!rt.importSnapshot(snap)) skipped += 1;
    for (const f of result.frames ?? []) rt.restoreFrame(f.id, f);
    p.restored = result.sessions.length - skipped;
    if (skipped) log.warn("store.sessions_skipped", { count: skipped, reason: "unknown workflow version or duplicate" });
    if (result.sessions.length === 0 && opts.seed) {
      opts.seed(rt);
      p.seeded = true;
      if (store.durable) for (const id of rt.allSessionIds()) write(id);
    }
    if (store.readFrameSync) rt.frameLoader = (sid, fid) => store.readFrameSync!(sid, fid);
    if (store.durable) {
      const prevCommit = rt.onCommit;
      rt.onCommit = (id) => {
        prevCommit?.(id);
        schedule(id);
      };
      const prevFrame = rt.onFrameStored;
      rt.onFrameStored = (id, frame) => {
        prevFrame?.(id, frame);
        const op = store
          .saveFrame({ id, ...frame })
          .catch((err) => log.error("store.frame_save_failed", { sessionId: frame.sessionId, frameId: id, err }))
          .finally(() => inflight.delete(op));
        inflight.add(op);
      };
    }
    ready = true;
    (store.durable ? log.info : log.debug)("store.ready", { store: store.kind, durable: store.durable, location: store.status().location, restored: p.restored, seeded: p.seeded });
  }

  const loaded = store.load();
  if (loaded instanceof Promise) {
    p.ready = loaded.then(hydrate, (err) => {
      log.error("store.load_failed", { store: store.kind, err });
      throw err;
    });
  } else {
    hydrate(loaded);
  }
  return p;
}
