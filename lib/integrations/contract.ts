import type { ToolCallOutcome } from "@/lib/domain/types";
import { redactPii } from "@/lib/privacy/redact";

/**
 * The client integration contract (docs/INTEGRATION-CONTRACT.md).
 *
 * Isomorphic and dependency-free: the session runtime (server and browser)
 * imports ToolCallError from here, and the reference client API mirrors these
 * shapes. Signing lives in ./signing.ts (server only).
 */

export const CONTRACT_VERSION = "2026-10-01";

/** Headers the platform sends with every call. */
export const HEADERS = {
  idempotencyKey: "Idempotency-Key",
  timestamp: "X-VA-Timestamp",
  signature: "X-VA-Signature",
  contractVersion: "X-VA-Contract-Version",
  /** Sent only when a connector sets `secretHeader: true`, for receivers that cannot verify HMAC (e.g. an n8n webhook's Header Auth). */
  secret: "X-VA-Secret",
} as const;

/** Body the platform POSTs to the client's endpoint for one tool call. */
export interface ToolCallRequest {
  tool: string;
  params: Record<string, unknown>;
  sessionId: string;
  actionId: string;
  tenantId: string;
  requestedBy: "ai" | "human";
}

/** Body the client returns (HTTP 2xx). */
export interface ToolCallResponse {
  status: "succeeded" | "failed";
  result: Record<string, unknown>;
  externalRef?: string;
}

/** A failed tool call that still carries an audit-safe outcome. */
export class ToolCallError extends Error {
  constructor(
    message: string,
    readonly outcome: ToolCallOutcome,
  ) {
    super(message);
    this.name = "ToolCallError";
  }
}

// ---------------------------------------------------------------------------
// Per-tool result fields. Only these become workflow tool facts
// (`<tool>.<field>`, e.g. line_test.status); anything else is dropped.
// ---------------------------------------------------------------------------

type FieldSpec =
  | { type: "string"; required?: boolean; values?: readonly string[] }
  | { type: "number"; required?: boolean }
  | { type: "boolean"; required?: boolean };

export const TOOL_RESULT_FIELDS: Record<string, Record<string, FieldSpec>> = {
  line_test: {
    status: { type: "string", required: true, values: ["fault_detected", "no_fault"] },
    detail: { type: "string" },
    testId: { type: "string" },
  },
  update_case: { caseId: { type: "string", required: true }, status: { type: "string" } },
  create_ticket: { ticketId: { type: "string", required: true }, queue: { type: "string" } },
  book_engineer: { jobId: { type: "string", required: true }, slot: { type: "string", required: true } },
  send_sms_summary: { messageId: { type: "string", required: true }, delivered: { type: "boolean" } },
  order_replacement_router: { orderId: { type: "string", required: true }, dispatch: { type: "string" } },
  issue_account_credit: { creditId: { type: "string", required: true }, amount: { type: "string" } },
  attach_claim_evidence: { claimId: { type: "string", required: true }, attachmentId: { type: "string" } },
};

const MAX_STRING = 200;
const MAX_GENERIC_FIELDS = 12;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const EXTERNAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:\/#-]{0,127}$/;
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,64}$/;

export type ValidatedResponse =
  | { ok: true; status: "succeeded"; result: Record<string, string | number | boolean>; externalRef?: string }
  | { ok: true; status: "failed"; code?: string; externalRef?: string }
  | { ok: false; reason: string };

/** Free text from a client system passes the same PII redaction as transcripts before it is stored or audited. */
function cleanString(v: string): string {
  return redactPii(v.slice(0, MAX_STRING)).text;
}

/**
 * Validate a client response body against the contract and the tool's result
 * fields. Returns only whitelisted, primitive, redacted values.
 */
export function validateToolResponse(tool: string, body: unknown): ValidatedResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "body is not a JSON object" };
  const b = body as Record<string, unknown>;
  if (b.status !== "succeeded" && b.status !== "failed") return { ok: false, reason: 'status must be "succeeded" or "failed"' };
  const result = b.result ?? {};
  if (typeof result !== "object" || result === null || Array.isArray(result)) return { ok: false, reason: "result must be an object" };
  let externalRef: string | undefined;
  if (b.externalRef !== undefined && b.externalRef !== null) {
    if (typeof b.externalRef !== "string" || !EXTERNAL_REF.test(b.externalRef)) return { ok: false, reason: "externalRef must be a short reference string" };
    externalRef = b.externalRef;
  }
  const r = result as Record<string, unknown>;

  if (b.status === "failed") {
    const code = typeof r.code === "string" && ERROR_CODE.test(r.code) ? r.code : undefined;
    return { ok: true, status: "failed", code, externalRef };
  }

  const spec = TOOL_RESULT_FIELDS[tool];
  const out: Record<string, string | number | boolean> = {};
  if (spec) {
    for (const [name, f] of Object.entries(spec)) {
      const v = r[name];
      if (v === undefined || v === null) {
        if (f.required) return { ok: false, reason: `result.${name} is required` };
        continue;
      }
      if (f.type === "string") {
        // Numbers are accepted for string fields (amounts, numeric ids).
        if (typeof v !== "string" && typeof v !== "number") return { ok: false, reason: `result.${name} must be a string` };
        const s = String(v);
        if (f.values && !f.values.includes(s)) return { ok: false, reason: `result.${name} must be one of ${f.values.join(", ")}` };
        if (f.required && !s.trim()) return { ok: false, reason: `result.${name} is required` };
        out[name] = f.values ? s : cleanString(s);
      } else if (typeof v !== f.type) {
        return { ok: false, reason: `result.${name} must be a ${f.type}` };
      } else {
        out[name] = v as number | boolean;
      }
    }
  } else {
    // Tools without a declared result shape: a few primitive fields only.
    for (const [name, v] of Object.entries(r)) {
      if (Object.keys(out).length >= MAX_GENERIC_FIELDS) break;
      if (!FIELD_NAME.test(name)) continue;
      if (typeof v === "string") out[name] = cleanString(v);
      else if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean") out[name] = v;
    }
  }
  return { ok: true, status: "succeeded", result: out, externalRef };
}

/** Workflow facts a tool result produces, as the orchestrator records them. */
export function toolFactsFor(tool: string, result: Record<string, string | number | boolean>): Record<string, string> {
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [`${tool}.${k}`, String(v)]));
}
