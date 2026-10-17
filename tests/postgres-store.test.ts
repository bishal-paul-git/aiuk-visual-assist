import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { workflows } from "@/lib/config/catalog";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { QaStore } from "@/lib/qa/store";
import { attachStore, createStoreFromEnv, FileSessionStore, PgDatabase, PostgresSessionStore, redactDatabaseUrl, sslOptions } from "@/lib/server/store";
import { createPgDatabase, type Queryable } from "@/lib/server/store/pg/db";
import { SCHEMA_SQL } from "@/lib/server/store/pg/schema";
import { attachPostgresConfigStore } from "@/lib/server/store/config";
import { attachPostgresQaStore } from "@/lib/server/store/qa";
import { setLogSink } from "@/lib/server/log";

/**
 * Postgres store against PGlite (Postgres compiled to WASM, in process).
 * The same SQL runs on Supabase through `pg` (tests/postgres-integration.test.ts
 * covers that path when a real server is available).
 */

const PASSWORD = "s3cret-Pa55word";
const customer = { type: "customer" as const, id: "c", name: "Test" };

function runtime() {
  return new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
}

function adapter(pg: PGlite): Queryable {
  return {
    query: (text, params) => pg.query<Record<string, unknown>>(text, params),
    exec: (sql) => pg.exec(sql),
  };
}

function database(pg: PGlite): PgDatabase {
  return new PgDatabase(adapter(pg), "pglite:5432/test", [PASSWORD]);
}

let pg: PGlite;
let restoreLog: () => void;

// One in-process database for the file (starting PGlite takes a few seconds); each test starts from an empty schema.
beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`
    drop schema if exists visual_assist cascade;
    do $$ begin
      if exists (select 1 from pg_roles where rolname = 'anon') then drop owned by anon; drop role anon; end if;
      if exists (select 1 from pg_roles where rolname = 'authenticated') then drop owned by authenticated; drop role authenticated; end if;
    end $$;
  `);
  restoreLog = setLogSink(() => {});
});

afterEach(() => {
  restoreLog();
});

describe("postgres schema", () => {
  it("migrates idempotently into its own schema, with RLS on every table", async () => {
    const db = database(pg);
    await db.migrate();
    await new PgDatabase(adapter(pg), "again").migrate(); // a second instance re-runs the whole script
    await pg.exec(SCHEMA_SQL); // and once more, raw

    const { rows } = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'visual_assist' and c.relkind = 'r' order by 1",
    );
    expect(rows).toEqual([
      { relname: "config", relrowsecurity: true },
      { relname: "frames", relrowsecurity: true },
      { relname: "qa", relrowsecurity: true },
      { relname: "sessions", relrowsecurity: true },
    ]);
    const pub = await pg.query("select 1 from pg_tables where schemaname = 'public'");
    expect(pub.rows).toHaveLength(0);
    const policies = await pg.query("select 1 from pg_policies where schemaname = 'visual_assist'");
    expect(policies.rows).toHaveLength(0);
  });

  it("revokes everything from the Supabase API roles when they exist", async () => {
    await pg.exec("create role anon; create role authenticated; create schema visual_assist; grant usage on schema visual_assist to anon, authenticated;");
    await pg.exec("create table visual_assist.qa (id smallint primary key, body jsonb not null); grant all on visual_assist.qa to anon, authenticated;");
    await database(pg).migrate();
    const { rows } = await pg.query<{ role: string; usage: boolean; sel: boolean }>(
      "select r as role, has_schema_privilege(r, 'visual_assist', 'usage') as usage, has_table_privilege(r, 'visual_assist.qa', 'select') as sel from unnest(array['anon', 'authenticated']) r",
    );
    expect(rows).toEqual([
      { role: "anon", usage: false, sel: false },
      { role: "authenticated", usage: false, sel: false },
    ]);
  });

  it("ships the same migration as db/schema.sql", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8")).toBe(SCHEMA_SQL);
  });
});

describe("postgres session store", () => {
  it("saves and loads a session", async () => {
    const rt = runtime();
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    const store = new PostgresSessionStore(database(pg));
    await store.load();
    await store.saveSession(rt.snapshot(id)!);

    const loaded = await new PostgresSessionStore(database(pg)).load();
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0]).toEqual(JSON.parse(JSON.stringify(rt.snapshot(id))));
    const { rows } = await pg.query<{ tenant_id: string; status: string; workflow_id: string; token: string }>("select tenant_id, status, workflow_id, token from visual_assist.sessions");
    expect(rows[0]).toEqual({ tenant_id: rt.snapshot(id)!.state.session.tenantId, status: rt.snapshot(id)!.state.session.status, workflow_id: "wf_router_v3", token: rt.tokenFor(id) });
    expect(store.status()).toMatchObject({ kind: "postgres", durable: true, sessions: 1, pendingWrites: 0 });
  });

  it("never lets an older snapshot overwrite a newer one, even from another instance", async () => {
    const rt = runtime();
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    const old = structuredClone(rt.snapshot(id)!);
    rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
    const newSeq = rt.snapshot(id)!.state.seq;
    expect(newSeq).toBeGreaterThan(old.state.seq);

    const a = new PostgresSessionStore(database(pg));
    await a.load();
    await a.saveSession(rt.snapshot(id)!);
    await a.saveSession(old); // same instance: skipped before the query
    const b = new PostgresSessionStore(database(pg));
    await b.saveSession(old); // another instance that never saw the newer row: the upsert's WHERE refuses it

    const [snap] = (await new PostgresSessionStore(database(pg)).load()).sessions;
    expect(snap.state.seq).toBe(newSeq);
    const { rows } = await pg.query<{ seq: number }>("select seq::int as seq from visual_assist.sessions");
    expect(rows[0].seq).toBe(newSeq);
  });

  it("saves, reads and deletes frames, and cascades on session delete", async () => {
    const rt = runtime();
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    const store = new PostgresSessionStore(database(pg));
    await store.load();
    const createdAt = Date.parse("2026-10-17T09:30:00.123Z");

    // Captured before the session's first row: waits for it (foreign key).
    await store.saveFrame({ id: "mem_early", sessionId: id, mime: "image/jpeg", data: new Uint8Array([1, 2, 3]), createdAt });
    expect((await pg.query("select 1 from visual_assist.frames")).rows).toHaveLength(0);
    await store.saveSession(rt.snapshot(id)!);
    await store.saveFrame({ id: "mem_late", sessionId: id, mime: "image/png", data: new Uint8Array([0, 255, 7]), createdAt });
    expect(store.status().frames).toBe(2);

    const loaded = await new PostgresSessionStore(database(pg)).load();
    const byId = Object.fromEntries((loaded.frames ?? []).map((f) => [f.id, f]));
    expect(byId.mem_early).toEqual({ id: "mem_early", sessionId: id, mime: "image/jpeg", data: new Uint8Array([1, 2, 3]), createdAt });
    expect([...byId.mem_late.data]).toEqual([0, 255, 7]);

    await store.deleteFrame(id, "mem_early");
    expect((await pg.query("select id from visual_assist.frames")).rows).toEqual([{ id: "mem_late" }]);
    await store.deleteFrame("ses_other", "mem_late"); // scoped to its session
    expect((await pg.query("select id from visual_assist.frames")).rows).toHaveLength(1);

    // The foreign key itself cascades, not only deleteSession.
    await pg.query("delete from visual_assist.sessions where id = $1", [id]);
    expect((await pg.query("select 1 from visual_assist.frames")).rows).toHaveLength(0);

    await store.saveSession(rt.snapshot(id)!);
    await store.saveFrame({ id: "mem_again", sessionId: id, mime: "image/png", data: new Uint8Array([9]), createdAt });
    await store.deleteSession(id);
    expect((await pg.query("select 1 from visual_assist.sessions")).rows).toHaveLength(0);
    expect((await pg.query("select 1 from visual_assist.frames")).rows).toHaveLength(0);
    expect(store.status()).toMatchObject({ sessions: 0, frames: 0 });
  });

  it("restores sessions and frames into a new runtime after a restart, and is not ready until loaded", async () => {
    const rt1 = runtime();
    const p1 = attachStore(rt1, new PostgresSessionStore(database(pg)), { debounceMs: 1 });
    expect(p1.isReady()).toBe(false);
    await p1.ready;
    expect(p1.isReady()).toBe(true);
    const { id } = rt1.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    const frameId = rt1.storeFrame(id, "image/jpeg", new Uint8Array([9, 9, 9]));
    rt1.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
    await p1.flush();
    await (p1.store as PostgresSessionStore).idle();

    const rt2 = runtime();
    const p2 = attachStore(rt2, new PostgresSessionStore(database(pg)), { seed: () => rt2.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Seed", scenario: "power_cycle_fix" }) });
    await p2.ready;
    expect(p2.restored).toBe(1);
    expect(p2.seeded).toBe(false);
    expect(rt2.snapshot(id)!.state.seq).toBe(rt1.snapshot(id)!.state.seq);
    expect(rt2.idForToken(rt1.tokenFor(id)!)).toBe(id);
    expect([...rt2.getFrame(id, `mem:${frameId}`)!.data]).toEqual([9, 9, 9]);
    expect(rt2.getFrame("ses_other", `mem:${frameId}`)).toBeUndefined();
  });

  it("survives closing and reopening the database files", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-pglite-"));
    try {
      const rt = runtime();
      const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
      const first = new PGlite(dir);
      const s1 = new PostgresSessionStore(database(first));
      await s1.load();
      await s1.saveSession(rt.snapshot(id)!);
      await first.close();

      const second = new PGlite(dir);
      const loaded = await new PostgresSessionStore(database(second)).load();
      expect(loaded.sessions.map((s) => s.state.session.id)).toEqual([id]);
      await second.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("postgres config and QA stores", () => {
  it("round-trips workflow versions published at runtime", async () => {
    const db = database(pg);
    await db.migrate();
    expect((await attachPostgresConfigStore(db)).restored).toBe(false);

    const r = getWorkflowRegistry();
    const admin = { id: "usr_priya", name: "Priya Shah" };
    const draft = r.createDraft("wf_router_v3", admin);
    r.updateDraft(draft.id, { changeNote: "Saved to Postgres" }, admin);
    await db.idle();
    const { rows } = await pg.query<{ body: { workflows: { id: string; changeNote?: string }[] } }>("select body from visual_assist.config where id = 1");
    expect(rows[0].body.workflows.find((w) => w.id === draft.id)?.changeNote).toBe("Saved to Postgres");

    // Simulate a restart: the in-memory catalog loses the runtime version.
    workflows.splice(workflows.findIndex((w) => w.id === draft.id), 1);
    expect((await attachPostgresConfigStore(database(pg))).restored).toBe(true);
    expect(workflows.find((w) => w.id === draft.id)?.changeNote).toBe("Saved to Postgres");
  });

  it("round-trips QA records", async () => {
    const db = database(pg);
    await db.migrate();
    const qa = new QaStore();
    expect((await attachPostgresQaStore(db, qa)).restored).toBe(false);
    qa.addCases([{ id: "case_1" } as never, { id: "case_2" } as never]);
    qa.addCases([{ id: "case_3" } as never]); // coalesced with the write above
    await db.idle();

    const fresh = new QaStore();
    expect((await attachPostgresQaStore(database(pg), fresh)).restored).toBe(true);
    expect(fresh.reviewedCases.map((c) => c.id)).toEqual(["case_1", "case_2", "case_3"]);
  });
});

describe("postgres selection and reporting", () => {
  const url = `postgresql://postgres.abcdefghijkl:${PASSWORD}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`;

  it("is selected by DATABASE_URL, ahead of DATA_DIR", () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__aiukVisualAssistDatabase;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-store-"));
    try {
      expect(createStoreFromEnv({ DATABASE_URL: url, DATA_DIR: dir })).toBeInstanceOf(PostgresSessionStore);
      expect(createStoreFromEnv({ DATABASE_URL: " ", DATA_DIR: dir })).toBeInstanceOf(FileSessionStore);
    } finally {
      delete g.__aiukVisualAssistDatabase;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never reports the password: location is host, port and database only", () => {
    const store = new PostgresSessionStore(createPgDatabase(url, {}));
    const status = store.status();
    expect(status.location).toBe("postgres://aws-0-eu-west-2.pooler.supabase.com:5432/postgres");
    expect(JSON.stringify(status)).not.toContain(PASSWORD);
    expect(JSON.stringify(status)).not.toContain("abcdefghijkl");
    expect(redactDatabaseUrl("not a url")).not.toContain("not a url");
  });

  it("scrubs the password and URL from errors it records", async () => {
    const failing: Queryable = {
      query: async () => {
        throw new Error(`connect failed for ${url} (password ${PASSWORD})`);
      },
      exec: async () => {
        throw new Error(`connect failed for ${url}`);
      },
    };
    const store = new PostgresSessionStore(new PgDatabase(failing, "db.example:5432/postgres", [url, PASSWORD]), { loadAttempts: 2, retryDelayMs: 1 });
    await expect(store.load()).rejects.toThrow(/connect failed/);
    const status = JSON.stringify(store.status());
    expect(status).toContain("Load failed (attempt 2 of 2)");
    expect(status).not.toContain(PASSWORD);
    expect(status).not.toContain("pooler.supabase.com");
  });

  it("chooses TLS settings: Supabase without verification, localhost plain, others verified", () => {
    expect(sslOptions(url, {})).toEqual({ rejectUnauthorized: false });
    expect(sslOptions("postgres://u:p@db.abcdefghijkl.supabase.co:5432/postgres", {})).toEqual({ rejectUnauthorized: false });
    expect(sslOptions(url, { DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----" })).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----" });
    expect(sslOptions("postgres://u:p@localhost:5432/va", {})).toBe(false);
    expect(sslOptions("postgres://u:p@db.internal.example:5432/va", {})).toEqual({ rejectUnauthorized: true });
    expect(sslOptions("postgres://u:p@db.internal.example:5432/va?sslmode=disable", {})).toBe(false);
    expect(sslOptions(url, { DATABASE_SSL: "disable" })).toBe(false);
    expect(sslOptions(url, { DATABASE_SSL: "require" })).toEqual({ rejectUnauthorized: true });
    expect(sslOptions("postgres://u:p@localhost/va", { DATABASE_SSL: "no-verify" })).toEqual({ rejectUnauthorized: false });
  });
});
