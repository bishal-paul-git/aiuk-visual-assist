import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { workflows } from "@/lib/config/catalog";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { attachConfigStore } from "@/lib/server/store/config";
import { getConnectorRegistry } from "@/lib/integrations/config";

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

  it("persists integration connectors without secrets and restores them", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-config-"));
    dirs.push(dir);
    attachConfigStore(dir);
    const reg = getConnectorRegistry();
    const entry = { tenantId: "tnt_harbour", tool: "attach_claim_evidence", mode: "http", endpoint: "https://claims.harbour.example/va/evidence" };
    reg.setStored([entry], { persist: true });
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
    expect(saved.connectors).toEqual([entry]);
    expect(JSON.stringify(saved.connectors)).not.toMatch(/secret"/);

    reg.setStored([]);
    attachConfigStore(dir);
    const r = reg.resolve("tnt_harbour", "attach_claim_evidence");
    expect(r.kind === "configured" && r.config.endpoint).toBe("https://claims.harbour.example/va/evidence");
    reg.setStored([]);
  });
});

describe("built-in workflows after a deploy", () => {
  it("takes an unedited built-in from the code, keeps platform edits, adds missing built-ins", async () => {
    const { refreshBuiltIns } = await import("@/lib/server/store/config");
    const { BUILT_IN_WORKFLOWS } = await import("@/lib/config/catalog");
    const router = BUILT_IN_WORKFLOWS.find((w) => w.id === "wf_router_v3")!;
    const boiler = BUILT_IN_WORKFLOWS.find((w) => w.id === "wf_boiler_v1")!;
    const staleRouter = { ...structuredClone(router), knowledge: undefined, aiNotes: ["old note"] };
    const editedBoiler = { ...structuredClone(boiler), objective: "Edited on the platform" };
    const custom = { ...structuredClone(boiler), id: "wf_custom_v1", key: "custom" };
    const audit = [{ payload: { workflowId: "wf_boiler_v1" } }, { payload: { workflowId: "wf_custom_v1" } }] as never[];
    const out = refreshBuiltIns([staleRouter, editedBoiler, custom], audit, [...BUILT_IN_WORKFLOWS]);
    const byId = new Map(out.map((w) => [w.id, w]));
    expect(byId.get("wf_router_v3")!.knowledge?.length).toBeGreaterThan(0);
    expect(byId.get("wf_router_v3")!.aiNotes).toEqual(router.aiNotes);
    expect(byId.get("wf_boiler_v1")!.objective).toBe("Edited on the platform");
    expect(byId.has("wf_custom_v1")).toBe(true);
    expect(byId.has("wf_router_v2")).toBe(true);
  });
});
