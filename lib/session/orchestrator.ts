import type {
  ActorType,
  AgentConfig,
  AuditEvent,
  CostEvent,
  DomainEventType,
  EscalationReasonCode,
  EscalationSeverity,
  FrameTrigger,
  ModelUsage,
  Policy,
  SessionChannel,
  SessionOutcome,
  Speaker,
  ToolAction,
  ToolCallOutcome,
  TranscriptEvent,
  VisualEvent,
  VisualObservation,
  WorkflowDefinition,
  WorkflowStep,
} from "@/lib/domain/types";
import type { EvidenceRequest, MediaState, SessionState, StepRecord } from "@/lib/domain/session";
import { assessEvidence, getStep, selectNext, type StepFacts } from "@/lib/workflow/engine";
import { canReturnToAi, checkTool, detectHumanRequest, findDuplicate, isMandatoryHuman } from "@/lib/policy/engine";
import { COST_RATES, measuredModelCost, speechToTextCost } from "@/lib/domain/pricing";
import { redactPii } from "@/lib/privacy/redact";

/**
 * Session Orchestrator (docs/02 §3.5).
 *
 * A pure, deterministic reducer: `(state, command) -> { state, effects }`.
 * It is the single authority on session state — the model never mutates
 * state directly; it only returns structured results that arrive here as
 * commands and are validated against workflow + policy.
 *
 * Effects describe slow/external work (reasoning, tools). The runtime executes
 * them outside this function and feeds results back as commands, which keeps
 * business automation out of the real-time loop (docs/02 §4 rule 1).
 */

export interface OrchestratorDeps {
  now: () => string;
  id: (prefix: string) => string;
  workflow: WorkflowDefinition;
  policy: Policy;
  agent: AgentConfig;
}

export interface Actor {
  type: ActorType;
  id: string;
  name: string;
}

export type Effect =
  | { type: "interpret_utterance"; transcriptId: string }
  | { type: "interpret_evidence"; visualEventId: string }
  | { type: "execute_tool"; toolActionId: string }
  | { type: "notify_human_queue"; escalationId: string };

export interface ObservationInput {
  observationType: string;
  value?: string;
  observationText: string;
  confidence: number;
  status: VisualObservation["status"];
  requiresConfirmation: boolean;
  recommendedNextAction?: string;
}

export type Command =
  | { type: "customer.consent"; accepted: boolean; noticeVersion: string }
  | {
      type: "customer.utterance";
      text: string;
      confidence?: number;
      /**
       * Set by the server speech-to-text route only (never accepted from a
       * client command): which provider transcribed the turn and how much
       * audio it billed, so the turn is costed from its duration.
       */
      speech?: { provider: string; audioSeconds: number };
    }
  | { type: "customer.request_human" }
  | { type: "media.update"; media: Partial<MediaState> }
  | {
      type: "frame.captured";
      trigger: FrameTrigger;
      frameReference: string;
      width: number;
      height: number;
      bytes: number;
      evidenceRequestId?: string;
    }
  | { type: "utterance.interpreted"; transcriptId: string; intent: string; reply?: string; customerIssue?: string; usage?: ModelUsage }
  | { type: "utterance.failed"; transcriptId: string; error: string }
  | {
      type: "evidence.interpreted";
      visualEventId: string;
      observations: ObservationInput[];
      modelVersion: string;
      latencyMs: number;
      reply?: string;
      usage?: ModelUsage;
    }
  | { type: "evidence.failed"; visualEventId: string; error: string }
  | { type: "tool.completed"; toolActionId: string; result: Record<string, unknown>; outcome?: ToolCallOutcome }
  | { type: "tool.failed"; toolActionId: string; error: string; outcome?: ToolCallOutcome }
  | { type: "human.join" }
  | { type: "human.take_over" }
  | { type: "human.message"; text: string }
  | { type: "human.request_capture"; prompt: string }
  | { type: "human.note"; text: string }
  | { type: "human.review_observation"; observationId: string; verdict: "confirmed" | "rejected" }
  | { type: "human.run_action"; tool: string; params: Record<string, string | number | boolean> }
  | { type: "human.return_to_ai"; resumeStep?: string }
  | { type: "human.leave" }
  | { type: "session.end"; outcome?: SessionOutcome; reason?: string }
  | { type: "system.tick" };

export interface CommandResult {
  state: SessionState;
  effects: Effect[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

export interface CreateSessionInput {
  id: string;
  reference: string;
  tenantId: string;
  channel: SessionChannel;
  customerLabel: string;
  scenario?: string;
  /** Tenant retention mode in force when the session was created (docs/06 §3). */
  evidenceMode?: "live_only" | "retained_evidence";
}

export function createSession(input: CreateSessionInput, deps: OrchestratorDeps): SessionState {
  const now = deps.now();
  const state: SessionState = {
    seq: 0,
    session: {
      id: input.id,
      reference: input.reference,
      tenantId: input.tenantId,
      workflowId: deps.workflow.id,
      workflowKey: deps.workflow.key,
      workflowName: deps.workflow.name,
      workflowVersion: deps.workflow.version,
      agentId: deps.agent.id,
      policyId: deps.policy.id,
      policyVersion: deps.policy.version,
      modelVersion: `${deps.agent.model.model} / ${deps.agent.model.visionModel}`,
      promptVersion: deps.agent.promptVersion,
      channel: input.channel,
      status: "awaiting_consent",
      ownerType: "ai",
      createdAt: now,
      costTotal: 0,
      customerLabel: input.customerLabel,
      scenario: input.scenario,
      evidenceMode: input.evidenceMode ?? "live_only",
    },
    participants: [],
    transcript: [],
    visualEvents: [],
    observations: [],
    toolActions: [],
    workflow: { currentStep: null, history: [], attempts: {}, facts: {}, toolFacts: {} },
    instruction: { text: "Review the privacy notice to start", from: "system", at: now },
    customerState: "consent",
    media: { camera: false, microphone: false, quality: "good", facing: "environment" },
    notes: [],
    audit: [],
    costs: [],
  };
  const ctx = new Ctx(state, deps, { type: "system", id: "orchestrator", name: "System" });
  ctx.audit("session.created", { channel: input.channel, workflow: `${deps.workflow.key}@v${deps.workflow.version}` });
  return ctx.finish().state;
}

// ---------------------------------------------------------------------------
// Command handling
// ---------------------------------------------------------------------------

const TERMINAL = new Set(["completed", "failed"]);

export function handleCommand(state: SessionState, command: Command, actor: Actor, deps: OrchestratorDeps): CommandResult {
  if (TERMINAL.has(state.session.status) && command.type !== "human.note") {
    return { state, effects: [], error: "Session has ended" };
  }
  const ctx = new Ctx(structuredClone(state), deps, actor);
  const error = dispatch(ctx, command);
  if (error) {
    // A rejected command changes nothing except the audit trail: policy
    // decisions that refused an action must still be reconstructable.
    const newAudit = ctx.s.audit.slice(state.audit.length);
    if (newAudit.length === 0) return { state, effects: [], error };
    const next = structuredClone(state);
    next.audit.push(...newAudit);
    next.seq += 1;
    return { state: next, effects: [], error };
  }
  return ctx.finish();
}

function dispatch(ctx: Ctx, cmd: Command): string | undefined {
  const s = ctx.s;
  switch (cmd.type) {
    case "customer.consent": {
      if (s.session.status !== "awaiting_consent") return "Consent already recorded";
      if (!cmd.accepted) {
        ctx.audit("session.consent_recorded", { accepted: false });
        ctx.endSession("customer_abandoned", "Customer declined privacy notice");
        return;
      }
      s.consent = { acceptedAt: ctx.now, noticeVersion: cmd.noticeVersion, evidenceMode: s.session.evidenceMode };
      ctx.audit("session.consent_recorded", { accepted: true, noticeVersion: cmd.noticeVersion });
      s.session.status = "active";
      s.session.startedAt = ctx.now;
      ctx.addParticipant("customer", s.session.customerLabel);
      ctx.addParticipant("ai", ctx.deps.agent.name);
      ctx.audit("session.started", {});
      ctx.audit("workflow.started", { workflowId: ctx.deps.workflow.id, version: ctx.deps.workflow.version });
      ctx.enterStep(ctx.deps.workflow.startStep);
      return;
    }

    case "media.update": {
      const before = s.media;
      const after = { ...before, ...cmd.media };
      if (before.camera !== after.camera) ctx.audit(after.camera ? "media.camera_enabled" : "media.camera_disabled", {});
      if (before.microphone !== after.microphone) {
        ctx.audit(after.microphone ? "media.microphone_enabled" : "media.microphone_disabled", {});
      }
      if (before.quality !== after.quality) {
        const degraded = after.quality === "poor" || after.quality === "lost";
        ctx.audit(degraded ? "media.connection_degraded" : "media.connection_restored", { quality: after.quality });
        if (degraded) ctx.audit("session.degraded", { quality: after.quality });
      }
      s.media = after;
      return;
    }

    case "customer.utterance": {
      if (s.session.status === "awaiting_consent") return "Session not started";
      const t = ctx.addTranscript("customer", s.session.customerLabel, cmd.text, cmd.confidence ?? 1);
      if (cmd.speech) ctx.speechCost(cmd.speech.provider, cmd.speech.audioSeconds);
      else ctx.cost("speech_to_text", "browser-asr", 1, "turn");
      if (detectHumanRequest(cmd.text)) {
        ctx.escalate("customer_requested", "Customer asked to speak to a person", "medium");
        return;
      }
      if (s.session.ownerType === "ai" && s.session.status === "active") {
        ctx.audit("ai.turn_started", { transcriptId: t.id });
        ctx.effects.push({ type: "interpret_utterance", transcriptId: t.id });
      }
      return;
    }

    case "customer.request_human": {
      if (s.escalation || s.session.ownerType === "human") return;
      ctx.addTranscript("system", "System", "Customer pressed “Human help”.", 1);
      ctx.escalate("customer_requested", "Customer pressed the Human help button", "medium");
      return;
    }

    case "utterance.interpreted": {
      const t = s.transcript.find((x) => x.id === cmd.transcriptId);
      if (!t) return "Unknown transcript event";
      t.intent = cmd.intent;
      ctx.cost("llm_turn", ctx.deps.agent.model.provider, 1, "turn", cmd.usage);
      ctx.audit("ai.turn_completed", { transcriptId: t.id, intent: cmd.intent });
      if (cmd.customerIssue && !s.workflow.customerIssue) s.workflow.customerIssue = cmd.customerIssue;
      if (cmd.intent === "human_request") {
        ctx.escalate("customer_requested", "Customer asked to speak to a person", "medium");
        return;
      }
      if (s.session.ownerType !== "ai" || s.session.status !== "active") return;
      const step = ctx.currentStep();
      if (!step) return;
      if (step.type === "question" || step.type === "guidance") {
        s.workflow.intent = cmd.intent;
        const rule = selectNext(step, ctx.facts(cmd.intent));
        if (rule) {
          ctx.completeStep(rule.label);
          ctx.audit("workflow.branch_selected", { from: step.key, to: rule.to, rule: rule.label });
          ctx.enterStep(rule.to);
        } else {
          ctx.say(cmd.reply ?? `Sorry, I didn't quite catch that. ${step.instruction}`);
        }
        return;
      }
      if (cmd.reply) ctx.say(cmd.reply);
      return;
    }

    case "utterance.failed": {
      ctx.audit("ai.failure", { stage: "utterance", error: cmd.error });
      ctx.escalate("ai_model_failure", `Reasoning unavailable: ${cmd.error}`, "high");
      return;
    }

    case "frame.captured": {
      if (s.session.status === "awaiting_consent") return "Session not started";
      const req = s.evidenceRequest;
      const ve = {
        id: ctx.deps.id("frm"),
        sessionId: s.session.id,
        triggerType: cmd.trigger,
        timestamp: ctx.now,
        frameReference: cmd.frameReference,
        checkpoint: req?.checkpoint,
        stepKey: req?.stepKey,
        width: cmd.width,
        height: cmd.height,
        bytes: cmd.bytes,
        processingStatus: "pending",
      } satisfies VisualEvent as VisualEvent;
      s.visualEvents.push(ve);
      ctx.audit("media.frame_selected", {
        visualEventId: ve.id,
        trigger: cmd.trigger,
        checkpoint: ve.checkpoint ?? null,
        bytes: cmd.bytes,
      });
      // Only frames that answer an evidence request are sent for inference (docs/05 §3).
      if (req) {
        ve.processingStatus = "analysing";
        s.evidenceRequest = undefined;
        s.customerState = s.session.ownerType === "ai" ? "analysing" : "human_connected";
        ctx.effects.push({ type: "interpret_evidence", visualEventId: ve.id });
      }
      return;
    }

    case "evidence.interpreted": {
      const ve = s.visualEvents.find((v) => v.id === cmd.visualEventId);
      if (!ve) return "Unknown visual event";
      ve.processingStatus = "analysed";
      ctx.cost("vision_inference", ctx.deps.agent.model.provider, 1, "frame", cmd.usage);
      const created: VisualObservation[] = cmd.observations.map((o) => ({
        id: ctx.deps.id("obs"),
        visualEventId: ve.id,
        sessionId: s.session.id,
        observationType: o.observationType,
        value: o.value,
        observationText: o.observationText,
        confidence: clamp01(o.confidence),
        status: o.status,
        requiresConfirmation: o.requiresConfirmation,
        recommendedNextAction: o.recommendedNextAction,
        modelVersion: cmd.modelVersion,
        timestamp: ctx.now,
      }));
      s.observations.push(...created);
      for (const o of created) {
        ctx.audit("ai.observation_created", {
          observationId: o.id,
          visualEventId: ve.id,
          type: o.observationType,
          value: o.value ?? null,
          status: o.status,
          confidence: o.confidence,
          latencyMs: cmd.latencyMs,
        });
        if (!["confirmed_visible", "likely_visible", "not_visible"].includes(o.status)) {
          ctx.audit("ai.uncertain", { observationId: o.id, status: o.status, confidence: o.confidence });
        }
      }

      // Sensitive visual data is governed by tenant policy (docs/06 §4), never by the model.
      const sensitive = created.find((o) => o.observationType === "sensitive_content" && o.value);
      if (sensitive && s.session.status === "active") {
        const category = SENSITIVE_CATEGORY[sensitive.value!];
        const handling = ctx.deps.policy.sensitiveData.find((d) => d.category === category)?.handling ?? "avoid_capture";
        ctx.audit("policy.check", { check: "sensitive_content", category: category ?? sensitive.value, handling });
        if (handling === "escalate") {
          ctx.escalate("safety_policy", `Sensitive content in frame (${sensitive.value!.replace(/_/g, " ")}) requires a person`, "high");
          return;
        }
        if (handling === "avoid_capture" && s.session.ownerType === "ai") {
          const step = ctx.currentStep();
          if (step?.type === "visual_request" && ve.stepKey === step.key) {
            const attempts = (s.workflow.attempts[step.key] ?? 1) + 1;
            if (attempts > (step.maxAttempts ?? ctx.deps.policy.maxCaptureAttempts)) {
              ctx.escalate("safety_policy", "Sensitive content kept appearing in frame", "medium");
              return;
            }
            s.workflow.attempts[step.key] = attempts;
            ctx.say(`For your privacy, please point the camera only at the equipment and keep any ${sensitive.value!.replace(/_/g, " ")}s out of view.`);
            ctx.requestEvidence(step, "another_angle", attempts, "uncertainty_confirmation");
            s.customerState = "need_another_angle";
            return;
          }
        }
      }

      // After takeover the AI acts as copilot only: observations are shown, workflow does not move.
      if (s.session.ownerType !== "ai" || s.session.status !== "active") return;
      const step = ctx.currentStep();
      if (!step || step.type !== "visual_request" || ve.stepKey !== step.key) return;

      const assessment = assessEvidence(step, created, ctx.deps.workflow.defaultConfidenceThreshold);
      if (assessment.kind === "sufficient") {
        for (const o of assessment.accepted) if (o.value) s.workflow.facts[o.observationType] = o.value;
        const rule = selectNext(step, ctx.facts());
        if (cmd.reply) ctx.say(cmd.reply);
        if (!rule) {
          ctx.audit("workflow.failed", { step: step.key, reason: "No branch matched accepted evidence" });
          ctx.failStep("No branch matched");
          ctx.escalate("workflow_failure", `No approved branch for observed state at "${step.title}"`, "medium");
          return;
        }
        ctx.completeStep(rule.label);
        ctx.audit("workflow.branch_selected", { from: step.key, to: rule.to, rule: rule.label });
        ctx.enterStep(rule.to);
        return;
      }

      // Insufficient evidence: never silently continue (docs/03 §6).
      const attempts = s.workflow.attempts[step.key] ?? 1;
      const max = Math.min(step.maxAttempts ?? ctx.deps.policy.maxCaptureAttempts, ctx.deps.policy.maxCaptureAttempts);
      if (attempts >= max) {
        const failure = step.onFailure ?? { to: undefined, reason: "low_visual_confidence" as const };
        ctx.audit("workflow.failed", { step: step.key, reason: "evidence_insufficient", attempts });
        ctx.failStep(`Evidence unclear after ${attempts} attempts`);
        if (failure.to) {
          ctx.enterStep(failure.to, {
            reason: failure.reason,
            detail: `Could not confirm ${describeMissing(assessment)} after ${attempts} capture attempts`,
          });
        } else {
          ctx.escalate(failure.reason, `Evidence unclear after ${attempts} attempts`, "medium");
        }
        return;
      }
      s.workflow.attempts[step.key] = attempts + 1;
      const closer = assessment.recommendation === "closer";
      const text =
        cmd.reply ??
        (closer
          ? "I can't quite make that out. Could you move a little closer and hold the phone steady?"
          : "I can't see that clearly from this angle. Could you try a slightly different angle, avoiding any glare?");
      ctx.say(text);
      ctx.requestEvidence(step, closer ? "closer" : "another_angle", attempts + 1, "uncertainty_confirmation");
      s.customerState = closer ? "need_closer_view" : "need_another_angle";
      return;
    }

    case "evidence.failed": {
      const ve = s.visualEvents.find((v) => v.id === cmd.visualEventId);
      if (ve) ve.processingStatus = "failed";
      ctx.audit("media.frame_failed", { visualEventId: cmd.visualEventId, error: cmd.error });
      ctx.audit("ai.failure", { stage: "vision", error: cmd.error });
      if (s.session.ownerType === "ai") ctx.escalate("ai_model_failure", `Visual analysis unavailable: ${cmd.error}`, "high");
      return;
    }

    case "tool.completed":
    case "tool.failed": {
      const action = s.toolActions.find((a) => a.id === cmd.toolActionId);
      if (!action) return "Unknown tool action";
      action.completedAt = ctx.now;
      if (cmd.outcome) {
        // Audit-safe call record: provider, latency, status and the client's reference only.
        action.outcome = cmd.outcome;
        ctx.audit("integration.called", { toolActionId: action.id, tool: action.toolName, ...cmd.outcome });
      }
      if (cmd.type === "tool.completed") {
        action.status = "completed";
        action.result = cmd.result;
        ctx.audit("tool.completed", { toolActionId: action.id, tool: action.toolName, result: cmd.result });
        for (const [k, v] of Object.entries(cmd.result)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            s.workflow.toolFacts[`${action.toolName}.${k}`] = String(v);
          }
        }
      } else {
        action.status = "failed";
        action.error = cmd.error;
        ctx.audit("tool.failed", { toolActionId: action.id, tool: action.toolName, error: cmd.error });
      }
      ctx.cost("workflow_action", action.toolName, 1, "call");

      const step = ctx.currentStep();
      const drivesWorkflow =
        action.requestedBy === "ai" &&
        s.session.ownerType === "ai" &&
        s.session.status === "active" &&
        step?.type === "business_action" &&
        action.stepKey === step.key;
      if (!drivesWorkflow || !step) return;

      if (cmd.type === "tool.failed") {
        ctx.failStep(`Action failed: ${cmd.error}`);
        const to = step.onFailure?.to;
        if (to) ctx.enterStep(to, { reason: step.onFailure!.reason, detail: `${step.title} failed: ${cmd.error}` });
        else ctx.escalate("workflow_failure", `${step.title} failed: ${cmd.error}`, "high");
        return;
      }
      const rule = selectNext(step, ctx.facts());
      if (!rule) {
        ctx.failStep("No branch matched action result");
        ctx.escalate("workflow_failure", `Unexpected result from ${action.toolName}`, "medium");
        return;
      }
      ctx.completeStep(rule.label);
      ctx.audit("workflow.branch_selected", { from: step.key, to: rule.to, rule: rule.label });
      ctx.enterStep(rule.to);
      return;
    }

    case "human.join": {
      if (s.participants.some((p) => p.userId === ctx.actor.id && !p.leftAt)) return "Already joined";
      ctx.addParticipant("human_agent", ctx.actor.name, ctx.actor.id);
      if (s.escalation && !s.escalation.acceptedAt) {
        s.escalation.acceptedAt = ctx.now;
        s.escalation.assignedUserId = ctx.actor.id;
        s.escalation.assignedUserName = ctx.actor.name;
      }
      ctx.audit("human.joined", { userId: ctx.actor.id });
      ctx.addTranscript("system", "System", `${ctx.actor.name} from the support team joined.`, 1);
      if (s.escalation) s.customerState = "human_connected";
      return;
    }

    case "human.take_over": {
      if (s.session.ownerType === "human") return "Already human-owned";
      if (!s.participants.some((p) => p.userId === ctx.actor.id && !p.leftAt)) {
        ctx.addParticipant("human_agent", ctx.actor.name, ctx.actor.id);
        ctx.audit("human.joined", { userId: ctx.actor.id });
      }
      if (!s.escalation) ctx.escalate("agent_initiated", "Agent took over without an AI escalation", "low", { silent: true });
      if (s.escalation && !s.escalation.acceptedAt) {
        s.escalation.acceptedAt = ctx.now;
        s.escalation.assignedUserId = ctx.actor.id;
        s.escalation.assignedUserName = ctx.actor.name;
      }
      s.session.ownerType = "human";
      s.session.status = "human_active";
      s.evidenceRequest = undefined;
      s.customerState = "human_connected";
      ctx.audit("human.took_over", { userId: ctx.actor.id, atStep: s.workflow.currentStep });
      const first = ctx.actor.name.split(" ")[0];
      ctx.addTranscript("human_agent", ctx.actor.name, `Hi, it's ${first}. I've got everything you've shown so far, so let's carry on from here.`, 1);
      s.instruction = { text: `${first} from the support team is helping you`, from: "human", at: ctx.now };
      return;
    }

    case "human.message": {
      if (!cmd.text.trim()) return "Empty message";
      const t = ctx.addTranscript("human_agent", ctx.actor.name, cmd.text.trim(), 1);
      s.instruction = { text: t.text, from: "human", at: ctx.now };
      return;
    }

    case "human.request_capture": {
      s.evidenceRequest = {
        id: ctx.deps.id("evr"),
        stepKey: undefined,
        checkpoint: "human_request",
        prompt: cmd.prompt,
        view: "detail",
        attempt: 1,
        maxAttempts: 1,
        reason: "human",
        trigger: "human_request",
        requestedBy: "human",
        requestedAt: ctx.now,
      };
      const t = ctx.addTranscript("human_agent", ctx.actor.name, cmd.prompt, 1);
      s.evidenceRequest.prompt = t.text;
      s.instruction = { text: t.text, from: "human", at: ctx.now };
      s.customerState = "show_object";
      return;
    }

    case "human.note": {
      if (!cmd.text.trim()) return "Empty note";
      s.notes.push({ id: ctx.deps.id("note"), authorId: ctx.actor.id, authorName: ctx.actor.name, text: cmd.text.trim(), timestamp: ctx.now });
      ctx.audit("human.note_added", { length: cmd.text.length });
      return;
    }

    case "human.review_observation": {
      const o = s.observations.find((x) => x.id === cmd.observationId);
      if (!o) return "Unknown observation";
      o.humanReview = { userId: ctx.actor.id, verdict: cmd.verdict, at: ctx.now };
      ctx.audit("human.observation_reviewed", { observationId: o.id, verdict: cmd.verdict });
      if (cmd.verdict === "confirmed" && o.value) s.workflow.facts[o.observationType] = o.value;
      if (cmd.verdict === "rejected" && s.workflow.facts[o.observationType] === o.value) delete s.workflow.facts[o.observationType];
      return;
    }

    case "human.run_action": {
      if (s.session.ownerType !== "human") return "Take over the session before running actions";
      return ctx.requestTool(cmd.tool, cmd.params, "human");
    }

    case "human.return_to_ai": {
      if (s.session.ownerType !== "human") return "Session is not human-owned";
      const allowed = canReturnToAi(ctx.deps.policy, s.escalation);
      ctx.audit("policy.check", { check: "return_to_ai", allowed: allowed.allowed, reason: allowed.reason });
      if (!allowed.allowed) return allowed.reason;
      const resume = cmd.resumeStep ?? resumableStep(ctx);
      if (!resume) return "No workflow step to resume";
      if (s.escalation) s.escalation.resolution = `Returned to AI at "${resume}"`;
      s.escalation = undefined;
      s.session.ownerType = "ai";
      s.session.status = "active";
      ctx.audit("human.returned_to_ai", { resumeStep: resume });
      ctx.addTranscript("human_agent", ctx.actor.name, "I'll hand you back to the assistant to finish off. I'll stay on the line.", 1);
      ctx.enterStep(resume);
      return;
    }

    case "human.leave": {
      const p = s.participants.find((x) => x.userId === ctx.actor.id && !x.leftAt);
      if (!p) return "Not in session";
      p.leftAt = ctx.now;
      ctx.audit("human.left", { userId: ctx.actor.id });
      return;
    }

    case "session.end": {
      const outcome = cmd.outcome ?? defaultOutcome(ctx);
      ctx.endSession(outcome, cmd.reason ?? `Ended by ${ctx.actor.type}`);
      return;
    }

    case "system.tick": {
      if (s.session.status !== "active" || s.session.ownerType !== "ai" || !s.session.startedAt) return;
      const elapsed = (Date.parse(ctx.now) - Date.parse(s.session.startedAt)) / 1000;
      const max = Math.min(ctx.deps.workflow.maxAiDurationSec, ctx.deps.policy.maxAiDurationSec);
      if (elapsed > max) ctx.escalate("max_ai_duration", `AI session exceeded ${Math.round(max / 60)} minutes`, "medium");
      return;
    }
  }
}

const SENSITIVE_CATEGORY: Record<string, Policy["sensitiveData"][number]["category"]> = {
  person: "bystanders",
  child: "children",
  payment_card: "payment_cards",
  identity_document: "identity_documents",
  computer_screen: "computer_screens",
  confidential_document: "confidential_documents",
  vehicle_plate: "vehicle_plates",
};

function resumableStep(ctx: Ctx): string | undefined {
  // Resume at the last non-escalation step the AI was working on.
  const history = [...ctx.s.workflow.history].reverse();
  for (const h of history) {
    const step = ctx.deps.workflow.steps.find((x) => x.key === h.stepKey);
    if (step && step.type !== "human_escalation" && step.type !== "start") return step.key;
  }
  return undefined;
}

function defaultOutcome(ctx: Ctx): SessionOutcome {
  const s = ctx.s;
  if (s.session.outcome) return s.session.outcome;
  if (ctx.actor.type === "human_agent") return "resolved_by_human";
  if (s.escalation) return "escalated_unresolved";
  return "customer_abandoned";
}

function describeMissing(a: { missing: string[]; uncertain: VisualObservation[] }): string {
  const names = [...a.missing, ...a.uncertain.map((o) => o.observationType)];
  return [...new Set(names)].map((n) => n.replace(/_/g, " ")).join(", ") || "required evidence";
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

// ---------------------------------------------------------------------------
// Mutable command context
// ---------------------------------------------------------------------------

class Ctx {
  effects: Effect[] = [];
  readonly now: string;
  constructor(
    public s: SessionState,
    public deps: OrchestratorDeps,
    public actor: Actor,
  ) {
    this.now = deps.now();
  }

  finish(): CommandResult {
    this.s.seq += 1;
    this.s.session.costTotal = round4(this.s.costs.reduce((sum, c) => sum + c.estimatedCost, 0));
    return { state: this.s, effects: this.effects };
  }

  audit(eventType: DomainEventType, payload: Record<string, unknown>, actor: Actor = this.actor) {
    const e: AuditEvent = {
      id: this.deps.id("aud"),
      tenantId: this.s.session.tenantId,
      sessionId: this.s.session.id,
      actorType: actor.type,
      actorId: actor.id,
      eventType,
      payload,
      timestamp: this.now,
      context: {
        workflowVersion: this.deps.workflow.version,
        policyVersion: this.deps.policy.version,
        modelVersion: this.s.session.modelVersion,
        promptVersion: this.deps.agent.promptVersion,
      },
    };
    this.s.audit.push(e);
  }

  /**
   * Record a cost. When the provider reported token usage for a priced model
   * the cost is "measured"; otherwise it is an "estimated" unit-rate cost.
   */
  cost(category: CostEvent["category"], provider: string, quantity: number, unit: CostEvent["unit"], usage?: ModelUsage) {
    const measured = usage ? measuredModelCost(usage) : undefined;
    this.s.costs.push({
      id: this.deps.id("cst"),
      sessionId: this.s.session.id,
      provider: usage && measured ? `${provider}:${usage.model}` : provider,
      category,
      quantity,
      unit,
      estimatedCost: measured ? round6(measured.gbp) : round4(COST_RATES[category] * quantity),
      currency: "GBP",
      timestamp: this.now,
      basis: measured ? "measured" : "estimated",
      ...(usage ? { usage } : {}),
    });
  }

  /** Server speech-to-text: one customer turn, priced from its audio duration. */
  speechCost(provider: string, audioSeconds: number) {
    const seconds = Math.max(0, Math.round(audioSeconds * 10) / 10);
    const gbp = speechToTextCost(provider, seconds);
    this.s.costs.push({
      id: this.deps.id("cst"),
      sessionId: this.s.session.id,
      provider,
      category: "speech_to_text",
      quantity: 1,
      unit: "turn",
      estimatedCost: gbp === undefined ? COST_RATES.speech_to_text : round6(gbp),
      currency: "GBP",
      timestamp: this.now,
      basis: "estimated",
      audioSeconds: seconds,
    });
  }

  addParticipant(type: "customer" | "ai" | "human_agent", name: string, userId?: string) {
    this.s.participants.push({
      id: this.deps.id("ptc"),
      sessionId: this.s.session.id,
      type,
      userId,
      displayName: name,
      joinedAt: this.now,
    });
  }

  addTranscript(speaker: Speaker, name: string, text: string, confidence: number) {
    const t: TranscriptEvent = { id: this.deps.id("utt"), sessionId: this.s.session.id, speaker, speakerName: name, timestamp: this.now, text, confidence };
    // Customer and agent text is free-form: remove personal data before it is stored (docs/06 §3).
    if (speaker === "customer" || speaker === "human_agent") {
      const r = redactPii(text);
      if (r.total > 0) {
        t.text = r.text;
        t.redactions = r.redactions;
      }
    }
    this.s.transcript.push(t);
    if (t.redactions) this.audit("privacy.redacted", {
        transcriptId: t.id,
        speaker,
        types: t.redactions.map((x) => x.type).join(", "),
        count: t.redactions.reduce((n, x) => n + x.count, 0),
      });
    return t;
  }

  /** AI speech: transcript + current instruction + TTS cost. */
  say(text: string) {
    this.addTranscript("ai", this.deps.agent.name, text, 1);
    this.s.instruction = { text, from: "ai", at: this.now };
    this.cost("text_to_speech", this.deps.agent.voice.provider, text.length, "character");
  }

  currentStep(): WorkflowStep | undefined {
    const key = this.s.workflow.currentStep;
    return key ? this.deps.workflow.steps.find((x) => x.key === key) : undefined;
  }

  facts(intent?: string): StepFacts {
    return { intent: intent ?? this.s.workflow.intent, observations: this.s.workflow.facts, toolResults: this.s.workflow.toolFacts };
  }

  activeRecord(): StepRecord | undefined {
    const h = this.s.workflow.history;
    const last = h[h.length - 1];
    return last && last.status === "active" ? last : undefined;
  }

  completeStep(outcome: string) {
    const rec = this.activeRecord();
    if (!rec) return;
    rec.status = "completed";
    rec.completedAt = this.now;
    rec.outcome = outcome;
    this.audit("workflow.step_completed", { step: rec.stepKey, outcome });
  }

  failStep(outcome: string) {
    const rec = this.activeRecord();
    if (!rec) return;
    rec.status = "failed";
    rec.completedAt = this.now;
    rec.outcome = outcome;
  }

  enterStep(key: string, escalationOverride?: { reason: EscalationReasonCode; detail: string }) {
    const step = getStep(this.deps.workflow, key);
    const s = this.s;
    s.workflow.currentStep = key;
    s.workflow.intent = undefined;
    s.workflow.history.push({ stepKey: key, title: step.title, enteredAt: this.now, status: "active" });
    this.audit("workflow.step_entered", { step: key, type: step.type });

    switch (step.type) {
      case "start":
        this.say(step.instruction);
        this.completeStep("Started");
        this.enterStep(selectNext(step, this.facts())!.to);
        return;
      case "question":
        this.say(step.instruction);
        s.customerState = "conversation";
        return;
      case "guidance":
        this.say(step.instruction);
        s.customerState = "guidance";
        return;
      case "visual_request": {
        const attempts = (s.workflow.attempts[key] ?? 0) + 1;
        s.workflow.attempts[key] = attempts;
        const max = Math.min(step.maxAttempts ?? this.deps.policy.maxCaptureAttempts, this.deps.policy.maxCaptureAttempts);
        if (attempts > max) {
          this.failStep("Capture attempts exhausted");
          const failure = step.onFailure;
          if (failure) this.enterStep(failure.to, { reason: failure.reason, detail: `Capture attempts exhausted at ${step.title}` });
          else this.escalate("repeated_capture_failure", `Capture attempts exhausted at ${step.title}`, "medium");
          return;
        }
        this.say(step.instruction);
        this.requestEvidence(step, "initial", attempts, "workflow_checkpoint");
        s.customerState = "show_object";
        return;
      }
      case "business_action": {
        this.say(step.instruction);
        s.customerState = "waiting_action";
        const err = this.requestTool(step.action!.tool, step.action!.params, "ai", step.key);
        if (err) {
          this.failStep(err);
          const to = step.onFailure?.to;
          if (to) this.enterStep(to, { reason: "workflow_failure", detail: err });
          else this.escalate("workflow_failure", err, "high");
        }
        return;
      }
      case "human_escalation": {
        const esc = step.escalation!;
        this.say(step.instruction);
        this.escalate(
          escalationOverride?.reason ?? esc.reason,
          escalationOverride?.detail ?? step.title,
          esc.severity,
          { humanOnly: esc.humanOnly, alreadyAnnounced: true },
        );
        return;
      }
      case "completion": {
        this.say(step.instruction);
        this.completeStep("Completed");
        this.audit("workflow.completed", { outcome: step.completion!.outcome });
        s.customerState = "resolved";
        s.session.outcome = step.completion!.outcome;
        return;
      }
    }
  }

  requestEvidence(step: WorkflowStep, reason: EvidenceRequest["reason"], attempt: number, trigger: FrameTrigger) {
    const ev = step.evidence!;
    const prompt =
      reason === "closer" ? "Move a little closer and hold steady" : reason === "another_angle" ? "Try a different angle, avoiding glare" : step.customerPrompt;
    this.s.evidenceRequest = {
      id: this.deps.id("evr"),
      stepKey: step.key,
      checkpoint: ev.checkpoint,
      prompt,
      view: ev.view,
      attempt,
      maxAttempts: step.maxAttempts ?? this.deps.policy.maxCaptureAttempts,
      reason,
      trigger,
      requestedBy: "ai",
      requestedAt: this.now,
    };
    this.audit("ai.visual_request", { step: step.key, checkpoint: ev.checkpoint, reason, attempt });
  }

  requestTool(tool: string, params: Record<string, string | number | boolean>, by: "ai" | "human", stepKey?: string): string | undefined {
    const s = this.s;
    const decision = checkTool(this.deps.policy, tool, by);
    this.audit("policy.check", { check: "tool", tool, actor: by, decision: decision.decision, reason: decision.reason });
    const idempotencyKey = `${s.session.id}:${stepKey ?? "manual"}:${tool}:${stableParams(params)}`;
    const base: Omit<ToolAction, "status"> = {
      id: this.deps.id("act"),
      sessionId: s.session.id,
      toolName: tool,
      idempotencyKey,
      request: params,
      requestedBy: by,
      stepKey,
      startedAt: this.now,
    };
    if (decision.decision !== "allow") {
      s.toolActions.push({ ...base, status: "denied", completedAt: this.now, error: decision.reason });
      this.audit("tool.denied", { tool, reason: decision.reason });
      if (decision.decision === "requires_human" && by === "ai") {
        this.escalate("human_only_step", decision.reason, "medium", { humanOnly: true });
        return undefined;
      }
      return decision.reason;
    }
    const dup = findDuplicate(s.toolActions, idempotencyKey);
    if (dup) {
      this.audit("tool.duplicate_blocked", { tool, idempotencyKey, existing: dup.id });
      return by === "human" ? `Already requested (${dup.status})` : undefined;
    }
    s.toolActions.push({ ...base, status: "running" });
    this.audit("tool.requested", { toolActionId: base.id, tool, idempotencyKey, actor: by });
    this.audit("workflow.action_requested", { tool, step: stepKey ?? null });
    this.effects.push({ type: "execute_tool", toolActionId: base.id });
    return undefined;
  }

  escalate(
    reason: EscalationReasonCode,
    detail: string,
    severity: EscalationSeverity,
    opts: { humanOnly?: boolean; alreadyAnnounced?: boolean; silent?: boolean } = {},
  ) {
    const s = this.s;
    if (s.escalation) return;
    const mandatory = Boolean(opts.humanOnly) || isMandatoryHuman(this.deps.policy, reason);
    s.escalation = {
      id: this.deps.id("esc"),
      sessionId: s.session.id,
      reason,
      reasonDetail: detail,
      severity,
      requestedAt: this.now,
      mandatoryHuman: mandatory,
    };
    s.session.escalationReason = reason;
    s.evidenceRequest = undefined;
    if (s.session.status === "active") s.session.status = "escalated";
    this.audit(reason === "customer_requested" ? "human.requested" : "ai.escalation_requested", { reason, detail, severity, mandatory });
    this.audit("human.queued", { escalationId: s.escalation.id });
    this.effects.push({ type: "notify_human_queue", escalationId: s.escalation.id });
    if (opts.silent) return;
    if (!opts.alreadyAnnounced) {
      this.say(
        reason === "customer_requested"
          ? "Of course. I'm connecting you to a member of the team now. They'll see everything we've covered, so you won't need to repeat yourself."
          : "I'm bringing in a member of the team to help. They'll see everything we've covered, so you won't need to start again.",
      );
    }
    s.customerState = "escalating";
    s.instruction = { text: "Connecting you to a person — please stay on the line", from: "system", at: this.now };
  }

  endSession(outcome: SessionOutcome, reason: string) {
    const s = this.s;
    const rec = this.activeRecord();
    if (rec) {
      rec.status = outcome.startsWith("resolved") ? "completed" : "abandoned";
      rec.completedAt = this.now;
      rec.outcome = rec.outcome ?? reason;
    }
    if (s.session.startedAt) {
      const minutes = Math.max(1, Math.ceil((Date.parse(this.now) - Date.parse(s.session.startedAt)) / 60000));
      this.cost("media", "webrtc-sfu", minutes, "minute");
    }
    s.session.status = outcome === "failed" ? "failed" : "completed";
    s.session.outcome = outcome;
    s.session.endedAt = this.now;
    s.evidenceRequest = undefined;
    if (s.escalation && !s.escalation.resolution) s.escalation.resolution = outcome;
    for (const p of s.participants) if (!p.leftAt) p.leftAt = this.now;
    s.customerState = "ended";
    s.instruction = { text: "Session ended", from: "system", at: this.now };
    this.audit(outcome === "failed" ? "session.failed" : "session.completed", { outcome, reason });
  }
}

function stableParams(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
