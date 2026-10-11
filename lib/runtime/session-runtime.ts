import type { SessionState } from "@/lib/domain/session";
import type { AuditEvent, DomainEventType, SessionChannel, WorkflowDefinition } from "@/lib/domain/types";
import { agents, getPolicy, getTenant, getWorkflow, tenants } from "@/lib/config/catalog";
import {
  createSession,
  handleCommand,
  type Actor,
  type Command,
  type Effect,
  type OrchestratorDeps,
} from "@/lib/session/orchestrator";
import { canReturnToAi } from "@/lib/policy/engine";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { expectedIntents } from "@/lib/workflow/engine";
import { RoutingReasoningProvider } from "@/lib/providers/routing";
import type { ReasoningProvider, ToolExecutor } from "@/lib/providers/types";
import { applyRetention, type RetentionRun } from "@/lib/privacy/retention";
import { toAgentView, toCustomerView, toSummary, type AgentView, type CustomerView, type SessionSummaryView } from "@/lib/session/projections";

/** Web Crypto is available in modern browsers and Node 20+, so the engine runs in both. */
function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function randomToken(bytes = 18): string {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface SessionSnapshot {
  state: SessionState;
  token: string;
  workflowId: string;
  live: boolean;
}

/**
 * Session runtime (POC). Hosts the authoritative session state in-process,
 * executes orchestrator effects through provider interfaces, and fans state
 * out to subscribers (SSE). In production this is replaced by a horizontally
 * scalable orchestrator service with a durable event store (docs/07 §3); the
 * orchestrator logic itself does not change.
 */

interface Entry {
  state: SessionState;
  token: string;
  deps: OrchestratorDeps;
  workflow: WorkflowDefinition;
  live: boolean;
  listeners: Set<() => void>;
}

export interface StoredFrame {
  sessionId: string;
  mime: string;
  data: Uint8Array;
  createdAt: number;
}

export const MAX_FRAME_BYTES = 750_000;

/** Outcome of the retention job, for the Settings › Retention panel. */
export interface RetentionStatus {
  lastRunAt: string;
  lastPurgeAt?: string;
  /** Cumulative counts per tenant since the runtime started. */
  byTenant: Record<string, { sessions: number; frames: number; transcriptEvents: number; lastPurgeAt?: string }>;
}

export class SessionRuntime {
  private sessions = new Map<string, Entry>();
  private tokens = new Map<string, string>();
  private frames = new Map<string, StoredFrame>();
  private previews = new Map<string, { mime: string; data: Uint8Array; at: number }>();
  private globalListeners = new Set<() => void>();
  private referenceCounter = 12460;
  /** Called after any change made by this runtime (used for persistence / cross-tab sync). */
  onCommit?: (sessionId: string) => void;

  constructor(
    private readonly reasoning: ReasoningProvider,
    private readonly tools: ToolExecutor,
  ) {}

  /** Whether sessions without a simulation scenario run on a real model. */
  get liveReasoning(): { available: boolean; model?: string } {
    const r = this.reasoning;
    return r instanceof RoutingReasoningProvider ? { available: r.liveAvailable, model: r.liveModel } : { available: !r.simulated };
  }

  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------

  depsFor(workflow: WorkflowDefinition): OrchestratorDeps {
    const policy = getPolicy(workflow.policyId);
    const agent = agents.find((a) => a.workflowIds.includes(workflow.id)) ?? agents.find((a) => a.tenantId === workflow.tenantId);
    if (!policy || !agent) throw new Error(`Workflow ${workflow.id} has no policy/agent configured`);
    return { now: () => new Date().toISOString(), id: (p) => `${p}_${uuid().slice(0, 12)}`, workflow, policy, agent };
  }

  nextReference(): string {
    this.referenceCounter += 1;
    return `VA-${this.referenceCounter}`;
  }

  create(input: {
    workflowId?: string;
    workflowKey?: string;
    tenantId?: string;
    channel: SessionChannel;
    customerLabel: string;
    scenario?: string;
  }): { id: string; token: string } {
    // New sessions start on the current published version; running sessions stay pinned to theirs.
    const workflow =
      input.workflowKey && input.tenantId
        ? getWorkflowRegistry().latestPublished(input.tenantId, input.workflowKey)
        : input.workflowId
          ? getWorkflow(input.workflowId)
          : undefined;
    if (!workflow) throw new Error("Unknown workflow");
    if (workflow.status !== "published") throw new Error(`Workflow ${workflow.name} v${workflow.version} is not published`);
    if (!input.scenario && !this.liveReasoning.available) throw new Error("Live AI is not configured; choose a simulation scenario");
    const deps = this.depsFor(workflow);
    const id = `ses_${uuid().slice(0, 8)}`;
    const state = createSession(
      {
        id,
        reference: this.nextReference(),
        tenantId: workflow.tenantId,
        channel: input.channel,
        customerLabel: input.customerLabel,
        scenario: input.scenario,
        evidenceMode: getTenant(workflow.tenantId)?.retention.evidenceMode,
      },
      deps,
    );
    const token = randomToken();
    this.register(state, { token, workflow, live: true });
    this.onCommit?.(id);
    return { id, token };
  }

  register(state: SessionState, opts: { token: string; workflow: WorkflowDefinition; live: boolean }) {
    this.sessions.set(state.session.id, {
      state,
      token: opts.token,
      deps: this.depsFor(opts.workflow),
      workflow: opts.workflow,
      live: opts.live,
      listeners: new Set(),
    });
    this.tokens.set(opts.token, state.session.id);
    const n = Number(state.session.reference.replace(/\D/g, ""));
    if (n > this.referenceCounter) this.referenceCounter = n;
  }

  snapshot(sessionId: string): SessionSnapshot | undefined {
    const e = this.sessions.get(sessionId);
    return e ? { state: e.state, token: e.token, workflowId: e.workflow.id, live: e.live } : undefined;
  }

  /** Apply a snapshot produced elsewhere (another tab). Newer sequence numbers win. */
  importSnapshot(snap: SessionSnapshot): boolean {
    const existing = this.sessions.get(snap.state.session.id);
    if (existing) {
      if (snap.state.seq <= existing.state.seq) return false;
      existing.state = snap.state;
      this.notify(existing);
      return true;
    }
    const workflow = getWorkflow(snap.workflowId);
    if (!workflow) return false;
    this.register(snap.state, { token: snap.token, workflow, live: snap.live });
    this.notifyGlobal();
    return true;
  }

  liveSessionIds(): string[] {
    return [...this.sessions.values()].filter((e) => e.live).map((e) => e.state.session.id);
  }

  // -------------------------------------------------------------------------
  // Commands and effects
  // -------------------------------------------------------------------------

  dispatch(sessionId: string, command: Command, actor: Actor): { error?: string; state?: SessionState } {
    const entry = this.sessions.get(sessionId);
    if (!entry) return { error: "Session not found" };
    const result = handleCommand(entry.state, command, actor, entry.deps);
    const changed = result.state !== entry.state;
    entry.state = result.state;
    if (changed) {
      this.notify(entry);
      this.onCommit?.(sessionId);
    }
    for (const effect of result.effects) void this.runEffect(entry, effect);
    return { error: result.error, state: entry.state };
  }

  private async runEffect(entry: Entry, effect: Effect) {
    const id = entry.state.session.id;
    const ai: Actor = { type: "ai", id: entry.deps.agent.id, name: entry.deps.agent.name };
    const system: Actor = { type: "system", id: "runtime", name: "Runtime" };
    try {
      switch (effect.type) {
        case "interpret_utterance": {
          const s = entry.state;
          const utterance = s.transcript.find((t) => t.id === effect.transcriptId);
          if (!utterance) return;
          const step = s.workflow.currentStep ? entry.workflow.steps.find((x) => x.key === s.workflow.currentStep) : undefined;
          try {
            const r = await this.reasoning.interpretUtterance({ state: s, utterance, workflow: entry.workflow, step, expectedIntents: expectedIntents(step) });
            this.dispatch(id, { type: "utterance.interpreted", transcriptId: utterance.id, ...r }, ai);
          } catch (e) {
            this.dispatch(id, { type: "utterance.failed", transcriptId: utterance.id, error: (e as Error).message }, system);
          }
          return;
        }
        case "interpret_evidence": {
          const s = entry.state;
          const ve = s.visualEvents.find((v) => v.id === effect.visualEventId);
          if (!ve) return;
          const step = ve.stepKey ? entry.workflow.steps.find((x) => x.key === ve.stepKey) : undefined;
          const frame = this.getFrame(id, ve.frameReference);
          try {
            const r = await this.reasoning.interpretEvidence({
              state: s,
              visualEvent: ve,
              workflow: entry.workflow,
              step,
              frame: frame ? { mime: frame.mime, data: frame.data } : undefined,
            });
            this.dispatch(id, { type: "evidence.interpreted", visualEventId: ve.id, ...r }, ai);
          } catch (e) {
            this.dispatch(id, { type: "evidence.failed", visualEventId: ve.id, error: (e as Error).message }, system);
          }
          return;
        }
        case "execute_tool": {
          const action = entry.state.toolActions.find((a) => a.id === effect.toolActionId);
          if (!action) return;
          try {
            const result = await this.tools.execute(action, { tenantId: entry.state.session.tenantId, scenario: entry.state.session.scenario });
            this.dispatch(id, { type: "tool.completed", toolActionId: action.id, result }, system);
          } catch (e) {
            this.dispatch(id, { type: "tool.failed", toolActionId: action.id, error: (e as Error).message }, system);
          }
          return;
        }
        case "notify_human_queue":
          // Queue routing/notification integration point (team skills, SLAs).
          this.notifyGlobal();
          return;
      }
    } catch (e) {
      console.error(`[runtime] effect ${effect.type} failed for ${id}`, e);
    }
  }

  tick() {
    for (const entry of this.sessions.values()) {
      const s = entry.state.session;
      if (entry.live && s.status === "active" && s.ownerType === "ai") {
        this.dispatch(s.id, { type: "system.tick" }, { type: "system", id: "scheduler", name: "Scheduler" });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Frames (selected evidence + low-rate preview relay)
  // -------------------------------------------------------------------------

  storeFrame(sessionId: string, mime: string, data: Uint8Array): string {
    const frameId = `mem_${uuid().slice(0, 12)}`;
    const frame = { sessionId, mime, data, createdAt: Date.now() };
    this.frames.set(frameId, frame);
    this.onFrameStored?.(frameId, frame);
    return frameId;
  }

  /** Resolve a frame reference ("mem:<id>") to stored bytes, scoped to its session. */
  getFrame(sessionId: string, frameReference: string): StoredFrame | undefined {
    if (!frameReference.startsWith("mem:")) return undefined;
    const frameId = frameReference.slice(4);
    const f = this.frames.get(frameId) ?? this.frameLoader?.(sessionId, frameId);
    return f && f.sessionId === sessionId ? f : undefined;
  }

  setPreview(sessionId: string, mime: string, data: Uint8Array) {
    this.previews.set(sessionId, { mime, data, at: Date.now() });
  }

  getPreview(sessionId: string) {
    const p = this.previews.get(sessionId);
    // Previews are live-only; never serve stale imagery.
    if (!p || Date.now() - p.at > 10_000) return undefined;
    return p;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  get(sessionId: string): Entry | undefined {
    return this.sessions.get(sessionId);
  }

  idForToken(token: string): string | undefined {
    return this.tokens.get(token);
  }

  tokenFor(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.token;
  }

  customerView(sessionId: string): CustomerView | undefined {
    const e = this.sessions.get(sessionId);
    if (!e) return undefined;
    const tenant = getTenant(e.state.session.tenantId);
    return toCustomerView(
      e.state,
      { name: tenant?.brand.displayName ?? "Support", color: tenant?.brand.primaryColor ?? "#1D5BD8" },
      tenant?.retention.evidenceMode ?? "live_only",
    );
  }

  agentView(sessionId: string): AgentView | undefined {
    const e = this.sessions.get(sessionId);
    if (!e) return undefined;
    const tenant = getTenant(e.state.session.tenantId);
    return toAgentView(e.state, e.workflow, {
      live: e.live,
      previewAvailable: Boolean(this.getPreview(sessionId)),
      tenantName: tenant?.name ?? e.state.session.tenantId,
      allowedHumanTools: e.deps.policy.tools.filter((t) => t.mode !== "deny").map((t) => ({ tool: t.tool, risk: t.risk, mode: t.mode })),
      returnToAiAllowed: canReturnToAi(e.deps.policy, e.state.escalation),
      simulatedProvider: this.reasoning instanceof RoutingReasoningProvider ? this.reasoning.isSimulatedFor(e.state) : this.reasoning.simulated,
    });
  }

  summaries(filter: { tenantId?: string } = {}): SessionSummaryView[] {
    return [...this.sessions.values()]
      .filter((e) => !filter.tenantId || e.state.session.tenantId === filter.tenantId)
      .map((e) => toSummary(e.state, e.workflow, e.live))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  states(filter: { tenantId?: string } = {}): SessionState[] {
    return [...this.sessions.values()]
      .filter((e) => !filter.tenantId || e.state.session.tenantId === filter.tenantId)
      .map((e) => e.state);
  }

  // -------------------------------------------------------------------------
  // Retention (docs/06 §3). Policy logic lives in lib/privacy/retention.ts;
  // this only applies its result to the hosted sessions and the frame store.
  // -------------------------------------------------------------------------

  retentionStatus?: RetentionStatus;

  runRetention(now = Date.now()): RetentionRun {
    const entries = [...this.sessions.values()];
    const policies = Object.fromEntries(tenants.map((t) => [t.id, t.retention]));
    const run = applyRetention(
      entries.map((e) => e.state),
      policies,
      now,
    );
    run.states.forEach((state, i) => {
      const entry = entries[i];
      if (state === entry.state) return;
      entry.state = state;
      this.notify(entry);
      this.onCommit?.(state.session.id);
    });
    for (const { sessionId, frameReference } of run.purgedFrames) {
      if (!frameReference.startsWith("mem:")) continue;
      const frameId = frameReference.slice(4);
      this.frames.delete(frameId);
      this.onFrameDeleted?.(sessionId, frameId);
    }
    const byTenant = { ...this.retentionStatus?.byTenant };
    for (const p of run.purges) {
      const t = (byTenant[p.tenantId] = { ...(byTenant[p.tenantId] ?? { sessions: 0, frames: 0, transcriptEvents: 0 }) });
      t.sessions += 1;
      t.frames += p.framesPurged;
      t.transcriptEvents += p.transcriptEventsPurged;
      t.lastPurgeAt = run.ranAt;
    }
    this.retentionStatus = { lastRunAt: run.ranAt, lastPurgeAt: run.purges.length ? run.ranAt : this.retentionStatus?.lastPurgeAt, byTenant };
    return run;
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  subscribe(sessionId: string, fn: () => void): () => void {
    const e = this.sessions.get(sessionId);
    if (!e) return () => {};
    e.listeners.add(fn);
    return () => e.listeners.delete(fn);
  }

  subscribeAll(fn: () => void): () => void {
    this.globalListeners.add(fn);
    return () => this.globalListeners.delete(fn);
  }

  private notify(entry: Entry) {
    for (const fn of entry.listeners) fn();
    this.notifyGlobal();
  }

  private notifyGlobal() {
    for (const fn of this.globalListeners) fn();
  }

  // -------------------------------------------------------------------------
  // Persistence & integration hooks (server edition; see lib/server/store)
  // -------------------------------------------------------------------------

  /** Called after a selected-evidence frame is stored (used to persist it). */
  onFrameStored?: (frameId: string, frame: StoredFrame) => void;
  /** Called when retention deletes a frame, so durable copies are deleted too. */
  onFrameDeleted?: (sessionId: string, frameId: string) => void;
  /** Fallback for frames not held in memory (e.g. read lazily from a durable store). */
  frameLoader?: (sessionId: string, frameId: string) => StoredFrame | undefined;

  /** Put a previously persisted frame back into memory. */
  restoreFrame(frameId: string, frame: StoredFrame) {
    this.frames.set(frameId, frame);
  }

  allSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  /**
   * Append an audit event raised outside the orchestrator (e.g. link delivery
   * by an integration). The state is replaced, not mutated, and the sequence
   * number advances so snapshots and subscribers see the change.
   */
  recordAudit(sessionId: string, eventType: DomainEventType, payload: Record<string, unknown>, actor: Actor): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    const event: AuditEvent = {
      id: `aud_${uuid().slice(0, 12)}`,
      tenantId: entry.state.session.tenantId,
      sessionId,
      actorType: actor.type,
      actorId: actor.id,
      eventType,
      payload,
      timestamp: new Date().toISOString(),
      context: {
        workflowVersion: entry.workflow.version,
        policyVersion: entry.deps.policy.version,
        modelVersion: entry.state.session.modelVersion,
        promptVersion: entry.deps.agent.promptVersion,
      },
    };
    entry.state = { ...entry.state, audit: [...entry.state.audit, event], seq: entry.state.seq + 1 };
    this.notify(entry);
    this.onCommit?.(sessionId);
    return true;
  }
}

