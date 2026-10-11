import type { AuditEvent, DomainEventType, WorkflowDefinition, WorkflowStep } from "@/lib/domain/types";
import { workflows as catalog } from "@/lib/config/catalog";
import { validateWorkflow } from "./engine";

/**
 * Workflow versioning (docs/09 Phase 3/6, docs/10 §5). Versions are immutable
 * once published; changes go through draft -> in_review -> published, and
 * publishing retires the previous version. Sessions pin the version they
 * started on, so a publish never changes a running interaction.
 *
 * POC: operates on the in-process catalog. The same operations map onto a
 * versioned table in the data platform.
 */

export interface Actor {
  id: string;
  name: string;
}

/** Editable fields on a draft. Structure (steps, rules) is changed via new templates for now. */
export interface DraftPatch {
  objective?: string;
  changeNote?: string;
  defaultConfidenceThreshold?: number;
  maxAiDurationSec?: number;
  steps?: { key: string; instruction?: string; customerPrompt?: string; confidenceThreshold?: number | null; maxAttempts?: number | null }[];
}

export class WorkflowRegistryError extends Error {}

export class WorkflowRegistry {
  readonly audit: AuditEvent[] = [];
  private counter = 0;

  constructor(
    private readonly store: WorkflowDefinition[],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  list(): WorkflowDefinition[] {
    return this.store;
  }

  get(id: string): WorkflowDefinition | undefined {
    return this.store.find((w) => w.id === id);
  }

  versions(tenantId: string, key: string): WorkflowDefinition[] {
    return this.store.filter((w) => w.tenantId === tenantId && w.key === key).sort((a, b) => b.version - a.version);
  }

  latestPublished(tenantId: string, key: string): WorkflowDefinition | undefined {
    return this.versions(tenantId, key).find((w) => w.status === "published");
  }

  openDraft(tenantId: string, key: string): WorkflowDefinition | undefined {
    return this.versions(tenantId, key).find((w) => w.status === "draft" || w.status === "in_review");
  }

  createDraft(fromId: string, actor: Actor): WorkflowDefinition {
    const base = this.mustGet(fromId);
    const existing = this.openDraft(base.tenantId, base.key);
    if (existing) throw new WorkflowRegistryError(`A ${existing.status === "draft" ? "draft" : "version in review"} already exists (v${existing.version})`);
    const version = Math.max(...this.versions(base.tenantId, base.key).map((w) => w.version)) + 1;
    const draft: WorkflowDefinition = {
      ...structuredClone(base),
      id: `${base.id.replace(/_v\d+$/, "")}_v${version}`,
      version,
      status: "draft",
      basedOnVersion: base.version,
      changeNote: "",
      publishedAt: undefined,
      publishedBy: undefined,
      submittedAt: undefined,
      submittedBy: undefined,
      retiredAt: undefined,
    };
    this.store.push(draft);
    this.record("config.workflow_draft_created", draft, actor, { from: `v${base.version}` });
    return draft;
  }

  updateDraft(id: string, patch: DraftPatch, actor: Actor): WorkflowDefinition {
    const wf = this.mustGet(id);
    if (wf.status !== "draft") throw new WorkflowRegistryError("Only drafts can be edited");
    const changed: string[] = [];
    if (patch.objective !== undefined && patch.objective !== wf.objective) {
      wf.objective = text(patch.objective, 600, "Objective");
      changed.push("objective");
    }
    if (patch.changeNote !== undefined && patch.changeNote !== wf.changeNote) {
      wf.changeNote = text(patch.changeNote, 400, "Change note", true);
      changed.push("changeNote");
    }
    if (patch.defaultConfidenceThreshold !== undefined && patch.defaultConfidenceThreshold !== wf.defaultConfidenceThreshold) {
      wf.defaultConfidenceThreshold = threshold(patch.defaultConfidenceThreshold);
      changed.push("defaultConfidenceThreshold");
    }
    if (patch.maxAiDurationSec !== undefined && patch.maxAiDurationSec !== wf.maxAiDurationSec) {
      if (!Number.isInteger(patch.maxAiDurationSec) || patch.maxAiDurationSec < 60 || patch.maxAiDurationSec > 3600) {
        throw new WorkflowRegistryError("Max AI duration must be between 60 and 3600 seconds");
      }
      wf.maxAiDurationSec = patch.maxAiDurationSec;
      changed.push("maxAiDurationSec");
    }
    for (const sp of patch.steps ?? []) {
      const step = wf.steps.find((s) => s.key === sp.key);
      if (!step) throw new WorkflowRegistryError(`Unknown step "${sp.key}"`);
      changed.push(...applyStepPatch(step, sp));
    }
    if (changed.length) this.record("config.workflow_updated", wf, actor, { fields: [...new Set(changed)] });
    return wf;
  }

  submitForReview(id: string, actor: Actor): WorkflowDefinition {
    const wf = this.mustGet(id);
    if (wf.status !== "draft") throw new WorkflowRegistryError("Only drafts can be submitted");
    this.assertPublishable(wf);
    wf.status = "in_review";
    wf.submittedAt = this.now();
    wf.submittedBy = actor.name;
    this.record("config.workflow_submitted", wf, actor, {});
    return wf;
  }

  /** Return a version in review to draft for further edits. */
  reopen(id: string, actor: Actor): WorkflowDefinition {
    const wf = this.mustGet(id);
    if (wf.status !== "in_review") throw new WorkflowRegistryError("Only versions in review can be reopened");
    wf.status = "draft";
    this.record("config.workflow_updated", wf, actor, { fields: ["status"], reopened: true });
    return wf;
  }

  publish(id: string, actor: Actor): WorkflowDefinition {
    const wf = this.mustGet(id);
    if (wf.status !== "in_review") throw new WorkflowRegistryError("Submit the draft for review before publishing");
    this.assertPublishable(wf);
    const previous = this.latestPublished(wf.tenantId, wf.key);
    if (previous) {
      previous.status = "retired";
      previous.retiredAt = this.now();
      this.record("config.workflow_retired", previous, actor, { supersededBy: `v${wf.version}` });
    }
    wf.status = "published";
    wf.publishedAt = this.now();
    wf.publishedBy = actor.name;
    this.record("config.workflow_published", wf, actor, { supersedes: previous ? `v${previous.version}` : null });
    return wf;
  }

  discardDraft(id: string, actor: Actor): void {
    const wf = this.mustGet(id);
    if (wf.status !== "draft" && wf.status !== "in_review") throw new WorkflowRegistryError("Only unpublished versions can be discarded");
    this.store.splice(this.store.indexOf(wf), 1);
    this.record("config.workflow_discarded", wf, actor, {});
  }

  private assertPublishable(wf: WorkflowDefinition) {
    const errors = validateWorkflow(wf).filter((i) => i.severity === "error");
    if (errors.length) throw new WorkflowRegistryError(`Publish checks failed: ${errors.map((e) => e.message).join("; ")}`);
    if (!wf.changeNote.trim()) throw new WorkflowRegistryError("A change note is required");
  }

  private mustGet(id: string): WorkflowDefinition {
    const wf = this.get(id);
    if (!wf) throw new WorkflowRegistryError("Workflow not found");
    return wf;
  }

  private record(eventType: DomainEventType, wf: WorkflowDefinition, actor: Actor, payload: Record<string, unknown>) {
    this.audit.push({
      id: `aud_cfg_${(++this.counter).toString(36)}_${Date.now().toString(36)}`,
      tenantId: wf.tenantId,
      actorType: "admin",
      actorId: actor.id,
      eventType,
      payload: { workflowId: wf.id, key: wf.key, version: wf.version, ...payload },
      timestamp: this.now(),
      context: { workflowVersion: wf.version },
    });
  }
}

function applyStepPatch(step: WorkflowStep, p: NonNullable<DraftPatch["steps"]>[number]): string[] {
  const changed: string[] = [];
  if (p.instruction !== undefined && p.instruction !== step.instruction) {
    step.instruction = text(p.instruction, 600, `${step.title} instruction`);
    changed.push(`steps.${step.key}.instruction`);
  }
  if (p.customerPrompt !== undefined && p.customerPrompt !== step.customerPrompt) {
    step.customerPrompt = text(p.customerPrompt, 120, `${step.title} customer prompt`);
    changed.push(`steps.${step.key}.customerPrompt`);
  }
  if (p.confidenceThreshold !== undefined && (p.confidenceThreshold ?? undefined) !== step.confidenceThreshold) {
    if (step.type !== "visual_request") throw new WorkflowRegistryError(`${step.title} has no visual evidence`);
    step.confidenceThreshold = p.confidenceThreshold === null ? undefined : threshold(p.confidenceThreshold);
    changed.push(`steps.${step.key}.confidenceThreshold`);
  }
  if (p.maxAttempts !== undefined && (p.maxAttempts ?? undefined) !== step.maxAttempts) {
    if (step.type !== "visual_request") throw new WorkflowRegistryError(`${step.title} has no capture attempts`);
    if (p.maxAttempts !== null && (!Number.isInteger(p.maxAttempts) || p.maxAttempts < 1 || p.maxAttempts > 5)) {
      throw new WorkflowRegistryError("Max attempts must be 1–5");
    }
    step.maxAttempts = p.maxAttempts ?? undefined;
    changed.push(`steps.${step.key}.maxAttempts`);
  }
  return changed;
}

function text(v: string, max: number, label: string, allowEmpty = false): string {
  const t = String(v).trim();
  if (!allowEmpty && !t) throw new WorkflowRegistryError(`${label} cannot be empty`);
  if (t.length > max) throw new WorkflowRegistryError(`${label} is longer than ${max} characters`);
  return t;
}

function threshold(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0.5 || n > 0.99) throw new WorkflowRegistryError("Confidence threshold must be between 0.50 and 0.99");
  return Math.round(n * 100) / 100;
}

const KEY = "__aiukWorkflowRegistry";

export function getWorkflowRegistry(): WorkflowRegistry {
  const g = globalThis as unknown as Record<string, WorkflowRegistry | undefined>;
  return (g[KEY] ??= new WorkflowRegistry(catalog));
}
