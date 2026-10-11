import type { RedactionCount, RedactionType } from "@/lib/domain/types";

/**
 * Transcript PII redaction (docs/06 §3 "redaction where required").
 *
 * Pure and deterministic. Runs on customer and human-agent text before it is
 * stored, so personal data never reaches the transcript, the reasoning model,
 * the agent console or the audit trail. Each removed value is replaced with a
 * marker that says what kind of data was there, e.g. "[card number removed]".
 *
 * Detectors are deliberately conservative where a false positive would damage
 * troubleshooting (router model numbers, speeds, IP addresses, times, dates):
 * - card numbers must pass the Luhn check;
 * - account numbers are only removed when introduced as an account number,
 *   or as a sort code;
 * - phone numbers must look like a UK (0… / +44…) or international (+…) number;
 * - postcodes follow the UK format, including the letters Royal Mail never uses.
 */

export const REDACTION_MARKERS: Record<RedactionType, string> = {
  card_number: "[card number removed]",
  email: "[email removed]",
  phone: "[phone number removed]",
  postcode: "[postcode removed]",
  account_number: "[account number removed]",
};

export const REDACTION_LABELS: Record<RedactionType, string> = {
  card_number: "Card number",
  email: "Email address",
  phone: "Phone number",
  postcode: "Postcode",
  account_number: "Account number",
};

export interface RedactionResult {
  text: string;
  redactions: RedactionCount[];
  /** Total number of values removed. */
  total: number;
}

const ORDER: RedactionType[] = ["email", "card_number", "account_number", "phone", "postcode"];

export function redactPii(input: string): RedactionResult {
  const counts = new Map<RedactionType, number>();
  const bump = (t: RedactionType) => counts.set(t, (counts.get(t) ?? 0) + 1);
  let text = input;
  for (const type of ORDER) text = DETECTORS[type](text, () => bump(type));
  const redactions = ORDER.filter((t) => counts.has(t)).map((type) => ({ type, count: counts.get(type)! }));
  return { text, redactions, total: redactions.reduce((n, r) => n + r.count, 0) };
}

type Detector = (text: string, hit: () => void) => string;

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const redactEmail: Detector = (text, hit) =>
  text.replace(EMAIL, () => {
    hit();
    return REDACTION_MARKERS.email;
  });

// ---------------------------------------------------------------------------
// Payment card numbers (13–19 digits, optional single space/dash separators, Luhn-valid)
// ---------------------------------------------------------------------------

const CARD_CANDIDATE = /(?<!\d|\d\.)\d(?:[ -]?\d){12,18}(?!\d|\.\d)/g;

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const redactCards: Detector = (text, hit) =>
  text.replace(CARD_CANDIDATE, (match) => {
    // A card number may be followed by other digits (e.g. an expiry date); find
    // the longest Luhn-valid prefix of 13–19 digits that ends on a group boundary.
    const digitEnds: number[] = [];
    for (let i = 0; i < match.length; i++) if (/\d/.test(match[i])) digitEnds.push(i + 1);
    const digits = match.replace(/\D/g, "");
    for (let len = Math.min(19, digits.length); len >= 13; len--) {
      const end = digitEnds[len - 1];
      const atBoundary = end === match.length || /[ -]/.test(match[end]);
      if (atBoundary && luhnValid(digits.slice(0, len)) && !/^(\d)\1+$/.test(digits.slice(0, len))) {
        hit();
        return REDACTION_MARKERS.card_number + match.slice(end);
      }
    }
    return match;
  });

// ---------------------------------------------------------------------------
// Account numbers and sort codes (contextual only)
// ---------------------------------------------------------------------------

const ACCOUNT =
  /\b((?:account|acct|a\/c|customer|membership|policy)(?:\s+(?:number|no\.?|num|ref(?:erence)?|id))?(?:\s*(?:is|was|:|#|-))?\s*)(\d(?:[ -]?\d){5,13})(?!\d)/gi;
const SORT_CODE = /\b(sort\s*code(?:\s*(?:is|was|:))?\s*)(\d{2}[ -]?\d{2}[ -]?\d{2})(?!\d)/gi;

const redactAccounts: Detector = (text, hit) =>
  text
    .replace(ACCOUNT, (_m, lead: string) => {
      hit();
      return lead + REDACTION_MARKERS.account_number;
    })
    .replace(SORT_CODE, (_m, lead: string) => {
      hit();
      return lead + REDACTION_MARKERS.account_number;
    });

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

const PHONE_CANDIDATE = /(?<!\w|\d\.)(?:\+|00)?\(?\d[\d ().-]{7,18}\d(?!\w|\.\d)/g;

function isPhone(raw: string): boolean {
  // Dotted forms are IP addresses, versions or dates rather than spoken numbers.
  if (/\d\.\d/.test(raw)) return false;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") || raw.startsWith("00")) {
    const intl = raw.startsWith("00") ? digits.slice(2) : digits;
    if (intl.startsWith("44")) return intl.length >= 11 && intl.length <= 12;
    return intl.length >= 8 && intl.length <= 15;
  }
  const local = raw.replace(/^\(/, "");
  // UK national format: 0 followed by 9–10 digits (01/02/03/05/07/08 ranges).
  return /^0[1235789]/.test(local.replace(/\D/g, "")) && digits.length >= 10 && digits.length <= 11;
}

const redactPhones: Detector = (text, hit) =>
  text.replace(PHONE_CANDIDATE, (match) => {
    const trimmed = match.replace(/[\s.-]+$/, "");
    if (!isPhone(trimmed)) return match;
    hit();
    return REDACTION_MARKERS.phone + match.slice(trimmed.length);
  });

// ---------------------------------------------------------------------------
// UK postcodes
// ---------------------------------------------------------------------------

// Outward code: area (1–2 letters; Q, V, X never first; I, J, Z never second) + district.
// Inward code: digit + two letters, never C, I, K, M, O or V.
const POSTCODE = /\b(?:GIR ?0AA|[A-PR-UWYZ](?:[A-HK-Y]?\d[A-Z\d]?|\d[A-HJKPSTUW]) ?\d[ABD-HJLNP-UW-Z]{2})\b/gi;

const redactPostcodes: Detector = (text, hit) =>
  text.replace(POSTCODE, (match) => {
    // Without a space, require capitals so ordinary words and units ("b4 2pm" is
    // already excluded by the inward-code letters) are not mistaken for postcodes.
    if (!match.includes(" ") && match !== match.toUpperCase()) return match;
    // Storage and frequency units ("PS5 2GB", "band 5 2HZ") share the shape of an inward code.
    if (/^(?:GB|TB|HZ)$/i.test(match.slice(-2))) return match;
    hit();
    return REDACTION_MARKERS.postcode;
  });

const DETECTORS: Record<RedactionType, Detector> = {
  email: redactEmail,
  card_number: redactCards,
  account_number: redactAccounts,
  phone: redactPhones,
  postcode: redactPostcodes,
};
