import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { SessionSnapshot, StoredFrame } from "@/lib/runtime/session-runtime";
import type { PersistedFrame, SessionStore, StoreLoadResult, StoreStatus } from "./types";

/**
 * File-system store for single-instance deployments without a database.
 *
 *   <DATA_DIR>/sessions/<sessionId>.json             one snapshot per session
 *   <DATA_DIR>/frames/<sessionId>/<frameId>.bin      selected-evidence frame bytes
 *   <DATA_DIR>/frames/<sessionId>/<frameId>.json     frame metadata (mime, createdAt)
 *
 * Every write goes to a temporary file in the same directory and is renamed
 * into place, so a crash never leaves a half-written snapshot. Writes to the
 * same file are serialised. Frames are read lazily, so restarts do not pull
 * every image into memory.
 */

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const FORMAT_VERSION = 1;

interface SessionFile {
  version: number;
  savedAt: string;
  snapshot: SessionSnapshot;
}

export class FileSessionStore implements SessionStore {
  readonly kind = "file" as const;
  readonly durable = true;
  readonly dir: string;
  private chains = new Map<string, Promise<void>>();
  private savedSeq = new Map<string, number>();
  private frameCount = 0;
  private pending = 0;
  private lastWriteAt?: string;
  private lastError?: string;
  private lastErrorAt?: string;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    fs.mkdirSync(this.framesDir, { recursive: true });
  }

  private get sessionsDir() {
    return path.join(this.dir, "sessions");
  }

  private get framesDir() {
    return path.join(this.dir, "frames");
  }

  private sessionPath(id: string) {
    return path.join(this.sessionsDir, `${safeId(id)}.json`);
  }

  private frameBase(sessionId: string, frameId: string) {
    return path.join(this.framesDir, safeId(sessionId), safeId(frameId));
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  load(): StoreLoadResult {
    const sessions: SessionSnapshot[] = [];
    for (const name of fs.readdirSync(this.sessionsDir)) {
      const full = path.join(this.sessionsDir, name);
      if (name.endsWith(".tmp")) {
        // Left behind by a crash mid-write; the previous snapshot is intact.
        fs.rmSync(full, { force: true });
        continue;
      }
      if (!name.endsWith(".json")) continue;
      try {
        const file = JSON.parse(fs.readFileSync(full, "utf8")) as SessionFile;
        const snap = file.snapshot;
        if (!snap?.state?.session?.id || typeof snap.token !== "string") throw new Error("missing fields");
        sessions.push(snap);
        this.savedSeq.set(snap.state.session.id, snap.state.seq);
      } catch (e) {
        this.fail(`Could not read ${name}: ${(e as Error).message}`);
      }
    }
    this.frameCount = 0;
    for (const sid of fs.readdirSync(this.framesDir)) {
      const dir = path.join(this.framesDir, sid);
      try {
        for (const name of fs.readdirSync(dir)) {
          if (name.endsWith(".tmp")) fs.rmSync(path.join(dir, name), { force: true });
          else if (name.endsWith(".bin")) this.frameCount += 1;
        }
      } catch {
        /* not a directory */
      }
    }
    return { sessions };
  }

  readFrameSync(sessionId: string, frameId: string): StoredFrame | undefined {
    if (!ID.test(sessionId) || !ID.test(frameId)) return undefined;
    const base = this.frameBase(sessionId, frameId);
    try {
      const meta = JSON.parse(fs.readFileSync(`${base}.json`, "utf8")) as { mime: string; createdAt: number };
      const data = new Uint8Array(fs.readFileSync(`${base}.bin`));
      return { sessionId, mime: meta.mime, createdAt: meta.createdAt, data };
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async saveSession(snapshot: SessionSnapshot): Promise<void> {
    const id = snapshot.state.session.id;
    const seq = snapshot.state.seq;
    // Serialise now so later in-memory changes cannot leak into this write.
    const body = serialise(snapshot);
    await this.enqueue(this.sessionPath(id), async (target) => {
      if ((this.savedSeq.get(id) ?? -1) > seq) return; // a newer snapshot already landed
      await atomicWrite(target, body);
      this.savedSeq.set(id, seq);
    });
  }

  saveSessionSync(snapshot: SessionSnapshot): void {
    const id = snapshot.state.session.id;
    const target = this.sessionPath(id);
    const tmp = tmpName(target);
    try {
      fs.writeFileSync(tmp, serialise(snapshot));
      fs.renameSync(tmp, target);
      this.savedSeq.set(id, snapshot.state.seq);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      this.fail(`Sync write failed for ${id}: ${(e as Error).message}`);
    }
  }

  async saveFrame(frame: PersistedFrame): Promise<void> {
    const base = this.frameBase(frame.sessionId, frame.id);
    await fsp.mkdir(path.dirname(base), { recursive: true });
    await this.enqueue(`${base}.bin`, async (target) => {
      await atomicWrite(target, frame.data);
      await atomicWrite(`${base}.json`, JSON.stringify({ mime: frame.mime, createdAt: frame.createdAt }));
      this.frameCount += 1;
    });
  }

  async deleteFrame(sessionId: string, frameId: string): Promise<void> {
    const base = this.frameBase(sessionId, frameId);
    await this.enqueue(`${base}.bin`, async () => {
      const existed = await fsp
        .stat(`${base}.bin`)
        .then(() => true)
        .catch(() => false);
      await fsp.rm(`${base}.bin`, { force: true });
      await fsp.rm(`${base}.json`, { force: true });
      if (existed) this.frameCount = Math.max(0, this.frameCount - 1);
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    const target = this.sessionPath(sessionId);
    await this.enqueue(target, async () => {
      await fsp.rm(target, { force: true });
      const frameDir = path.join(this.framesDir, safeId(sessionId));
      const frames = await fsp.readdir(frameDir).catch(() => [] as string[]);
      this.frameCount = Math.max(0, this.frameCount - frames.filter((f) => f.endsWith(".bin")).length);
      await fsp.rm(frameDir, { recursive: true, force: true });
      this.savedSeq.delete(sessionId);
    });
  }

  /** Resolves once every queued write has finished (used by tests and shutdown). */
  async idle(): Promise<void> {
    while (this.chains.size) await Promise.all([...this.chains.values()]);
  }

  status(): StoreStatus {
    return {
      kind: this.kind,
      durable: true,
      location: this.dir,
      sessions: this.savedSeq.size,
      frames: this.frameCount,
      pendingWrites: this.pending,
      lastWriteAt: this.lastWriteAt,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
    };
  }

  private enqueue(target: string, write: (target: string) => Promise<void>): Promise<void> {
    this.pending += 1;
    const prev = this.chains.get(target) ?? Promise.resolve();
    const run = prev
      .then(() => write(target))
      .then(
        () => {
          this.lastWriteAt = new Date().toISOString();
        },
        (e: Error) => {
          this.fail(`Write failed for ${path.basename(target)}: ${e.message}`);
          throw e;
        },
      );
    const settled: Promise<void> = run
      .catch(() => {})
      .finally(() => {
        this.pending -= 1;
        if (this.chains.get(target) === settled) this.chains.delete(target);
      });
    this.chains.set(target, settled);
    return run;
  }

  private fail(message: string) {
    this.lastError = message;
    this.lastErrorAt = new Date().toISOString();
  }
}

function safeId(id: string): string {
  if (!ID.test(id)) throw new Error(`Unsafe id for storage: ${JSON.stringify(id).slice(0, 40)}`);
  return id;
}

function serialise(snapshot: SessionSnapshot): string {
  const file: SessionFile = { version: FORMAT_VERSION, savedAt: new Date().toISOString(), snapshot };
  return JSON.stringify(file);
}

function tmpName(target: string): string {
  return `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
}

async function atomicWrite(target: string, data: string | Uint8Array): Promise<void> {
  const tmp = tmpName(target);
  try {
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, target);
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}
