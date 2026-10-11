/**
 * Recipient validation and masking for link delivery. Isomorphic: used by the
 * session launcher form and by the server before anything is sent.
 */

/** E.164: "+" then country code and subscriber number, 8–15 digits, no spaces. */
const E164 = /^\+[1-9]\d{7,14}$/;

/** Deliberately conservative: one "@", a dotted domain, no spaces or angle brackets. */
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** Accepts common formatting ("+44 7700 900123", "+1 (415) 555-0100") and returns E.164, or null. */
export function normalisePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("+")) return null;
  const compact = `+${trimmed.slice(1).replace(/[\s().-]/g, "")}`;
  return E164.test(compact) ? compact : null;
}

export function isE164(value: string): boolean {
  return E164.test(value);
}

export function normaliseEmail(input: string): string | null {
  const v = input.trim();
  if (v.length > 254 || v.includes("..")) return null;
  return EMAIL.test(v) ? v : null;
}

/** "+447700900123" -> "+44•••••••123". Safe for audit records and logs. */
export function maskPhone(e164: string): string {
  if (e164.length <= 6) return "•••";
  return `${e164.slice(0, 3)}${"•".repeat(Math.max(3, e164.length - 6))}${e164.slice(-3)}`;
}

/** "jane.doe@example.com" -> "j•••@example.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

export interface DeliverTo {
  sms?: string;
  email?: string;
}

/** Validate a `deliverTo` request body. Returns normalised recipients or an error message. */
export function parseDeliverTo(raw: unknown): { ok: true; value: DeliverTo | undefined } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "deliverTo must be an object" };
  const r = raw as Record<string, unknown>;
  const out: DeliverTo = {};
  if (r.sms !== undefined && r.sms !== "") {
    if (typeof r.sms !== "string" || r.sms.length > 40) return { ok: false, error: "Phone number must be in international format, e.g. +447700900123" };
    const phone = normalisePhone(r.sms);
    if (!phone) return { ok: false, error: "Phone number must be in international format, e.g. +447700900123" };
    out.sms = phone;
  }
  if (r.email !== undefined && r.email !== "") {
    if (typeof r.email !== "string") return { ok: false, error: "Enter a valid email address" };
    const email = normaliseEmail(r.email);
    if (!email) return { ok: false, error: "Enter a valid email address" };
    out.email = email;
  }
  return { ok: true, value: out.sms || out.email ? out : undefined };
}
