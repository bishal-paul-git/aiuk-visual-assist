import type { SessionSnapshot, StoredFrame } from "@/lib/runtime/session-runtime";

/**
 * Durable session storage for the server edition (docs/07 §3, docs/04).
 *
 * The runtime keeps authoritative state in memory and writes through to a
 * SessionStore on every commit. Implementations:
 *   - MemorySessionStore — default; nothing survives a restart.
 *   - FileSessionStore   — JSON snapshots + frame files under DATA_DIR.
 *   - PostgresSessionStore — DATABASE_URL (e.g. Supabase); tables
 *     visual_assist.sessions / visual_assist.frames, see db/schema.sql.
 *
 * `load()` may return a Promise, which the server runtime awaits via
 * `runtimeReady()` before serving traffic (/api/health is 503 until then).
 * `deleteSession` removes the session's frames too; retention jobs call it.
 */

export interface PersistedFrame extends StoredFrame {
  id: string;
}

export interface StoreLoadResult {
  sessions: SessionSnapshot[];
  /** Frames to hold in memory at boot. Stores with `readFrameSync` may omit them and serve lazily. */
  frames?: PersistedFrame[];
}

export interface StoreStatus {
  kind: "memory" | "file" | "postgres";
  durable: boolean;
  /** Where data lives (directory, connection label). Never contains credentials. */
  location?: string;
  sessions: number;
  frames: number;
  pendingWrites: number;
  lastWriteAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

export interface SessionStore {
  readonly kind: StoreStatus["kind"];
  readonly durable: boolean;
  /** Everything needed to rebuild the runtime. Sync for local stores, async for networked ones. */
  load(): StoreLoadResult | Promise<StoreLoadResult>;
  saveSession(snapshot: SessionSnapshot): Promise<void>;
  saveFrame(frame: PersistedFrame): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  /** Delete one frame's bytes and metadata (retention). */
  deleteFrame(sessionId: string, frameId: string): Promise<void>;
  /** Optional lazy frame read (keeps frame bytes out of memory until requested). */
  readFrameSync?(sessionId: string, frameId: string): StoredFrame | undefined;
  /** Optional synchronous write used for a best-effort flush at process exit. */
  saveSessionSync?(snapshot: SessionSnapshot): void;
  status(): StoreStatus;
}
