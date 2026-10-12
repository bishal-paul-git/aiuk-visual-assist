import type { SessionState } from "@/lib/domain/session";
import type { QaReview } from "./reviews";

/**
 * Confidence calibration (docs/05 §7 "uncertainty calibration").
 *
 * A point is one reading the AI committed to (an observation with a value),
 * its reported confidence, and whether it was right. Readings where the AI
 * declined to give a value (unreadable, uncertain, not visible) carry no
 * claim to be right or wrong, so they are left out.
 *
 * Expected calibration error (ECE) is the count-weighted mean, over confidence
 * bins, of |accuracy − mean reported confidence|. 0 is perfectly calibrated.
 */

export interface CalibrationPoint {
  confidence: number;
  correct: boolean;
}

export interface CalibrationBin {
  lower: number;
  upper: number;
  label: string;
  count: number;
  meanConfidence?: number;
  accuracy?: number;
  /** accuracy − meanConfidence: negative means over-confident. */
  gap?: number;
}

/** Ten equal-width bins (the usual ECE convention). */
export const TEN_BINS = Array.from({ length: 11 }, (_, i) => i / 10);
/** The confidence bands used across the QA pages. */
export const QA_BAND_EDGES = [0, 0.5, 0.75, 0.85, 1];

function bandLabel(lower: number, upper: number, last: boolean): string {
  const p = (n: number) => Math.round(n * 100);
  if (lower === 0) return `< ${p(upper)}%`;
  if (last && upper >= 1) return `≥ ${p(lower)}%`;
  return `${p(lower)}–${p(upper) - 1}%`;
}

export function calibrationBins(points: CalibrationPoint[], edges: number[] = TEN_BINS): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lower = edges[i];
    const upper = edges[i + 1];
    const last = i === edges.length - 2;
    const inBin = points.filter((p) => {
      const c = Math.min(1, Math.max(0, p.confidence));
      return c >= lower && (last ? c <= upper : c < upper);
    });
    const count = inBin.length;
    const bin: CalibrationBin = { lower, upper, label: bandLabel(lower, upper, last), count };
    if (count) {
      bin.meanConfidence = inBin.reduce((s, p) => s + Math.min(1, Math.max(0, p.confidence)), 0) / count;
      bin.accuracy = inBin.filter((p) => p.correct).length / count;
      bin.gap = bin.accuracy - bin.meanConfidence;
    }
    bins.push(bin);
  }
  return bins;
}

/** ECE over the given bin edges; undefined when there are no points. */
export function expectedCalibrationError(points: CalibrationPoint[], edges: number[] = TEN_BINS): number | undefined {
  if (points.length === 0) return undefined;
  return calibrationBins(points, edges).reduce((s, b) => s + (b.count ? (b.count / points.length) * Math.abs(b.gap!) : 0), 0);
}

export interface CalibrationReport {
  points: number;
  fromQaReviews: number;
  fromConsoleReviews: number;
  bins: CalibrationBin[];
  ece?: number;
  accuracy?: number;
  meanConfidence?: number;
}

/**
 * Reported confidence against human-confirmed accuracy. Uses QA review
 * verdicts first; an agent's confirm/reject in the console counts for
 * observations no QA reviewer has judged.
 */
export function reviewCalibration(states: SessionState[], reviews: QaReview[], edges: number[] = QA_BAND_EDGES): CalibrationReport {
  const points: CalibrationPoint[] = [];
  const judged = new Set<string>();
  let fromQaReviews = 0;
  let fromConsoleReviews = 0;
  for (const r of reviews) {
    if (r.status !== "completed") continue;
    for (const v of r.verdicts) {
      judged.add(v.observationId);
      if (!v.aiValue) continue;
      points.push({ confidence: v.aiConfidence, correct: v.verdict === "correct" });
      fromQaReviews += 1;
    }
  }
  for (const st of states)
    for (const o of st.observations) {
      if (!o.humanReview || !o.value || judged.has(o.id)) continue;
      points.push({ confidence: o.confidence, correct: o.humanReview.verdict === "confirmed" });
      fromConsoleReviews += 1;
    }
  return {
    points: points.length,
    fromQaReviews,
    fromConsoleReviews,
    bins: calibrationBins(points, edges),
    ece: expectedCalibrationError(points, edges),
    accuracy: points.length ? points.filter((p) => p.correct).length / points.length : undefined,
    meanConfidence: points.length ? points.reduce((s, p) => s + p.confidence, 0) / points.length : undefined,
  };
}
