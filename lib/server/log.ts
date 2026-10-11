/**
 * Structured JSON logger (docs/07 §6, docs/10). One JSON object per line on
 * stdout/stderr so any log shipper can index it. Fields:
 *   ts, level, msg, service, plus correlation ids (requestId, sessionId) and
 *   any extra fields. Errors are flattened to { name, message, stack }.
 *
 * LOG_LEVEL = debug | info | warn | error (default info). LOG_FORMAT=pretty
 * prints a compact human-readable line instead (local development).
 *
 * Never log customer content (transcripts, frames, phone numbers, emails) —
 * log ids and masked values only.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SERVICE = "visual-assist";

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger that adds these fields to every line (e.g. requestId, sessionId). */
  child(fields: LogFields): Logger;
}

type Sink = (level: LogLevel, line: string) => void;

const defaultSink: Sink = (level, line) => {
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

let sink: Sink = defaultSink;

/** Replace the output (tests). Returns a function that restores the default. */
export function setLogSink(next: Sink): () => void {
  sink = next;
  return () => {
    sink = defaultSink;
  };
}

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return ORDER[lvl] ?? ORDER.info;
}

export function serialiseError(e: unknown): LogFields {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack?.split("\n").slice(0, 8).join("\n") };
  return { message: String(e) };
}

function format(level: LogLevel, msg: string, fields: LogFields): string {
  const out: LogFields = { ts: new Date().toISOString(), level, msg, service: SERVICE };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = v instanceof Error || k === "err" ? serialiseError(v) : v;
  }
  if (process.env.LOG_FORMAT === "pretty") {
    const { ts, level: l, msg: m, service: _s, ...rest } = out;
    void _s;
    return `${ts} ${String(l).toUpperCase().padEnd(5)} ${m}${Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""}`;
  }
  try {
    return JSON.stringify(out);
  } catch {
    return JSON.stringify({ ts: out.ts, level, msg, service: SERVICE, note: "unserialisable fields dropped" });
  }
}

function make(base: LogFields): Logger {
  const emit = (level: LogLevel, msg: string, fields: LogFields = {}) => {
    if (ORDER[level] < threshold()) return;
    sink(level, format(level, msg, { ...base, ...fields }));
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (fields) => make({ ...base, ...fields }),
  };
}

export const log: Logger = make({});

/**
 * Logger for one API request. Reuses an inbound `x-request-id` (from a proxy
 * or load balancer) or mints one, and tags lines with the session id when
 * known so every line for a session can be pulled together.
 */
export function requestLogger(request: Request, fields: LogFields = {}): Logger & { requestId: string } {
  const inbound = request.headers.get("x-request-id");
  const requestId = inbound && /^[A-Za-z0-9._:-]{1,100}$/.test(inbound) ? inbound : `req_${globalThis.crypto.randomUUID().slice(0, 12)}`;
  let route: string | undefined;
  try {
    // Customer link tokens are bearer secrets: never write them to logs.
    route = new URL(request.url).pathname.replace(/\/assist\/[^/]+/, "/assist/[token]");
  } catch {
    route = undefined;
  }
  const logger = make({ requestId, method: request.method, route, ...fields });
  return Object.assign(logger, { requestId });
}
