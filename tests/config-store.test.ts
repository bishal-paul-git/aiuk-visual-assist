import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { workflows } from "@/lib/config/catalog";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { attachConfigStore } from "@/lib/server/store/config";

const admin = { id: "usr_priya", name: "Priya Shah" };
const approver = { id: "usr_james", name: "James Carter" };
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("configuration store", () => {
  it("persists versions published at runtime and restores them after a restart", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-config-"));
    dirs.push(dir);
    expect(attachConfigStore(dir).restored).toBe(false);

    const r = getWorkflowRegistry();
    const draft = r.createDraft("wf_router_v3", admin);
    r.updateDraft(draft.id, { changeNote: "Persist me" }, admin);
    r.submitForReview(draft.id, admin);
    r.publish(draft.id, approver);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
    expect(saved.workflows.some((w: { id: string; status: string }) => w.id === draft.id && w.status === "published")).toBe(true);

    // Simulate a restart: the in-memory catalog loses the runtime version.
    const before = r.audit.length;
    workflows.splice(workflows.findIndex((w) => w.id === draft.id), 1);
    r.audit.splice(0);
    expect(attachConfigStore(dir).restored).toBe(true);
    expect(workflows.find((w) => w.id === draft.id)?.status).toBe("published");
    expect(workflows.find((w) => w.id === "wf_router_v3")?.status).toBe("retired");
    expect(r.audit).toHaveLength(before);
  });
});
