import { FileSessionStore } from "./file";
import { MemorySessionStore } from "./memory";
import { databaseFromEnv } from "./pg/db";
import { PostgresSessionStore } from "./postgres";
import type { SessionStore } from "./types";

export type { SessionStore, StoreStatus, StoreLoadResult, PersistedFrame } from "./types";
export { MemorySessionStore } from "./memory";
export { FileSessionStore } from "./file";
export { PostgresSessionStore } from "./postgres";
export { PgDatabase, databaseFromEnv, redactDatabaseUrl, sslOptions } from "./pg/db";
export { attachStore, type Persistence } from "./persistence";

/**
 * DATABASE_URL set → Postgres store (durable, takes precedence over DATA_DIR).
 * DATA_DIR set     → file store under that directory (durable across restarts).
 * Otherwise        → in-memory, exactly as before.
 */
export function createStoreFromEnv(env: Record<string, string | undefined> = process.env): SessionStore {
  const db = databaseFromEnv(env);
  if (db) return new PostgresSessionStore(db);
  const dir = env.DATA_DIR?.trim();
  return dir ? new FileSessionStore(dir) : new MemorySessionStore();
}
