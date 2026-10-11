import type { SessionSnapshot, StoredFrame } from "@/lib/runtime/session-runtime";

/**
 * Durable session storage for the server edition (docs/07 §3, docs/04).
 *
 * The runtime keeps authoritative state in memory and writes through to a
 * SessionStore on every commit. Implementations:
 *   - MemorySessionStore — default; nothing survives a restart.
 *   - FileSessionStore   — JSON snapshots + frame files under DATA_DIR.
 *
 * Intended Postgres adapter (not built yet — "no database for now"). The
 * interface maps onto two tables; `load()` may return a Promise, which the
 * server runtime awaits via `runtimeReady()` before serving traffic:
 *
 *   create table va_sessions (
 *     id          text primary key,
 *     tenant_id   text not null,
 *     token       text not null unique,      -- or a hash, if links are re-issued
 *     workflow_id text not null,
 *     live        boolean not null,
 *     seq         bigint not null,           -- optimistic ordering: upsert only when excluded.seq > seq
 *     status      text not null,
 *     created_at  timestamptz not null,
 *     updated_at  timestamptz not null default now(),
 *     state       jsonb not null             -- SessionState as written by the orchestrator
 *   );
 *   create index on va_sessions (tenant_id, created_at desc);
 *
 *   create table va_frames (
 *     id          text primary key,          -- "mem_…" frame id (referenced as "mem:<id>")
 *     session_id  text not null references va_sessions(id) on delete cascade,
 *     mime        text not null,
 *     data        bytea not null,            -- or an object-storage key in production
 *     created_at  timestamptz not null
 *   );
 *
 * `deleteSession` cascades to frames; retention jobs call it.
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
  /** Optional lazy frame read (keeps frame bytes out of memory until requested). */
  readFrameSync?(sessionId: string, frameId: string): StoredFrame | undefined;
  /** Optional synchronous write used for a best-effort flush at process exit. */
  saveSessionSync?(snapshot: SessionSnapshot): void;
  status(): StoreStatus;
}
