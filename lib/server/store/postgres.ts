import type { SessionSnapshot } from "@/lib/runtime/session-runtime";
import type { SessionState } from "@/lib/domain/session";
import { log } from "@/lib/server/log";
import type { PgDatabase } from "./pg/db";
import type { PersistedFrame, SessionStore, StoreLoadResult, StoreStatus } from "./types";

/**
 * Postgres store (DATABASE_URL), e.g. Supabase. Tables are in the
 * `visual_assist` schema (db/schema.sql), created on boot.
 *
 *   visual_assist.sessions   one row per session; `state` jsonb
 *   visual_assist.frames     selected-evidence frame bytes; cascade on session delete
 *
 * Postgres cannot be written synchronously, so this store has no
 * `saveSessionSync` / `readFrameSync`. Instead:
 *   - `load()` is async (the runtime reports not-ready until it resolves) and
 *     returns every stored frame, which the runtime holds in memory, the same
 *     as frames captured during this process's lifetime.
 *   - pending writes are flushed asynchronously on SIGTERM (lib/server/runtime.ts).
 *
 * Writes for one session are serialised. A session upsert only applies when
 * its sequence number is not older than the stored row's, so an out-of-order
 * write can never roll a session back (the file store's rule). A frame
 * captured before its session's first write waits for that write, because of
 * the foreign key.
 */

interface SessionRow {
  state: SessionState;
  token: string;
  workflow_id: string;
  live: boolean;
}

interface FrameRow {
  id: string;
  session_id: string;
  mime: string;
  data: Uint8Array;
  created_ms: number | string;
}

export interface PostgresStoreOptions {
  /** Runs after the migration and before sessions load (config, so pinned workflow versions restore). */
  beforeLoad?: () => Promise<unknown>;
  /** Attempts for the initial load while the database is unreachable (default: keep trying, backing off from 1 s to 30 s). */
  loadAttempts?: number;
  retryDelayMs?: number;
}

export class PostgresSessionStore implements SessionStore {
  readonly kind = "postgres" as const;
  readonly durable = true;
  beforeLoad?: () => Promise<unknown>;
  private readonly loadAttempts: number;
  private readonly retryDelayMs: number;
  private chains = new Map<string, Promise<void>>();
  private savedSeq = new Map<string, number>();
  /** Frames waiting for their session's first row. */
  private parked = new Map<string, PersistedFrame[]>();
  private frameIds = new Set<string>();
  private pending = 0;
  private lastWriteAt?: string;
  private lastError?: string;
  private lastErrorAt?: string;

  constructor(
    readonly db: PgDatabase,
    opts: PostgresStoreOptions = {},
  ) {
    this.beforeLoad = opts.beforeLoad;
    this.loadAttempts = Math.max(1, opts.loadAttempts ?? Number.POSITIVE_INFINITY);
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  async load(): Promise<StoreLoadResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.loadOnce();
      } catch (e) {
        const of = Number.isFinite(this.loadAttempts) ? ` of ${this.loadAttempts}` : "";
        this.fail(`Load failed (attempt ${attempt}${of}): ${(e as Error).message}`);
        if (attempt >= this.loadAttempts) throw e;
        // Not ready (503) until a load succeeds; the error is on /api/health meanwhile.
        if (attempt === 1 || attempt % 10 === 0) log.warn("store.load_retrying", { store: this.kind, attempt, error: this.lastError });
        await new Promise((r) => setTimeout(r, Math.min(30_000, this.retryDelayMs * 2 ** (attempt - 1))));
      }
    }
  }

  private async loadOnce(): Promise<StoreLoadResult> {
    await this.db.migrate();
    await this.beforeLoad?.();
    const { rows } = await this.db.query<SessionRow>("select state, token, workflow_id, live from visual_assist.sessions order by created_at");
    const sessions: SessionSnapshot[] = [];
    this.savedSeq.clear();
    for (const r of rows) {
      const state = typeof r.state === "string" ? (JSON.parse(r.state) as SessionState) : r.state;
      if (!state?.session?.id) {
        this.fail("Skipped a session row without state");
        continue;
      }
      sessions.push({ state, token: r.token, workflowId: r.workflow_id, live: Boolean(r.live) });
      this.savedSeq.set(state.session.id, state.seq);
    }
    const frameRows = await this.db.query<FrameRow>(
      "select id, session_id, mime, data, round(extract(epoch from created_at) * 1000)::float8 as created_ms from visual_assist.frames",
    );
    this.frameIds = new Set(frameRows.rows.map((f) => f.id));
    const frames: PersistedFrame[] = frameRows.rows.map((f) => ({
      id: f.id,
      sessionId: f.session_id,
      mime: f.mime,
      data: new Uint8Array(f.data),
      createdAt: Number(f.created_ms),
    }));
    // A successful load clears a transient connection error from a retry.
    this.lastError = undefined;
    this.lastErrorAt = undefined;
    return { sessions, frames };
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async saveSession(snapshot: SessionSnapshot): Promise<void> {
    const s = snapshot.state;
    const id = s.session.id;
    // Serialise now so later in-memory changes cannot leak into this write.
    const params = [id, s.session.tenantId, s.seq, s.session.status, snapshot.workflowId, snapshot.live, snapshot.token, JSON.stringify(s), s.session.createdAt];
    await this.enqueue(id, `session ${id}`, async () => {
      if ((this.savedSeq.get(id) ?? -1) > s.seq) return; // a newer snapshot already landed
      await this.db.query(
        `insert into visual_assist.sessions (id, tenant_id, seq, status, workflow_id, live, token, state, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, now())
         on conflict (id) do update set
           tenant_id = excluded.tenant_id, seq = excluded.seq, status = excluded.status, workflow_id = excluded.workflow_id,
           live = excluded.live, token = excluded.token, state = excluded.state, updated_at = now()
         where visual_assist.sessions.seq <= excluded.seq`,
        params,
      );
      this.savedSeq.set(id, Math.max(s.seq, this.savedSeq.get(id) ?? -1));
      const waiting = this.parked.get(id);
      if (waiting) {
        this.parked.delete(id);
        for (const f of waiting) await this.insertFrame(f);
      }
    });
  }

  async saveFrame(frame: PersistedFrame): Promise<void> {
    await this.enqueue(frame.sessionId, `frame ${frame.id}`, async () => {
      if (!this.savedSeq.has(frame.sessionId)) {
        const list = this.parked.get(frame.sessionId) ?? [];
        list.push(frame);
        this.parked.set(frame.sessionId, list);
        return;
      }
      await this.insertFrame(frame);
    });
  }

  private async insertFrame(frame: PersistedFrame) {
    try {
      await this.db.query(
        `insert into visual_assist.frames (id, session_id, mime, data, created_at)
         values ($1, $2, $3, $4, to_timestamp($5::float8 / 1000.0))
         on conflict (id) do nothing`,
        [frame.id, frame.sessionId, frame.mime, Buffer.from(frame.data), frame.createdAt],
      );
      this.frameIds.add(frame.id);
    } catch (e) {
      // The session was deleted in the meantime: nothing to keep.
      if ((e as { code?: string }).code === "23503") return;
      throw e;
    }
  }

  async deleteFrame(sessionId: string, frameId: string): Promise<void> {
    await this.enqueue(sessionId, `frame ${frameId}`, async () => {
      const waiting = this.parked.get(sessionId);
      if (waiting) this.parked.set(sessionId, waiting.filter((f) => f.id !== frameId));
      await this.db.query("delete from visual_assist.frames where id = $1 and session_id = $2", [frameId, sessionId]);
      this.frameIds.delete(frameId);
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.enqueue(sessionId, `session ${sessionId}`, async () => {
      const { rows } = await this.db.query<{ id: string }>("delete from visual_assist.frames where session_id = $1 returning id", [sessionId]);
      await this.db.query("delete from visual_assist.sessions where id = $1", [sessionId]);
      for (const r of rows) this.frameIds.delete(r.id);
      this.parked.delete(sessionId);
      this.savedSeq.delete(sessionId);
    });
  }

  /** Resolves once every queued write has finished (tests and shutdown). */
  async idle(): Promise<void> {
    while (this.chains.size) await Promise.all([...this.chains.values()]);
  }

  status(): StoreStatus {
    return {
      kind: this.kind,
      durable: true,
      location: `postgres://${this.db.location}`,
      sessions: this.savedSeq.size,
      frames: this.frameIds.size,
      pendingWrites: this.pending + this.db.pendingWrites,
      lastWriteAt: this.lastWriteAt,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
    };
  }

  private enqueue(key: string, what: string, write: () => Promise<void>): Promise<void> {
    this.pending += 1;
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.then(write).then(
      () => {
        this.lastWriteAt = new Date().toISOString();
      },
      (e: Error) => {
        this.fail(`Write failed for ${what}: ${e.message}`);
        throw e;
      },
    );
    const settled: Promise<void> = run
      .catch(() => {})
      .finally(() => {
        this.pending -= 1;
        if (this.chains.get(key) === settled) this.chains.delete(key);
      });
    this.chains.set(key, settled);
    return run;
  }

  private fail(message: string) {
    this.lastError = this.db.scrub(message);
    this.lastErrorAt = new Date().toISOString();
  }
}
