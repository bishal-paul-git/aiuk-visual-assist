import type { AuditEvent, DomainEventType, Policy, ToolPermission, ToolRisk } from "@/lib/domain/types";
import { policies as catalog, policyKey } from "@/lib/config/catalog";
import { fourEyesViolation, type Actor } from "@/lib/config/four-eyes";
import { validatePolicy } from "./engine";

/**
 * Policy versioning, mirroring workflow versioning (lib/workflow/registry.ts):
 * draft -> in_review -> active (published), with the previous active version
 * retired and a second administrator required to publish (four-eyes).
 *
 * Published versions are never edited in place. Sessions hold the policy
 * object they started with, so a publish only affects new sessions; workflows
 * reference the lineage key, which resolves to the active version
 * (getPolicy in lib/config/catalog.ts).
 */

export const TOOL_MODES: ToolPermission["mode"][] = ["allow", "human_only", "deny"];
export const TOOL_RISKS: ToolRisk[] = ["low", "medium", "high", "regulated"];

export interface PolicyDraftPatch {
  changeNote?: string;
  minObservationConfidence?: number;
  maxCaptureAttempts?: number;
  maxAiDurationSec?: number;
  allowReturnToAi?: boolean;
  tools?: { tool: string; mode?: ToolPermission["mode"]; risk?: ToolRisk; requiresIdempotencyKey?: boolean }[];
}

export class PolicyRegistryError extends Error {}

export class PolicyRegistry {
  readonly audit: AuditEvent[] = [];
  private counter = 0;

  constructor(
    private readonly store: Policy[],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  list(): Policy[] {
    return this.store;
  }

  get(id: string): Policy | undefined {
    return this.store.find((p) => p.id === id);
  }

  versions(key: string): Policy[] {
    return this.store.filter((p) => policyKey(p) === key).sort((a, b) => b.version - a.version);
  }

  /** One entry per lineage: the active version, else the newest. */
  current(): Policy[] {
    const keys = [...new Set(this.store.map(policyKey))];
    return keys.map((k) => {
      const v = this.versions(k);
      return v.find((p) => p.status === "active") ?? v[0];
    });
  }

  active(key: string): Policy | undefined {
    return this.versions(key).find((p) => p.status === "active");
  }

  openDraft(key: string): Policy | undefined {
    return this.versions(key).find((p) => p.status === "draft" || p.status === "in_review");
  }

  createDraft(fromId: string, actor: Actor): Policy {
    const base = this.mustGet(fromId);
    const key = policyKey(base);
    const existing = this.openDraft(key);
    if (existing) throw new PolicyRegistryError(`A ${existing.status === "draft" ? "draft" : "version in review"} already exists (v${existing.version})`);
    const version = Math.max(...this.versions(key).map((p) => p.version)) + 1;
    const draft: Policy = {
      ...structuredClone(base),
      id: `${key}_v${version}`,
      key,
      version,
      status: "draft",
      basedOnVersion: base.version,
      changeNote: "",
      submittedAt: undefined,
      submittedBy: undefined,
      submittedById: undefined,
      publishedAt: undefined,
      publishedBy: undefined,
      approvedBy: undefined,
      approvedById: undefined,
      retiredAt: undefined,
    };
    this.store.push(draft);
    this.record("config.policy_draft_created", draft, actor, { from: `v${base.version}` });
    return draft;
  }

  updateDraft(id: string, patch: PolicyDraftPatch, actor: Actor): Policy {
    const p = this.mustGet(id);
    if (p.status !== "draft") throw new PolicyRegistryError("Only drafts can be edited");
    const next = structuredClone(p);
    const changed: string[] = [];
    if (patch.changeNote !== undefined && patch.changeNote.trim() !== (p.changeNote ?? "")) {
      const note = String(patch.changeNote).trim();
      if (note.length > 400) throw new PolicyRegistryError("Change note is longer than 400 characters");
      next.changeNote = note;
      changed.push("changeNote");
    }
    if (patch.minObservationConfidence !== undefined && patch.minObservationConfidence !== p.minObservationConfidence) {
      const n = patch.minObservationConfidence;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0.5 || n > 0.99) throw new PolicyRegistryError("Minimum confidence must be between 0.50 and 0.99");
      next.minObservationConfidence = Math.round(n * 100) / 100;
      changed.push("minObservationConfidence");
    }
    if (patch.maxCaptureAttempts !== undefined && patch.maxCaptureAttempts !== p.maxCaptureAttempts) {
      const n = patch.maxCaptureAttempts;
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new PolicyRegistryError("Maximum capture attempts must be 1–5");
      next.maxCaptureAttempts = n;
      changed.push("maxCaptureAttempts");
    }
    if (patch.maxAiDurationSec !== undefined && patch.maxAiDurationSec !== p.maxAiDurationSec) {
      const n = patch.maxAiDurationSec;
      if (!Number.isInteger(n) || n < 60 || n > 3600) throw new PolicyRegistryError("Maximum AI duration must be between 60 and 3600 seconds");
      next.maxAiDurationSec = n;
      changed.push("maxAiDurationSec");
    }
    if (patch.allowReturnToAi !== undefined && patch.allowReturnToAi !== p.allowReturnToAi) {
      next.allowReturnToAi = Boolean(patch.allowReturnToAi);
      changed.push("allowReturnToAi");
    }
    for (const tp of patch.tools ?? []) {
      const tool = next.tools.find((t) => t.tool === tp.tool);
      if (!tool) throw new PolicyRegistryError(`Unknown tool "${tp.tool}"`);
      if (tp.mode !== undefined && tp.mode !== tool.mode) {
        if (!TOOL_MODES.includes(tp.mode)) throw new PolicyRegistryError(`Mode for ${tool.tool} is not valid`);
        tool.mode = tp.mode;
        changed.push(`tools.${tool.tool}.mode`);
      }
      if (tp.risk !== undefined && tp.risk !== tool.risk) {
        if (!TOOL_RISKS.includes(tp.risk)) throw new PolicyRegistryError(`Risk for ${tool.tool} is not valid`);
        tool.risk = tp.risk;
        changed.push(`tools.${tool.tool}.risk`);
      }
      if (tp.requiresIdempotencyKey !== undefined && tp.requiresIdempotencyKey !== tool.requiresIdempotencyKey) {
        tool.requiresIdempotencyKey = Boolean(tp.requiresIdempotencyKey);
        changed.push(`tools.${tool.tool}.requiresIdempotencyKey`);
      }
      // Hard rule, enforced on every edit as well as at publish.
      if (tool.risk === "regulated" && tool.mode === "allow") {
        throw new PolicyRegistryError(`${tool.tool} is a regulated tool and can never be allowed for the AI`);
      }
    }
    if (changed.length) {
      Object.assign(p, next);
      this.record("config.policy_updated", p, actor, { fields: [...new Set(changed)] });
    }
    return p;
  }

  submitForReview(id: string, actor: Actor): Policy {
    const p = this.mustGet(id);
    if (p.status !== "draft") throw new PolicyRegistryError("Only drafts can be submitted");
    this.assertPublishable(p);
    p.status = "in_review";
    p.submittedAt = this.now();
    p.submittedBy = actor.name;
    p.submittedById = actor.id;
    this.record("config.policy_submitted", p, actor, {});
    return p;
  }

  reopen(id: string, actor: Actor): Policy {
    const p = this.mustGet(id);
    if (p.status !== "in_review") throw new PolicyRegistryError("Only versions in review can be reopened");
    p.status = "draft";
    this.record("config.policy_updated", p, actor, { fields: ["status"], reopened: true });
    return p;
  }

  publish(id: string, actor: Actor): Policy {
    const p = this.mustGet(id);
    if (p.status !== "in_review") throw new PolicyRegistryError("Submit the draft for review before publishing");
    const violation = fourEyesViolation(p, actor);
    if (violation) throw new PolicyRegistryError(violation);
    this.assertPublishable(p);
    const previous = this.active(policyKey(p));
    if (previous) {
      previous.status = "retired";
      previous.retiredAt = this.now();
      this.record("config.policy_retired", previous, actor, { supersededBy: `v${p.version}` });
    }
    p.status = "active";
    p.publishedAt = this.now();
    p.publishedBy = actor.name;
    p.approvedBy = actor.name;
    p.approvedById = actor.id;
    this.record("config.policy_published", p, actor, { supersedes: previous ? `v${previous.version}` : null, submittedBy: p.submittedBy ?? null, approvedBy: actor.name });
    return p;
  }

  discardDraft(id: string, actor: Actor): void {
    const p = this.mustGet(id);
    if (p.status !== "draft" && p.status !== "in_review") throw new PolicyRegistryError("Only unpublished versions can be discarded");
    if (this.versions(policyKey(p)).length === 1) throw new PolicyRegistryError("This is the only version of the policy and cannot be discarded");
    this.store.splice(this.store.indexOf(p), 1);
    this.record("config.policy_discarded", p, actor, {});
  }

  private assertPublishable(p: Policy) {
    const errors = validatePolicy(p).filter((i) => i.severity === "error");
    if (errors.length) throw new PolicyRegistryError(`Publish checks failed: ${errors.map((e) => (e.tool ? `${e.tool}: ${e.message}` : e.message)).join("; ")}`);
    if (!p.changeNote?.trim()) throw new PolicyRegistryError("A change note is required");
  }

  private mustGet(id: string): Policy {
    const p = this.get(id);
    if (!p) throw new PolicyRegistryError("Policy not found");
    return p;
  }

  private record(eventType: DomainEventType, p: Policy, actor: Actor, payload: Record<string, unknown>) {
    this.audit.push({
      id: `aud_pol_${(++this.counter).toString(36)}_${Date.now().toString(36)}`,
      tenantId: p.tenantId,
      actorType: "admin",
      actorId: actor.id,
      eventType,
      payload: { policyId: p.id, key: policyKey(p), version: p.version, ...payload },
      timestamp: this.now(),
      context: { policyVersion: p.version },
    });
  }
}

const KEY = "__aiukPolicyRegistry";

export function getPolicyRegistry(): PolicyRegistry {
  const g = globalThis as unknown as Record<string, PolicyRegistry | undefined>;
  return (g[KEY] ??= new PolicyRegistry(catalog));
}
