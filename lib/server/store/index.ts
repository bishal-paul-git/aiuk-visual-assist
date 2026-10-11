import { FileSessionStore } from "./file";
import { MemorySessionStore } from "./memory";
import type { SessionStore } from "./types";

export type { SessionStore, StoreStatus, StoreLoadResult, PersistedFrame } from "./types";
export { MemorySessionStore } from "./memory";
export { FileSessionStore } from "./file";
export { attachStore, type Persistence } from "./persistence";

/**
 * DATA_DIR set → file store under that directory (durable across restarts).
 * Otherwise → in-memory, exactly as before.
 */
export function createStoreFromEnv(env: Record<string, string | undefined> = process.env): SessionStore {
  const dir = env.DATA_DIR?.trim();
  return dir ? new FileSessionStore(dir) : new MemorySessionStore();
}
