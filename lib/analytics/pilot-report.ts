import type { SessionState } from "@/lib/domain/session";
import { AUTOMATED_CHECK_LABEL, OUTCOME_LABELS, ESCALATION_REASON_LABELS } from "@/lib/domain/labels";
import { csvLine } from "@/lib/audit/export";

/**
 * Pilot report: what a client needs to judge the pilot (and what we invoice
 * on). Only real customer sessions: guided examples and the automated
 * production check are left out.
 */
export function reportStates(states: SessionState[]): SessionState[] {
  return states.filter((s) => !s.session.scenario && s.session.customerLabel !== AUTOMATED_CHECK_LABEL);
}

export interface RatingStats {
  rated: number;
  up: number;
  down: number;
  /** Share of ratings that were thumbs up (0–1); 0 when none. */
  positiveRate: number;
  comments: { reference: string; comment: string; at: string }[];
}

export function ratingStats(states: SessionState[]): RatingStats {
  const rated = states.filter((s) => s.rating);
  const up = rated.filter((s) => s.rating!.score === "up").length;
  return {
    rated: rated.length,
    up,
    down: rated.length - up,
    positiveRate: rated.length ? up / rated.length : 0,
    comments: rated
      .filter((s) => s.rating!.comment)
      .map((s) => ({ reference: s.session.reference, comment: s.rating!.comment!, at: s.rating!.at }))
      .sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export function costPerSession(states: SessionState[]): number {
  return states.length ? states.reduce((t, s) => t + (s.session.costTotal ?? 0), 0) / states.length : 0;
}

const HEADERS = [
  "Reference",
  "Started",
  "Ended",
  "Duration (seconds)",
  "Outcome",
  "A person helped",
  "Why a person was needed",
  "Photos checked",
  "Customer rating",
  "Customer comment",
  "AI and voice cost (GBP)",
] as const;

function seconds(from?: string, to?: string): string {
  if (!from || !to) return "";
  return String(Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000)));
}

export function reportCsv(states: SessionState[]): string {
  const lines = [csvLine(HEADERS)];
  const sorted = [...states].sort((a, b) => a.session.createdAt.localeCompare(b.session.createdAt));
  for (const s of sorted) {
    const human = s.participants.some((p) => p.type === "human_agent");
    lines.push(
      csvLine([
        s.session.reference,
        s.session.startedAt ?? s.session.createdAt,
        s.session.endedAt ?? "",
        seconds(s.session.startedAt, s.session.endedAt),
        s.session.outcome ? OUTCOME_LABELS[s.session.outcome] : s.session.status,
        human ? "Yes" : "No",
        s.escalation ? ESCALATION_REASON_LABELS[s.escalation.reason] : "",
        s.visualEvents.length,
        s.rating ? (s.rating.score === "up" ? "Helpful" : "Not helpful") : "",
        s.rating?.comment ?? "",
        (s.session.costTotal ?? 0).toFixed(4),
      ]),
    );
  }
  return "\uFEFF" + lines.join("");
}
