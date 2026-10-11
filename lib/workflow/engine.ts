import type {
  NextRule,
  StepCondition,
  VisualObservation,
  WorkflowDefinition,
  WorkflowStep,
} from "@/lib/domain/types";

/** Facts the engine can branch on. All values are normalised strings. */
export interface StepFacts {
  intent?: string;
  observations: Record<string, string>;
  toolResults: Record<string, string>;
}

export function getStep(def: WorkflowDefinition, key: string): WorkflowStep {
  const step = def.steps.find((s) => s.key === key);
  if (!step) throw new Error(`Workflow ${def.key} v${def.version} has no step "${key}"`);
  return step;
}

export function conditionMatches(cond: StepCondition, facts: StepFacts): boolean {
  switch (cond.kind) {
    case "always":
      return true;
    case "intent":
      return facts.intent !== undefined && cond.intents.includes(facts.intent);
    case "observation": {
      const value = facts.observations[cond.observationType];
      return value !== undefined && cond.values.includes(value);
    }
    case "tool_result": {
      const value = facts.toolResults[cond.field];
      return value !== undefined && cond.values.includes(value);
    }
  }
}

/** Intents a step can branch on, in rule order. */
export function expectedIntents(step: WorkflowStep | undefined): string[] {
  if (!step) return [];
  return step.next.flatMap((r) => (r.when.kind === "intent" ? r.when.intents : []));
}

/** First matching rule wins; rule order in the definition is the priority order. */
export function selectNext(step: WorkflowStep, facts: StepFacts): NextRule | undefined {
  return step.next.find((rule) => conditionMatches(rule.when, facts));
}

/** Statuses that may be used to drive a workflow branch. */
const ACCEPTABLE_STATUSES = new Set(["confirmed_visible", "likely_visible", "not_visible"]);

export type EvidenceAssessment =
  | { kind: "sufficient"; accepted: VisualObservation[] }
  | {
      kind: "insufficient";
      missing: string[];
      uncertain: VisualObservation[];
      recommendation: "closer" | "another_angle";
    };

/**
 * Decide whether the observations from a frame satisfy a visual checkpoint.
 * Never treats unclear evidence as good enough (docs/03 §6, docs/05 §1).
 */
export function assessEvidence(
  step: WorkflowStep,
  observations: VisualObservation[],
  defaultThreshold: number,
): EvidenceAssessment {
  const required = step.evidence?.observationTypes ?? [];
  const threshold = step.confidenceThreshold ?? defaultThreshold;
  const accepted: VisualObservation[] = [];
  const uncertain: VisualObservation[] = [];
  const missing: string[] = [];

  for (const type of required) {
    const candidates = observations.filter((o) => o.observationType === type);
    const usable = candidates.find(
      (o) => ACCEPTABLE_STATUSES.has(o.status) && o.confidence >= threshold && o.value !== undefined,
    );
    if (usable) {
      accepted.push(usable);
    } else if (candidates.length > 0) {
      uncertain.push(...candidates);
    } else {
      missing.push(type);
    }
  }

  if (uncertain.length === 0 && missing.length === 0) return { kind: "sufficient", accepted };

  const recommendsAngle = [...uncertain].some(
    (o) => o.recommendedNextAction === "request_another_angle" || o.status === "conflicting_evidence",
  );
  return {
    kind: "insufficient",
    missing,
    uncertain,
    recommendation: recommendsAngle || (missing.length > 0 && uncertain.length === 0) ? "another_angle" : "closer",
  };
}

export interface ValidationIssue {
  stepKey?: string;
  severity: "error" | "warning" | "info";
  message: string;
}

/** Static validation run before a workflow version can be published. */
export function validateWorkflow(def: WorkflowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const keys = new Set(def.steps.map((s) => s.key));

  if (keys.size !== def.steps.length) issues.push({ severity: "error", message: "Duplicate step keys" });
  if (!keys.has(def.startStep)) issues.push({ severity: "error", message: `Start step "${def.startStep}" does not exist` });

  for (const step of def.steps) {
    if (!step.instruction.trim()) issues.push({ stepKey: step.key, severity: "error", message: "AI instruction is empty" });
    if (!step.customerPrompt.trim()) issues.push({ stepKey: step.key, severity: "warning", message: "Customer screen prompt is empty" });
    for (const rule of step.next) {
      if (!keys.has(rule.to)) {
        issues.push({ stepKey: step.key, severity: "error", message: `Rule "${rule.label}" targets unknown step "${rule.to}"` });
      }
    }
    if (step.onFailure && !keys.has(step.onFailure.to)) {
      issues.push({ stepKey: step.key, severity: "error", message: `Failure path targets unknown step "${step.onFailure.to}"` });
    }
    const terminal = step.type === "completion" || step.type === "human_escalation";
    if (!terminal && step.next.length === 0) {
      issues.push({ stepKey: step.key, severity: "error", message: "Non-terminal step has no next rules" });
    }
    if (step.type === "visual_request") {
      if (!step.evidence || step.evidence.observationTypes.length === 0) {
        issues.push({ stepKey: step.key, severity: "error", message: "Visual request must define required evidence" });
      }
      if (!step.onFailure) {
        issues.push({ stepKey: step.key, severity: "error", message: "Visual request must define a failure/escalation path" });
      }
    }
    if (step.type === "business_action" && !step.action) {
      issues.push({ stepKey: step.key, severity: "error", message: "Business action step must define an action" });
    }
    if (step.type === "business_action" && !step.onFailure) {
      issues.push({ stepKey: step.key, severity: "warning", message: "Business action has no failure path; failures escalate by default" });
    }
    if (step.type === "completion" && !step.completion) {
      issues.push({ stepKey: step.key, severity: "error", message: "Completion step must define an outcome" });
    }
    if (step.type === "human_escalation" && !step.escalation) {
      issues.push({ stepKey: step.key, severity: "error", message: "Escalation step must define a reason" });
    }
    const vocab = def.observationVocabulary;
    if (vocab) {
      for (const rule of step.next) {
        if (rule.when.kind !== "observation") continue;
        const allowed = vocab[rule.when.observationType]?.values;
        if (!allowed) {
          issues.push({ stepKey: step.key, severity: "error", message: `Observation type "${rule.when.observationType}" is not in the workflow vocabulary` });
          continue;
        }
        for (const v of rule.when.values) {
          if (!allowed.includes(v)) issues.push({ stepKey: step.key, severity: "error", message: `Value "${v}" is not allowed for ${rule.when.observationType}` });
        }
      }
      for (const t of step.evidence?.observationTypes ?? []) {
        if (!vocab[t]) issues.push({ stepKey: step.key, severity: "error", message: `Required evidence "${t}" is not in the workflow vocabulary` });
      }
    }
    const hasFallback = step.next.some((r) => r.when.kind === "always");
    if ((step.type === "question" || step.type === "guidance") && !hasFallback) {
      issues.push({ stepKey: step.key, severity: "info", message: "No fallback rule; unmatched answers are re-asked" });
    }
  }

  // Reachability from the start step.
  const reachable = new Set<string>();
  const queue = keys.has(def.startStep) ? [def.startStep] : [];
  while (queue.length) {
    const key = queue.shift()!;
    if (reachable.has(key)) continue;
    reachable.add(key);
    const step = def.steps.find((s) => s.key === key);
    if (!step) continue;
    for (const rule of step.next) queue.push(rule.to);
    if (step.onFailure) queue.push(step.onFailure.to);
  }
  for (const step of def.steps) {
    if (!reachable.has(step.key)) issues.push({ stepKey: step.key, severity: "warning", message: "Step is unreachable" });
  }
  if (!def.steps.some((s) => s.type === "human_escalation")) {
    issues.push({ severity: "error", message: "Every workflow must include a human escalation step" });
  }
  return issues;
}
