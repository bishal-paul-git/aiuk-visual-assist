import { describe, expect, it } from "vitest";
import { applyRetention, PURGED_FRAME_REFERENCE, retentionClockStart } from "@/lib/privacy/retention";
import type { SessionState } from "@/lib/domain/session";
import type { RetentionPolicy } from "@/lib/domain/types";
import { SessionRuntime } from "@/lib/server/runtime";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { routerHarness } from "./helpers";

const DAY = 86_400_000;

/** A finished router session (transcript + selected evidence), ended at `endedAt`. */
function endedSession(id: string, tenantId: string, endedAt: string): SessionState {
  const h = routerHarness("power_cycle_fix");
  h.runCustomer();
  h.send({ type: "session.end" });
  const s = structuredClone(h.state);
  s.session.id = id;
  s.session.tenantId = tenantId;
  s.session.endedAt = endedAt;
  return s;
}

const policies: Record<string, RetentionPolicy> = {
  tnt_a: { evidenceMode: "retained_evidence", evidenceRetentionDays: 30, transcriptRetentionDays: 90, auditRetentionDays: 730 },
  tnt_live: { evidenceMode: "live_only", evidenceRetentionDays: 30, transcriptRetentionDays: 7, auditRetentionDays: 730 },
};

const END = "2026-08-01T12:00:00.000Z";
const at = (days: number) => Date.parse(END) + days * DAY;
let n = 0;
const id = (p: string) => `${p}_${++n}`;

describe("applyRetention", () => {
  it("keeps everything inside the retention periods", () => {
    const s = endedSession("ses_1", "tnt_a", END);
    const run = applyRetention([s], policies, at(29), { id });
    expect(run.states[0]).toBe(s);
    expect(run.purges).toEqual([]);
    expect(run.frameReferences).toEqual([]);
  });

  it("deletes evidence frames after the evidence period, keeping structured metadata", () => {
    const s = endedSession("ses_1", "tnt_a", END);
    const frames = s.visualEvents.length;
    expect(frames).toBeGreaterThan(0);
    const refs = s.visualEvents.map((v) => v.frameReference);
    const run = applyRetention([s], policies, at(30), { id });
    const out = run.states[0];
    expect(out).not.toBe(s);
    expect(out.visualEvents.every((v) => v.frameReference === PURGED_FRAME_REFERENCE && v.purgedAt)).toBe(true);
    expect(out.visualEvents.map((v) => v.id)).toEqual(s.visualEvents.map((v) => v.id));
    expect(out.observations).toEqual(s.observations);
    expect(out.transcript).toEqual(s.transcript); // transcripts are kept for 90 days
    expect(run.frameReferences).toEqual(refs);
    expect(out.retention).toMatchObject({ framesPurged: frames, evidencePurgedAt: new Date(at(30)).toISOString() });
    expect(out.seq).toBe(s.seq + 1);
    // Input is not mutated (pure).
    expect(s.visualEvents[0].frameReference).toBe(refs[0]);
    expect(s.retention).toBeUndefined();

    const audit = out.audit.at(-1)!;
    expect(audit.eventType).toBe("privacy.retention_purged");
    expect(audit.actorType).toBe("system");
    expect(audit.payload).toMatchObject({ framesPurged: frames, transcriptEventsPurged: 0, evidenceRetentionDays: 30 });
    expect(run.purges).toEqual([{ sessionId: "ses_1", tenantId: "tnt_a", framesPurged: frames, transcriptEventsPurged: 0 }]);
  });

  it("deletes transcripts after the transcript period", () => {
    const s = endedSession("ses_1", "tnt_a", END);
    const lines = s.transcript.length;
    const out = applyRetention([s], policies, at(90), { id }).states[0];
    expect(out.transcript).toEqual([]);
    expect(out.retention).toMatchObject({ transcriptEventsPurged: lines });
    expect(out.audit.at(-1)!.payload).toMatchObject({ transcriptEventsPurged: lines });
  });

  it("is idempotent: a second run purges nothing and adds no audit", () => {
    const s = endedSession("ses_1", "tnt_a", END);
    const first = applyRetention([s], policies, at(100), { id });
    const second = applyRetention(first.states, policies, at(101), { id });
    expect(second.states[0]).toBe(first.states[0]);
    expect(second.purges).toEqual([]);
  });

  it("live-only tenants lose evidence as soon as the session has ended", () => {
    const s = endedSession("ses_live", "tnt_live", END);
    const out = applyRetention([s], policies, at(0), { id }).states[0];
    expect(out.visualEvents.every((v) => v.frameReference === PURGED_FRAME_REFERENCE)).toBe(true);
    expect(out.transcript.length).toBe(s.transcript.length);
  });

  it("applies each tenant's own policy", () => {
    const a = endedSession("ses_a", "tnt_a", END);
    const live = endedSession("ses_live", "tnt_live", END);
    const run = applyRetention([a, live], policies, at(8), { id });
    expect(run.states[0]).toBe(a); // 8 days: inside tnt_a's 30/90 days
    expect(run.states[1].transcript).toEqual([]); // past tnt_live's 7 days
    expect(run.purges.map((p) => p.tenantId)).toEqual(["tnt_live"]);
  });

  it("never touches live sessions or tenants without a policy", () => {
    const h = routerHarness("wan_down");
    h.runCustomer();
    const live = structuredClone(h.state);
    expect(retentionClockStart(live)).toBeUndefined();
    const unknown = endedSession("ses_u", "tnt_unknown", END);
    const run = applyRetention([live, unknown], policies, at(10_000), { id });
    expect(run.states[0]).toBe(live);
    expect(run.states[1]).toBe(unknown);
  });
});

describe("runtime retention hook", () => {
  it("purges expired sessions, deletes stored frame bytes and records status", () => {
    const rt = new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
    const { id: sid } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Test", scenario: "power_cycle_fix" });
    const customer = { type: "customer" as const, id: "c", name: "Test" };
    rt.dispatch(sid, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, customer);
    const frameId = rt.storeFrame(sid, "image/jpeg", new Uint8Array([1, 2, 3]));
    rt.dispatch(sid, { type: "frame.captured", trigger: "customer_capture", frameReference: `mem:${frameId}`, width: 1, height: 1, bytes: 3 }, customer);
    rt.dispatch(sid, { type: "session.end", reason: "test" }, customer);
    expect(rt.getFrame(sid, `mem:${frameId}`)).toBeDefined();

    const endedAt = Date.parse(rt.get(sid)!.state.session.endedAt!);
    rt.runRetention(endedAt + 29 * DAY); // Northline keeps evidence for 30 days
    expect(rt.getFrame(sid, `mem:${frameId}`)).toBeDefined();
    expect(rt.retentionStatus?.byTenant.tnt_northline).toBeUndefined();

    rt.runRetention(endedAt + 31 * DAY);
    expect(rt.getFrame(sid, `mem:${frameId}`)).toBeUndefined();
    expect(rt.get(sid)!.state.visualEvents.every((v) => v.frameReference === PURGED_FRAME_REFERENCE)).toBe(true);
    expect(rt.retentionStatus?.byTenant.tnt_northline).toMatchObject({ sessions: 1, frames: 1, transcriptEvents: 0 });
    expect(rt.retentionStatus?.lastPurgeAt).toBe(new Date(endedAt + 31 * DAY).toISOString());
  });
});
