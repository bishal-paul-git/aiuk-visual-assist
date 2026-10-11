import type { SessionState } from "@/lib/domain/session";
import type { AuditEvent, RetentionPolicy } from "@/lib/domain/types";

/**
 * Retention enforcement (docs/06 §2 "retention controls", §3 "support
 * tenant-specific retention").
 *
 * Pure: given session states, each tenant's retention policy and the current
 * time, returns the states with expired data removed plus a record of what was
 * removed. Rules, measured from when the session ended (live sessions are
 * never touched):
 *
 * - Evidence: selected frames are deleted after `evidenceRetentionDays`
 *   (immediately at session end in `live_only` mode). The visual event stays
 *   as structured metadata, its frame reference becomes "purged".
 * - Transcripts: transcript events are deleted after `transcriptRetentionDays`.
 * - Structured metadata (observations, workflow history, actions, audit) is
 *   kept; audit records follow `auditRetentionDays` in the durable store.
 *
 * Every purge appends a `privacy.retention_purged` audit event to the session.
 */

export const PURGED_FRAME_REFERENCE = "purged";
const DAY_MS = 86_400_000;

export interface RetentionPurge {
  sessionId: string;
  tenantId: string;
  framesPurged: number;
  transcriptEventsPurged: number;
}

export interface RetentionRun {
  /** Same object as the input when nothing changed for that session. */
  states: SessionState[];
  purges: RetentionPurge[];
  /** Frame references whose stored bytes must now be deleted by the frame store. */
  frameReferences: string[];
  /** The same frames with their session, for stores that key frames by session. */
  purgedFrames: { sessionId: string; frameReference: string }[];
  ranAt: string;
}

export interface RetentionOptions {
  id?: (prefix: string) => string;
}

/** When a session's retention clock started, or undefined while it is still live. */
export function retentionClockStart(state: SessionState): number | undefined {
  const s = state.session;
  if (s.endedAt) return Date.parse(s.endedAt);
  if (s.status === "completed" || s.status === "failed") return Date.parse(s.createdAt);
  return undefined;
}

export function evidenceRetentionDays(policy: RetentionPolicy): number {
  return policy.evidenceMode === "live_only" ? 0 : policy.evidenceRetentionDays;
}

export function applyRetention(
  states: SessionState[],
  tenantPolicies: Record<string, RetentionPolicy | undefined>,
  now: Date | number,
  options: RetentionOptions = {},
): RetentionRun {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ranAt = new Date(nowMs).toISOString();
  const id = options.id ?? ((p: string) => `${p}_${globalThis.crypto.randomUUID().slice(0, 12)}`);
  const purges: RetentionPurge[] = [];
  const frameReferences: string[] = [];
  const purgedFrames: RetentionRun["purgedFrames"] = [];

  const out = states.map((state) => {
    const policy = tenantPolicies[state.session.tenantId];
    const start = retentionClockStart(state);
    if (!policy || start === undefined || Number.isNaN(start)) return state;
    const ageMs = nowMs - start;
    const evidenceDue = ageMs >= evidenceRetentionDays(policy) * DAY_MS;
    const transcriptDue = ageMs >= policy.transcriptRetentionDays * DAY_MS;

    const framesToPurge = evidenceDue ? state.visualEvents.filter((v) => v.frameReference !== PURGED_FRAME_REFERENCE) : [];
    const transcriptToPurge = transcriptDue ? state.transcript.length : 0;
    if (framesToPurge.length === 0 && transcriptToPurge === 0) return state;

    const next: SessionState = { ...state, seq: state.seq + 1, retention: { ...state.retention } };
    if (framesToPurge.length > 0) {
      const purge = new Set(framesToPurge.map((v) => v.id));
      next.visualEvents = state.visualEvents.map((v) => {
        if (!purge.has(v.id)) return v;
        frameReferences.push(v.frameReference);
        purgedFrames.push({ sessionId: state.session.id, frameReference: v.frameReference });
        return { ...v, frameReference: PURGED_FRAME_REFERENCE, purgedAt: ranAt };
      });
      next.retention!.evidencePurgedAt = ranAt;
      next.retention!.framesPurged = (state.retention?.framesPurged ?? 0) + framesToPurge.length;
    }
    if (transcriptToPurge > 0) {
      next.transcript = [];
      next.retention!.transcriptPurgedAt = ranAt;
      next.retention!.transcriptEventsPurged = (state.retention?.transcriptEventsPurged ?? 0) + transcriptToPurge;
    }
    const event: AuditEvent = {
      id: id("aud"),
      tenantId: state.session.tenantId,
      sessionId: state.session.id,
      actorType: "system",
      actorId: "retention",
      eventType: "privacy.retention_purged",
      payload: {
        framesPurged: framesToPurge.length,
        transcriptEventsPurged: transcriptToPurge,
        evidenceMode: policy.evidenceMode,
        evidenceRetentionDays: evidenceRetentionDays(policy),
        transcriptRetentionDays: policy.transcriptRetentionDays,
      },
      timestamp: ranAt,
    };
    next.audit = [...state.audit, event];
    purges.push({ sessionId: state.session.id, tenantId: state.session.tenantId, framesPurged: framesToPurge.length, transcriptEventsPurged: transcriptToPurge });
    return next;
  });

  return { states: out, purges, frameReferences, purgedFrames, ranAt };
}
