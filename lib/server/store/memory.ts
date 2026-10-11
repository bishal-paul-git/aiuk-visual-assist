import type { SessionSnapshot } from "@/lib/runtime/session-runtime";
import type { PersistedFrame, SessionStore, StoreLoadResult, StoreStatus } from "./types";

/** Default store: keeps copies in process memory. Nothing survives a restart. */
export class MemorySessionStore implements SessionStore {
  readonly kind = "memory" as const;
  readonly durable = false;
  private sessions = new Map<string, SessionSnapshot>();
  private frames = new Map<string, PersistedFrame>();
  private lastWriteAt?: string;

  load(): StoreLoadResult {
    return { sessions: [...this.sessions.values()].map(clone), frames: [...this.frames.values()] };
  }

  async saveSession(snapshot: SessionSnapshot): Promise<void> {
    this.sessions.set(snapshot.state.session.id, clone(snapshot));
    this.lastWriteAt = new Date().toISOString();
  }

  async saveFrame(frame: PersistedFrame): Promise<void> {
    this.frames.set(frame.id, frame);
    this.lastWriteAt = new Date().toISOString();
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    for (const [id, f] of this.frames) if (f.sessionId === sessionId) this.frames.delete(id);
  }

  status(): StoreStatus {
    return {
      kind: this.kind,
      durable: false,
      location: "process memory",
      sessions: this.sessions.size,
      frames: this.frames.size,
      pendingWrites: 0,
      lastWriteAt: this.lastWriteAt,
    };
  }
}

function clone(s: SessionSnapshot): SessionSnapshot {
  return JSON.parse(JSON.stringify(s)) as SessionSnapshot;
}
