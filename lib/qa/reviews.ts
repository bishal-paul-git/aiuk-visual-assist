import type { SessionState } from "@/lib/domain/session";
import type { EscalationReasonCode, ISODateString, ObservationStatus, SessionOutcome } from "@/lib/domain/types";
import { isCompleted, type SampleReason } from "./sampling";

/**
 * Human QA review of sampled sessions (docs/08 §2, docs/05 §7).
 *
 * Lifecycle: queued (sampled, no record yet) → in_review (claimed by one
 * reviewer) → completed (verdicts submitted). A reviewer can never review a
 * session they handled as the agent. Pure and isomorphic: the functions below
 * mutate the `reviews` array they are given and throw `QaReviewError` with an
 * HTTP-style status when a rule is broken. The caller records audit events.
 */

export type ReviewStatus = "queued" | "in_review" | "completed";
export type ObservationVerdictValue = "correct" | "incorrect";
export type ExpectedOutcome = "resolve_with_ai" | "escalate_to_human" | "other";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { queued: "Queued", in_review: "In review", completed: "Completed" };
export const EXPECTED_OUTCOME_LABELS: Record<ExpectedOutcome, string> = {
  resolve_with_ai: "The AI should have resolved it",
  escalate_to_human: "It should have gone to a person",
  other: "A different outcome (see notes)",
};

export const SCORE_KEYS = ["accuracy", "policyAdherence", "customerExperience"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
export const SCORE_LABELS: Record<ScoreKey, { label: string; hint: string }> = {
  accuracy: { label: "Accuracy", hint: "Were the AI's readings of the evidence right?" },
  policyAdherence: { label: "Policy adherence", hint: "Did the session follow the workflow and policy?" },
  customerExperience: { label: "Customer experience", hint: "Was it clear, quick and courteous for the customer?" },
};

export interface ObservationVerdict {
  observationId: string;
  visualEventId: string;
  observationType: string;
  /** What the AI reported, copied at review time so the record stands alone. */
  aiValue?: string;
  aiStatus: ObservationStatus;
  aiConfidence: number;
  verdict: ObservationVerdictValue;
  /** For an incorrect reading: the value actually shown, or null when it cannot be determined from the frame. */
  correctedValue?: string | null;
}

export interface QaReview {
  id: string;
  sessionId: string;
  tenantId: string;
  reference: string;
  status: Exclude<ReviewStatus, "queued">;
  sampleReasons: SampleReason[];
  reviewerId: string;
  reviewerName: string;
  claimedAt: ISODateString;
  submittedAt?: ISODateString;
  updatedAt: ISODateString;
  /** Session result as it stood when reviewed. */
  sessionOutcome?: SessionOutcome;
  escalationReason?: EscalationReasonCode;
  verdicts: ObservationVerdict[];
  outcome?: { correct: boolean; expected?: ExpectedOutcome };
  scores?: Record<ScoreKey, number>;
  notes?: string;
}

export interface Reviewer {
  id: string;
  name: string;
}

export class QaReviewError extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 422,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

/** Value used by forms for "cannot be determined from this frame". */
export const UNDETERMINED = "__undetermined";

/** Users who worked the session as a human agent or supervisor. */
export function sessionHandlers(st: SessionState): Set<string> {
  const ids = new Set<string>();
  for (const p of st.participants) if ((p.type === "human_agent" || p.type === "supervisor") && p.userId) ids.add(p.userId);
  if (st.escalation?.assignedUserId) ids.add(st.escalation.assignedUserId);
  for (const n of st.notes) ids.add(n.authorId);
  for (const o of st.observations) if (o.humanReview) ids.add(o.humanReview.userId);
  for (const a of st.audit) if (a.actorType === "human_agent" && !a.eventType.startsWith("qa.")) ids.add(a.actorId);
  return ids;
}

export function reviewFor(reviews: QaReview[], sessionId: string): QaReview | undefined {
  return reviews.find((r) => r.sessionId === sessionId);
}

export function reviewStatus(review: QaReview | undefined): ReviewStatus {
  return review?.status ?? "queued";
}

/** Why `reviewer` may not claim this session, or undefined when they may. */
export function claimBlocker(st: SessionState, reviewer: Reviewer, reviews: QaReview[], reasons: SampleReason[]): QaReviewError | undefined {
  const existing = reviewFor(reviews, st.session.id);
  if (!isCompleted(st)) return new QaReviewError(409, "Only completed sessions can be reviewed.");
  if (!existing && reasons.length === 0) return new QaReviewError(409, "This session is not in the review sample.");
  if (sessionHandlers(st).has(reviewer.id)) return new QaReviewError(403, "You handled this session as the agent, so another reviewer must review it.");
  if (existing?.status === "completed") return new QaReviewError(409, `Already reviewed by ${existing.reviewerName}.`);
  if (existing?.status === "in_review" && existing.reviewerId !== reviewer.id) return new QaReviewError(409, `Already claimed by ${existing.reviewerName}.`);
  return undefined;
}

/** Claim a queued session. Claiming your own in-review session again returns it unchanged. */
export function claimReview(
  reviews: QaReview[],
  input: { state: SessionState; reviewer: Reviewer; reasons: SampleReason[]; now: ISODateString; id: string },
): { review: QaReview; created: boolean } {
  const { state: st, reviewer } = input;
  const blocker = claimBlocker(st, reviewer, reviews, input.reasons);
  if (blocker) throw blocker;
  const existing = reviewFor(reviews, st.session.id);
  if (existing) return { review: existing, created: false };
  const review: QaReview = {
    id: input.id,
    sessionId: st.session.id,
    tenantId: st.session.tenantId,
    reference: st.session.reference,
    status: "in_review",
    sampleReasons: [...input.reasons],
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    claimedAt: input.now,
    updatedAt: input.now,
    sessionOutcome: st.session.outcome,
    escalationReason: st.escalation?.reason ?? st.session.escalationReason,
    verdicts: [],
  };
  reviews.push(review);
  return { review, created: true };
}

/** Return a claimed session to the queue. Only the reviewer who claimed it can release it. */
export function releaseReview(reviews: QaReview[], sessionId: string, reviewer: Reviewer): QaReview {
  const existing = mustOwnInReview(reviews, sessionId, reviewer);
  reviews.splice(reviews.indexOf(existing), 1);
  return existing;
}

function mustOwnInReview(reviews: QaReview[], sessionId: string, reviewer: Reviewer): QaReview {
  const existing = reviewFor(reviews, sessionId);
  if (!existing) throw new QaReviewError(409, "Claim this session before reviewing it.");
  if (existing.status === "completed") throw new QaReviewError(409, "This review has already been submitted.");
  if (existing.reviewerId !== reviewer.id) throw new QaReviewError(403, `This session is claimed by ${existing.reviewerName}.`);
  return existing;
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export interface ReviewSubmission {
  verdicts: { observationId: string; verdict: ObservationVerdictValue; correctedValue?: string | null }[];
  outcome: { correct: boolean; expected?: ExpectedOutcome };
  scores: Record<ScoreKey, number>;
  notes?: string;
}

export type Vocabulary = Record<string, { values: string[] }> | undefined;

export const MAX_NOTES = 2000;

/**
 * Validate an untrusted submission against the session: a verdict for every
 * observation, corrected values from the workflow vocabulary, an expected
 * outcome when the outcome was wrong, and whole-number scores from 1 to 5.
 */
export function validateSubmission(raw: unknown, st: SessionState, vocabulary: Vocabulary): { ok: true; value: ReviewSubmission } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const rawVerdicts = Array.isArray(body.verdicts) ? body.verdicts : null;
  if (!rawVerdicts) errors.push("Verdicts are missing.");
  const verdicts: ReviewSubmission["verdicts"] = [];
  const seen = new Set<string>();
  const byId = new Map(st.observations.map((o) => [o.id, o]));
  for (const item of rawVerdicts ?? []) {
    const v = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const id = typeof v.observationId === "string" ? v.observationId : "";
    const o = byId.get(id);
    if (!o) {
      errors.push(`Unknown observation "${id.slice(0, 40)}".`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`More than one verdict for "${o.observationText}".`);
      continue;
    }
    seen.add(id);
    if (v.verdict !== "correct" && v.verdict !== "incorrect") {
      errors.push(`Choose correct or incorrect for "${o.observationText}".`);
      continue;
    }
    if (v.verdict === "correct") {
      if (v.correctedValue !== undefined && v.correctedValue !== null && v.correctedValue !== "") errors.push(`"${o.observationText}" is marked correct, so it cannot have a corrected value.`);
      verdicts.push({ observationId: id, verdict: "correct" });
      continue;
    }
    const allowed = vocabulary?.[o.observationType]?.values;
    let corrected: string | null | undefined;
    if (v.correctedValue === null || v.correctedValue === UNDETERMINED) corrected = null;
    else if (typeof v.correctedValue === "string" && v.correctedValue.trim()) corrected = v.correctedValue.trim();
    if (allowed) {
      if (corrected === undefined) errors.push(`Give the correct value for "${o.observationText}".`);
      else if (corrected !== null && !allowed.includes(corrected)) errors.push(`"${corrected}" is not an allowed value for ${o.observationType} (allowed: ${allowed.join(", ")}).`);
    } else if (typeof corrected === "string" && corrected.length > 80) {
      errors.push(`The corrected value for "${o.observationText}" is too long.`);
    }
    if (corrected !== undefined && corrected !== null && corrected === o.value) errors.push(`The corrected value for "${o.observationText}" is the same as the AI's value.`);
    if (corrected === null && !o.value) errors.push(`"${o.observationText}" already says it could not be read; mark it correct, or give the value that was visible.`);
    verdicts.push({ observationId: id, verdict: "incorrect", correctedValue: corrected });
  }
  const missing = st.observations.filter((o) => !seen.has(o.id));
  if (rawVerdicts && missing.length) errors.push(`${missing.length} observation(s) still need a verdict.`);

  const rawOutcome = (body.outcome && typeof body.outcome === "object" ? body.outcome : null) as Record<string, unknown> | null;
  let outcome: ReviewSubmission["outcome"] = { correct: true };
  if (!rawOutcome || typeof rawOutcome.correct !== "boolean") {
    errors.push("Say whether the session outcome was right.");
  } else if (rawOutcome.correct) {
    outcome = { correct: true };
  } else {
    const expected = rawOutcome.expected;
    if (expected !== "resolve_with_ai" && expected !== "escalate_to_human" && expected !== "other") errors.push("Say what should have happened instead.");
    else outcome = { correct: false, expected };
  }

  const rawScores = (body.scores && typeof body.scores === "object" ? body.scores : {}) as Record<string, unknown>;
  const scores = {} as Record<ScoreKey, number>;
  for (const k of SCORE_KEYS) {
    const n = rawScores[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 5) errors.push(`${SCORE_LABELS[k].label} must be a whole number from 1 to 5.`);
    else scores[k] = n;
  }

  let notes: string | undefined;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") errors.push("Notes must be text.");
    else if (body.notes.length > MAX_NOTES) errors.push(`Notes must be ${MAX_NOTES} characters or fewer.`);
    else notes = body.notes.trim() || undefined;
  }
  if (!outcome.correct && outcome.expected === "other" && !notes) errors.push("Add a note explaining what should have happened.");

  return errors.length ? { ok: false, errors } : { ok: true, value: { verdicts, outcome, scores, notes } };
}

/** Submit verdicts for a session the reviewer has claimed. */
export function submitReview(reviews: QaReview[], input: { state: SessionState; reviewer: Reviewer; body: unknown; vocabulary: Vocabulary; now: ISODateString }): QaReview {
  const { state: st } = input;
  const review = mustOwnInReview(reviews, st.session.id, input.reviewer);
  const result = validateSubmission(input.body, st, input.vocabulary);
  if (!result.ok) throw new QaReviewError(422, "The review is incomplete.", result.errors);
  const obs = new Map(st.observations.map((o) => [o.id, o]));
  review.verdicts = result.value.verdicts.map((v) => {
    const o = obs.get(v.observationId)!;
    return {
      observationId: o.id,
      visualEventId: o.visualEventId,
      observationType: o.observationType,
      aiValue: o.value,
      aiStatus: o.status,
      aiConfidence: o.confidence,
      verdict: v.verdict,
      ...(v.verdict === "incorrect" ? { correctedValue: v.correctedValue ?? null } : {}),
    };
  });
  review.outcome = result.value.outcome;
  review.scores = result.value.scores;
  review.notes = result.value.notes;
  review.status = "completed";
  review.submittedAt = input.now;
  review.updatedAt = input.now;
  review.sessionOutcome = st.session.outcome;
  return review;
}

/** Share of a completed review's verdicts that were correct (undefined when there were none). */
export function verdictAccuracy(review: QaReview): number | undefined {
  return review.verdicts.length ? review.verdicts.filter((v) => v.verdict === "correct").length / review.verdicts.length : undefined;
}
