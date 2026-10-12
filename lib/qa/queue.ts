import type { SessionState } from "@/lib/domain/session";
import { reviewStatus, type QaReview, type ReviewStatus } from "./reviews";
import { sampleReasons, type SampleReason, type SamplingConfig } from "./sampling";

export interface QueueItem {
  state: SessionState;
  reasons: SampleReason[];
  review?: QaReview;
  status: ReviewStatus;
}

/**
 * The review queue: every sampled completed session, plus any session that
 * already has a review record (so a claim or verdict never disappears when
 * the sampling rate changes). Newest first.
 */
export function buildQueue(states: SessionState[], reviews: QaReview[], config: SamplingConfig): QueueItem[] {
  const bySession = new Map(reviews.map((r) => [r.sessionId, r]));
  const items: QueueItem[] = [];
  for (const state of states) {
    const review = bySession.get(state.session.id);
    const reasons = sampleReasons(state, config);
    if (!reasons.length && !review) continue;
    items.push({ state, reasons: reasons.length ? reasons : (review?.sampleReasons ?? []), review, status: reviewStatus(review) });
  }
  return items.sort(
    (a, b) => (b.state.session.endedAt ?? b.state.session.createdAt).localeCompare(a.state.session.endedAt ?? a.state.session.createdAt) || a.state.session.id.localeCompare(b.state.session.id),
  );
}

export function queueCounts(items: QueueItem[]): Record<ReviewStatus, number> {
  const counts: Record<ReviewStatus, number> = { queued: 0, in_review: 0, completed: 0 };
  for (const i of items) counts[i.status] += 1;
  return counts;
}
