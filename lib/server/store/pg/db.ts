import { log } from "@/lib/server/log";
import { SCHEMA_SQL } from "./schema";

/**
 * Postgres connection for the server edition (DATABASE_URL), e.g. Supabase.
 *
 * Everything that talks to the database goes through `PgDatabase`, which
 * wraps a minimal `Queryable`: a `pg` Pool in production, PGlite in tests.
 * `pg` is imported lazily on the first query, so the static export and the
 * memory/file stores never load it.
 *
 * The connection string is never logged or reported: `location` holds only
 * host, port and database name, and error messages are scrubbed of the
 * password and the full URL before they are stored or rethrown.
 */

export interface QueryResult<R> {
  rows: R[];
}

/** The subset of a Postgres client the stores use. */
export interface Queryable {
  /** One parameterised statement. */
  query(text: string, params?: unknown[]): Promise<QueryResult<Record<string, unknown>>>;
  /** Several statements, no parameters (migrations). */
  exec(sql: string): Promise<unknown>;
  end?(): Promise<void>;
}

export type SslMode = "require" | "no-verify" | "disable";

export class PgDatabase {
  private migrated?: Promise<void>;
  private pending = new Set<Promise<unknown>>();

  /**
   * @param raw       the client
   * @param location  redacted label for status and logs (never credentials)
   * @param secrets   strings to scrub from error messages
   */
  constructor(
    private readonly raw: Queryable,
    readonly location: string,
    private readonly secrets: string[] = [],
  ) {}

  async query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
    try {
      return (await this.raw.query(text, params)) as QueryResult<R>;
    } catch (e) {
      throw this.clean(e);
    }
  }

  /** Create the schema and tables if missing. Runs once per instance; safe to repeat. */
  migrate(): Promise<void> {
    this.migrated ??= this.raw.exec(SCHEMA_SQL).then(
      () => undefined,
      (e) => {
        this.migrated = undefined; // allow a retry
        throw this.clean(e);
      },
    );
    return this.migrated;
  }

  /** Track a background write so shutdown can wait for it. */
  track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    void p.then(
      () => this.pending.delete(p),
      () => this.pending.delete(p),
    );
    return p;
  }

  get pendingWrites(): number {
    return this.pending.size;
  }

  /** Resolves once every tracked write has settled. */
  async idle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  async close(): Promise<void> {
    await this.raw.end?.();
  }

  /** Remove credentials from an error message. */
  scrub(message: string): string {
    let out = message;
    for (const s of this.secrets) if (s) out = out.split(s).join("***");
    return out.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgres://***");
  }

  private clean(e: unknown): Error {
    const err = e instanceof Error ? e : new Error(String(e));
    const cleaned = new Error(this.scrub(err.message));
    cleaned.name = err.name;
    const code = (err as { code?: unknown }).code;
    if (code !== undefined) (cleaned as Error & { code?: unknown }).code = code;
    return cleaned;
  }
}

const SUPABASE_HOST = /\.(pooler\.)?supabase\.(co|com)$/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/i;

/** host:port/database, for status and logs. */
export function redactDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    const db = decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres";
    return `${u.hostname}:${u.port || "5432"}/${db}`;
  } catch {
    return "postgres (unparseable DATABASE_URL)";
  }
}

/**
 * TLS settings. DATABASE_SSL wins when set:
 *   require    TLS, certificate verified (against DATABASE_SSL_CA when given)
 *   no-verify  TLS, certificate not verified (Supabase without a CA bundle)
 *   disable    no TLS
 * Otherwise: Supabase hosts → no-verify (require when a CA is supplied),
 * localhost → disable, any other host → require. An `sslmode` in the URL is
 * honoured when DATABASE_SSL is unset.
 */
export function sslOptions(
  url: string,
  env: Record<string, string | undefined> = process.env,
): false | { rejectUnauthorized: boolean; ca?: string } {
  const ca = env.DATABASE_SSL_CA?.trim() || undefined;
  let host = "";
  let urlMode: string | null = null;
  try {
    const u = new URL(url);
    host = u.hostname;
    urlMode = u.searchParams.get("sslmode");
  } catch {
    /* fall through to defaults */
  }
  const mode = sslMode(env.DATABASE_SSL, urlMode, host, Boolean(ca));
  if (mode === "disable") return false;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

function sslMode(explicit: string | undefined, urlMode: string | null, host: string, hasCa: boolean): SslMode {
  const e = explicit?.trim().toLowerCase();
  if (e === "require" || e === "no-verify" || e === "disable") return e;
  if (e) log.warn("store.database_ssl_invalid", { value: e, allowed: "require | no-verify | disable" });
  if (urlMode === "disable") return "disable";
  if (urlMode === "verify-full" || urlMode === "verify-ca") return "require";
  if (urlMode === "no-verify") return "no-verify";
  if (SUPABASE_HOST.test(host)) return hasCa ? "require" : "no-verify";
  if (!host || LOCAL_HOST.test(host)) return urlMode === "require" ? "no-verify" : "disable";
  return "require";
}

/** The URL without ssl* parameters, so `pg` does not override the explicit `ssl` option. */
function withoutSslParams(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("ssl")) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

function passwordOf(url: string): string[] {
  try {
    const u = new URL(url);
    return [url, u.password, decodeURIComponent(u.password)].filter((s) => s.length >= 3);
  } catch {
    return [url];
  }
}

/** A `pg` Pool behind the `PgDatabase` wrapper. */
export function createPgDatabase(url: string, env: Record<string, string | undefined> = process.env): PgDatabase {
  type Pool = import("pg").Pool;
  let pool: Promise<Pool> | undefined;
  const location = redactDatabaseUrl(url);
  const secrets = passwordOf(url);
  const scrub = (s: string) => db.scrub(s);
  const getPool = () =>
    (pool ??= import("pg").then((mod) => {
      const pg = (mod as unknown as { default?: typeof import("pg") }).default ?? mod;
      const p = new pg.Pool({
        connectionString: withoutSslParams(url),
        ssl: sslOptions(url, env),
        max: Number(env.DATABASE_POOL_MAX) || 5,
        application_name: env.DATABASE_APPLICATION_NAME || "visual-assist",
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
      });
      // An idle client losing its connection must not crash the process.
      p.on("error", (err) => log.error("store.database_client_error", { location, error: scrub(err.message) }));
      return p;
    }));
  const raw: Queryable = {
    query: async (text, params) => (await getPool()).query(text, params),
    exec: async (sql) => (await getPool()).query(sql),
    end: async () => {
      if (pool) await (await pool).end();
    },
  };
  const db = new PgDatabase(raw, location, secrets);
  return db;
}

const DB_KEY = "__aiukVisualAssistDatabase";

/** Process-wide database for DATABASE_URL (undefined when unset). Shared by the session, config and QA stores. */
export function databaseFromEnv(env: Record<string, string | undefined> = process.env): PgDatabase | undefined {
  const url = env.DATABASE_URL?.trim();
  if (!url) return undefined;
  const g = globalThis as unknown as Record<string, PgDatabase | undefined>;
  return (g[DB_KEY] ??= createPgDatabase(url, env));
}
