import { describe, expect, it } from "vitest";
import { WorkflowRegistry } from "@/lib/workflow/registry";
import { routerTroubleshootingV3 } from "@/lib/config/workflows/router-troubleshooting";
import { routerTroubleshootingV2 } from "@/lib/config/workflows/other-workflows";

const admin = { id: "usr_priya", name: "Priya Shah" };
const approver = { id: "usr_james", name: "James Carter" };

function registry() {
  return new WorkflowRegistry([structuredClone(routerTroubleshootingV3), structuredClone(routerTroubleshootingV2)], () => "2026-10-11T12:00:00.000Z");
}

describe("workflow versioning", () => {
  it("draft → review → publish retires the previous version and is audited", () => {
    const r = registry();
    const draft = r.createDraft("wf_router_v3", admin);
    expect(draft).toMatchObject({ id: "wf_router_v4", version: 4, status: "draft", basedOnVersion: 3 });
    r.updateDraft(draft.id, { changeNote: "Shorter lights prompt", steps: [{ key: "inspect_lights", customerPrompt: "Closer to the lights, please", confidenceThreshold: 0.8 }] }, admin);
    r.submitForReview(draft.id, admin);
    r.publish(draft.id, approver);
    expect(r.latestPublished("tnt_northline", "router-troubleshooting")?.version).toBe(4);
    expect(r.get("wf_router_v3")?.status).toBe("retired");
    expect(r.get("wf_router_v4")?.steps.find((s) => s.key === "inspect_lights")?.confidenceThreshold).toBe(0.8);
    expect(r.audit.map((a) => a.eventType)).toEqual([
      "config.workflow_draft_created",
      "config.workflow_updated",
      "config.workflow_submitted",
      "config.workflow_retired",
      "config.workflow_published",
    ]);
  });

  it("does not mutate the source version", () => {
    const r = registry();
    const d = r.createDraft("wf_router_v3", admin);
    r.updateDraft(d.id, { steps: [{ key: "intake", instruction: "What's up?" }] }, admin);
    expect(r.get("wf_router_v3")?.steps.find((s) => s.key === "intake")?.instruction).toBe("What seems to be the problem today?");
  });

  it("enforces one open draft, draft-only edits, a change note and the publish order", () => {
    const r = registry();
    const d = r.createDraft("wf_router_v3", admin);
    expect(() => r.createDraft("wf_router_v3", admin)).toThrow(/already exists/);
    expect(() => r.publish(d.id, approver)).toThrow(/Submit the draft/);
    expect(() => r.submitForReview(d.id, admin)).toThrow(/change note/);
    r.updateDraft(d.id, { changeNote: "x" }, admin);
    r.submitForReview(d.id, admin);
    expect(() => r.updateDraft(d.id, { objective: "y" }, admin)).toThrow(/Only drafts/);
    r.reopen(d.id, admin);
    expect(r.get(d.id)?.status).toBe("draft");
  });

  it("validates field ranges", () => {
    const r = registry();
    const d = r.createDraft("wf_router_v3", admin);
    expect(() => r.updateDraft(d.id, { defaultConfidenceThreshold: 0.2 }, admin)).toThrow(/between 0.50 and 0.99/);
    expect(() => r.updateDraft(d.id, { steps: [{ key: "intake", confidenceThreshold: 0.8 }] }, admin)).toThrow(/no visual evidence/);
    expect(() => r.updateDraft(d.id, { steps: [{ key: "intake", instruction: "  " }] }, admin)).toThrow(/cannot be empty/);
    expect(() => r.updateDraft(d.id, { steps: [{ key: "nope" }] }, admin)).toThrow(/Unknown step/);
  });

  it("discards unpublished versions only", () => {
    const r = registry();
    const d = r.createDraft("wf_router_v3", admin);
    r.discardDraft(d.id, admin);
    expect(r.get(d.id)).toBeUndefined();
    expect(() => r.discardDraft("wf_router_v3", admin)).toThrow(/unpublished/);
  });

  it("requires a second administrator to publish (four-eyes) and records the approver", () => {
    const r = registry();
    const d = r.createDraft("wf_router_v3", admin);
    r.updateDraft(d.id, { changeNote: "Tighter thresholds" }, admin);
    r.submitForReview(d.id, admin);
    expect(r.get(d.id)).toMatchObject({ submittedBy: "Priya Shah", submittedById: "usr_priya" });
    expect(() => r.publish(d.id, admin)).toThrow(/Four-eyes rule: Priya Shah submitted this version/);
    expect(r.get(d.id)?.status).toBe("in_review");
    expect(r.get("wf_router_v3")?.status).toBe("published");

    r.publish(d.id, approver);
    expect(r.get(d.id)).toMatchObject({ status: "published", approvedBy: "James Carter", approvedById: "usr_james", publishedBy: "James Carter" });
    expect(r.audit.at(-1)?.payload).toMatchObject({ submittedBy: "Priya Shah", approvedBy: "James Carter" });
  });

  it("falls back to the submitter's name for versions without a submitter id", () => {
    const r = registry();
    const d = r.createDraft("wf_router_v3", admin);
    r.updateDraft(d.id, { changeNote: "x" }, admin);
    r.submitForReview(d.id, approver);
    const v = r.get(d.id)!;
    v.submittedById = undefined;
    expect(() => r.publish(d.id, approver)).toThrow(/Four-eyes/);
    expect(r.publish(d.id, admin).status).toBe("published");
  });
});
