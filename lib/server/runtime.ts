import { randomBytes, randomUUID } from "node:crypto";
import type { SessionState } from "@/lib/domain/session";
import type { SessionChannel, WorkflowDefinition } from "@/lib/domain/types";
import { agents, getPolicy, getTenant, getWorkflow } from "@/lib/config/catalog";
import {
  createSession,
  handleCommand,
  type Actor,
  type Command,
  type Effect,
  type OrchestratorDeps,
} from "@/lib/session/orchestrator";
import { canReturnToAi } from "@/lib/policy/engine";
import { expectedIntents } from "@/lib/workflow/engine";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import type { ReasoningProvider, ToolExecutor } from "@/lib/providers/types";
import { toAgentView, toCustomerView, toSummary, type AgentView, type CustomerView, type SessionSummaryView } from "@/lib/session/projections";
import { seedSessions } from "./seed";

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

interface StoredFrame {
  sessionId: string;
  mime: string;
  data: Uint8Array;
  createdAt: number;
}

export const MAX_FRAME_BYTES = 750_000;

export class SessionRuntime {
  private sessions = new Map<string, Entry>();
  private tokens = new Map<string, string>();
  private frames = new Map<string, StoredFrame>();
  private previews = new Map<string, { mime: string; data: Uint8Array; at: number }>();
  private globalListeners = new Set<() => void>();
  private referenceCounter = 12460;

  constructor(
    private readonly reasoning: ReasoningProvider,
    private readonly tools: ToolExecutor,
  ) {}

  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------

  depsFor(workflow: WorkflowDefinition): OrchestratorDeps {
    const policy = getPolicy(workflow.policyId);
    const agent = agents.find((a) => a.workflowIds.includes(workflow.id)) ?? agents.find((a) => a.tenantId === workflow.tenantId);
    if (!policy || !agent) throw new Error(`Workflow ${workflow.id} has no policy/agent configured`);
    return { now: () => new Date().toISOString(), id: (p) => `${p}_${randomUUID().slice(0, 12)}`, workflow, policy, agent };
  }

  nextReference(): string {
    this.referenceCounter += 1;
    return `VA-${this.referenceCounter}`;
  }

  create(input: { workflowId: string; channel: SessionChannel; customerLabel: string; scenario?: string }): { id: string; token: string } {
    const workflow = getWorkflow(input.workflowId);
    if (!workflow) throw new Error("Unknown workflow");
    if (workflow.status !== "published") throw new Error(`Workflow ${workflow.name} v${workflow.version} is not published`);
    const deps = this.depsFor(workflow);
    const id = `ses_${randomUUID().slice(0, 8)}`;
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
    const token = randomBytes(18).toString("base64url");
    this.register(state, { token, workflow, live: true });
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

  // -------------------------------------------------------------------------
  // Commands and effects
  // -------------------------------------------------------------------------

  dispatch(sessionId: string, command: Command, actor: Actor): { error?: string; state?: SessionState } {
    const entry = this.sessions.get(sessionId);
    if (!entry) return { error: "Session not found" };
    const result = handleCommand(entry.state, command, actor, entry.deps);
    const changed = result.state !== entry.state;
    entry.state = result.state;
    if (changed) this.notify(entry);
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
    const frameId = `mem_${randomUUID().slice(0, 12)}`;
    this.frames.set(frameId, { sessionId, mime, data, createdAt: Date.now() });
    return frameId;
  }

  /** Resolve a frame reference ("mem:<id>") to stored bytes, scoped to its session. */
  getFrame(sessionId: string, frameReference: string): StoredFrame | undefined {
    if (!frameReference.startsWith("mem:")) return undefined;
    const f = this.frames.get(frameReference.slice(4));
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
      simulatedProvider: this.reasoning.simulated,
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
}

const GLOBAL_KEY = "__aiukVisualAssistRuntime";

/** Process-wide singleton (survives dev hot reloads). */
export function getRuntime(): SessionRuntime {
  const g = globalThis as unknown as Record<string, SessionRuntime | undefined>;
  let rt = g[GLOBAL_KEY];
  if (!rt) {
    rt = new SessionRuntime(new MockReasoningProvider(), new MockToolExecutor());
    seedSessions(rt);
    const timer = setInterval(() => rt!.tick(), 10_000);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    g[GLOBAL_KEY] = rt;
  }
  return rt;
}
