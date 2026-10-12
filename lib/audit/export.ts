import type { SessionState } from "@/lib/domain/session";
import type { AuditEvent } from "@/lib/domain/types";
import { tenantName } from "@/lib/config/catalog";
import { filterByScope, type DataScope } from "@/lib/auth/scope";
import { ACTOR_LABELS, EVENT_CATEGORIES, actorName, eventCategory, type EventCategory } from "@/components/platform/audit-format";

/**
 * Audit records across the three trails (docs/04 §3, docs/06 §7):
 * - session: every domain event on a session,
 * - config: workflow and policy version changes (no session),
 * - security: sign-in, sign-out, permission denials and audit exports (no session).
 *
 * Pure: shared by the audit explorer page and the export API, and unit-tested.
 */

export type AuditSource = "session" | "config" | "security";

export interface AuditRecord {
  event: AuditEvent;
  source: AuditSource;
  /** Empty for configuration and security events. */
  sessionId: string;
  /** Session reference, "key vN" for configuration, or "Access" / "Export". */
  reference: string;
  tenantId: string;
}

export function collectAuditRecords(input: { states: readonly SessionState[]; configEvents: readonly AuditEvent[]; securityEvents: readonly AuditEvent[] }): AuditRecord[] {
  const rows: AuditRecord[] = input.configEvents.map((event) => ({
    event,
    source: "config",
    sessionId: "",
    reference: `${String(event.payload.key)} v${String(event.payload.version)}`,
    tenantId: event.tenantId,
  }));
  for (const event of input.securityEvents)
    rows.push({ event, source: "security", sessionId: "", reference: event.eventType === "audit.exported" ? "Export" : "Access", tenantId: event.tenantId });
  for (const st of input.states)
    for (const event of st.audit)
      rows.push({ event, source: "session", sessionId: st.session.id, reference: st.session.reference, tenantId: event.tenantId || st.session.tenantId });
  return rows.sort((a, b) => b.event.timestamp.localeCompare(a.event.timestamp) || b.event.id.localeCompare(a.event.id));
}

export interface AuditQuery {
  /** Inclusive lower bound. */
  from?: Date;
  /** Exclusive upper bound. */
  to?: Date;
  tenantId?: string;
  category?: EventCategory;
}

/**
 * Apply the user's scope first (a client-scoped user never sees another
 * client's or the platform's own records), then the requested filters.
 */
export function filterAuditRecords(records: readonly AuditRecord[], scope: DataScope, q: AuditQuery = {}): AuditRecord[] {
  const from = q.from?.getTime();
  const to = q.to?.getTime();
  return filterByScope(scope, records).filter((r) => {
    if (q.tenantId && r.tenantId !== q.tenantId) return false;
    if (q.category && eventCategory(r.event.eventType) !== q.category) return false;
    if (from !== undefined || to !== undefined) {
      const t = Date.parse(r.event.timestamp);
      if (from !== undefined && t < from) return false;
      if (to !== undefined && t >= to) return false;
    }
    return true;
  });
}

export type ExportFormat = "csv" | "json";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse `from` / `to`: a date (YYYY-MM-DD, UTC; `to` includes that whole day) or a full ISO timestamp. */
function parseBound(value: string, end: boolean): Date | null {
  if (DATE_ONLY.test(value)) {
    const t = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isNaN(t) ? null : new Date(end ? t + DAY_MS : t);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

export type ParsedExportQuery = { ok: true; format: ExportFormat; query: AuditQuery } | { ok: false; error: string };

/** Validate the export query string. Unknown values are rejected rather than ignored, so an export is never silently wider than asked. */
export function parseExportQuery(params: URLSearchParams): ParsedExportQuery {
  const format = (params.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "json") return { ok: false, error: "format must be csv or json" };
  const query: AuditQuery = {};
  const from = params.get("from")?.trim();
  const to = params.get("to")?.trim();
  if (from) {
    const d = parseBound(from, false);
    if (!d) return { ok: false, error: "from must be a date (YYYY-MM-DD) or ISO timestamp" };
    query.from = d;
  }
  if (to) {
    const d = parseBound(to, true);
    if (!d) return { ok: false, error: "to must be a date (YYYY-MM-DD) or ISO timestamp" };
    query.to = d;
  }
  if (query.from && query.to && query.from.getTime() >= query.to.getTime()) return { ok: false, error: "from must be before to" };
  const tenantId = params.get("tenantId")?.trim();
  if (tenantId) {
    if (tenantId.length > 100) return { ok: false, error: "tenantId is too long" };
    query.tenantId = tenantId;
  }
  const category = params.get("category")?.trim();
  if (category) {
    if (!(EVENT_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: `category must be one of: ${EVENT_CATEGORIES.join(", ")}` };
    query.category = category as EventCategory;
  }
  return { ok: true, format, query };
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180)

/** Leading characters that make spreadsheet apps evaluate a cell as a formula (OWASP CSV injection). */
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * One CSV field: neutralise formula injection by prefixing an apostrophe to
 * any value starting with = + - @ (or tab / carriage return), then quote per
 * RFC 4180 when the value contains a comma, quote or line break.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (s.length > 0 && FORMULA_TRIGGERS.has(s[0])) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV record, CRLF-terminated (RFC 4180 §2). */
export function csvLine(cells: readonly unknown[]): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}

export const AUDIT_CSV_COLUMNS = [
  "timestamp",
  "event_id",
  "event_type",
  "category",
  "source",
  "tenant_id",
  "client",
  "session_id",
  "reference",
  "actor_type",
  "actor_id",
  "actor_name",
  "workflow_version",
  "policy_version",
  "model_version",
  "prompt_version",
  "payload",
] as const;

export function auditRecordCells(r: AuditRecord): unknown[] {
  const e = r.event;
  return [
    e.timestamp,
    e.id,
    e.eventType,
    eventCategory(e.eventType) ?? "",
    r.source,
    r.tenantId,
    tenantName(r.tenantId),
    r.sessionId,
    r.reference,
    ACTOR_LABELS[e.actorType] ?? e.actorType,
    e.actorId,
    actorName(e.actorType, e.actorId),
    e.context?.workflowVersion,
    e.context?.policyVersion,
    e.context?.modelVersion,
    e.context?.promptVersion,
    JSON.stringify(e.payload ?? {}),
  ];
}

/** The CSV as a sequence of chunks (header first), so large exports stream instead of being built in memory. */
export function* auditCsvChunks(records: readonly AuditRecord[], batchSize = 250): Generator<string> {
  yield csvLine(AUDIT_CSV_COLUMNS);
  for (let i = 0; i < records.length; i += batchSize) {
    let chunk = "";
    for (const r of records.slice(i, i + batchSize)) chunk += csvLine(auditRecordCells(r));
    yield chunk;
  }
}

/** JSON shape of one exported record. */
export function auditRecordJson(r: AuditRecord) {
  return {
    ...r.event,
    category: eventCategory(r.event.eventType) ?? null,
    source: r.source,
    tenantId: r.tenantId,
    client: tenantName(r.tenantId),
    sessionId: r.sessionId || null,
    reference: r.reference,
    actorName: actorName(r.event.actorType, r.event.actorId),
  };
}
