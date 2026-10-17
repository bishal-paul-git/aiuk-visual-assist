import { afterAll, describe, expect, it } from "vitest";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { PostgresSessionStore } from "@/lib/server/store";
import { createPgDatabase } from "@/lib/server/store/pg/db";

/**
 * Same store through the real `pg` driver against a real server. Skipped
 * unless PG_INTEGRATION_URL points at a throwaway database, e.g.
 *
 *   PG_INTEGRATION_URL=postgres://postgres@localhost:5432/va_test npx vitest run tests/postgres-integration.test.ts
 *
 * It creates the visual_assist schema if missing and removes only the
 * session it writes.
 */

const url = process.env.PG_INTEGRATION_URL;

describe.skipIf(!url)("postgres store over pg (integration)", () => {
  const db = url ? createPgDatabase(url) : undefined;
  afterAll(async () => {
    await db?.close();
  });

  it("migrates, saves, reloads and deletes through a pg Pool", async () => {
    const rt = new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Integration", scenario: "power_cycle_fix" });
    const store = new PostgresSessionStore(db!);
    await store.load();
    await db!.migrate(); // idempotent
    await store.saveSession(rt.snapshot(id)!);
    await store.saveFrame({ id: `mem_it_${id.slice(-8)}`, sessionId: id, mime: "image/jpeg", data: new Uint8Array([4, 5, 6]), createdAt: Date.now() });

    const loaded = await new PostgresSessionStore(db!).load();
    expect(loaded.sessions.find((s) => s.state.session.id === id)?.token).toBe(rt.tokenFor(id));
    expect([...(loaded.frames ?? []).find((f) => f.sessionId === id)!.data]).toEqual([4, 5, 6]);
    expect(JSON.stringify(store.status())).not.toContain(new URL(url!).password || "\u0000");

    await store.deleteSession(id);
    const after = await new PostgresSessionStore(db!).load();
    expect(after.sessions.some((s) => s.state.session.id === id)).toBe(false);
    expect((after.frames ?? []).some((f) => f.sessionId === id)).toBe(false);
  });
});
