import type { SessionState } from "@/lib/domain/session";
import type { SessionChannel } from "@/lib/domain/types";
import {
  createSession,
  handleCommand,
  type Actor,
  type Command,
  type Effect,
  type OrchestratorDeps,
} from "@/lib/session/orchestrator";
import { simulateEvidence, simulateUtterance } from "@/lib/providers/mock/reasoning";
import { simulateTool } from "@/lib/providers/mock/tools";
import { getScenario } from "@/lib/providers/mock/scenarios";
import { expectedIntents } from "@/lib/workflow/engine";

export const CUSTOMER: Actor = { type: "customer", id: "customer", name: "Customer" };
export const AI: Actor = { type: "ai", id: "ai", name: "AI" };
export const SYSTEM: Actor = { type: "system", id: "runtime", name: "Runtime" };

/**
 * Synchronous harness: applies commands and resolves effects immediately using
 * the simulated providers, with a controllable clock. Used for deterministic
 * tests and for generating seed history through the real orchestrator.
 */
export class SimulationHarness {
  state: SessionState;
  clock: number;
  private counter = 0;
  readonly deps: OrchestratorDeps;
  errors: string[] = [];

  constructor(
    base: Omit<OrchestratorDeps, "now" | "id">,
    opts: { id: string; reference: string; tenantId: string; scenario?: string; channel?: SessionChannel; customerLabel?: string; startAt: number },
  ) {
    this.clock = opts.startAt;
    const idPrefix = opts.id.replace(/^ses_/, "");
    this.deps = {
      ...base,
      now: () => new Date(this.clock).toISOString(),
      id: (prefix) => `${prefix}_${idPrefix}_${(++this.counter).toString(36)}`,
    };
    this.state = createSession(
      {
        id: opts.id,
        reference: opts.reference,
        tenantId: opts.tenantId,
        channel: opts.channel ?? "secure_link",
        customerLabel: opts.customerLabel ?? "Customer",
        scenario: opts.scenario,
      },
      this.deps,
    );
  }

  advance(seconds: number) {
    this.clock += Math.round(seconds * 1000);
  }

  send(command: Command, actor: Actor = CUSTOMER): string | undefined {
    const result = handleCommand(this.state, command, actor, this.deps);
    this.state = result.state;
    if (result.error) {
      this.errors.push(`${command.type}: ${result.error}`);
      return result.error;
    }
    for (const effect of result.effects) this.resolve(effect);
    return undefined;
  }

  private resolve(effect: Effect) {
    const s = this.state;
    switch (effect.type) {
      case "interpret_utterance": {
        this.advance(1.2);
        const utterance = s.transcript.find((t) => t.id === effect.transcriptId)!;
        const step = s.workflow.currentStep ? this.deps.workflow.steps.find((x) => x.key === s.workflow.currentStep) : undefined;
        const r = simulateUtterance({ state: s, utterance, workflow: this.deps.workflow, step, expectedIntents: expectedIntents(step) });
        this.send({ type: "utterance.interpreted", transcriptId: utterance.id, ...r }, AI);
        return;
      }
      case "interpret_evidence": {
        this.advance(1.6);
        const ve = s.visualEvents.find((v) => v.id === effect.visualEventId)!;
        try {
          const r = simulateEvidence({ state: s, visualEvent: ve, workflow: this.deps.workflow });
          this.send({ type: "evidence.interpreted", visualEventId: ve.id, ...r, latencyMs: 1600 }, AI);
        } catch (e) {
          this.send({ type: "evidence.failed", visualEventId: ve.id, error: (e as Error).message }, SYSTEM);
        }
        return;
      }
      case "execute_tool": {
        const action = s.toolActions.find((a) => a.id === effect.toolActionId)!;
        this.advance(action.toolName === "line_test" ? 3 : 1);
        try {
          this.send({ type: "tool.completed", toolActionId: action.id, result: simulateTool(action, s.session.scenario) }, SYSTEM);
        } catch (e) {
          this.send({ type: "tool.failed", toolActionId: action.id, error: (e as Error).message }, SYSTEM);
        }
        return;
      }
      case "notify_human_queue":
        return;
    }
  }

  /** Capture a frame for the active evidence request using a synthetic reference. */
  capture() {
    const req = this.state.evidenceRequest;
    const lights = getScenario(this.state.session.scenario);
    const after = this.state.workflow.history.some((h) => h.status === "completed" && h.stepKey.startsWith("guide_"));
    const view = req?.view ?? "front";
    const l = after ? lights.lightsAfter : lights.lightsBefore;
    const ref = `synthetic:${view}:${l.power}-${l.internet}-${l.wifi}:${lights.broadbandCable}`;
    this.send({
      type: "frame.captured",
      trigger: req?.trigger ?? "customer_capture",
      frameReference: ref,
      width: 640,
      height: 480,
      bytes: 38_000 + Math.round(Math.random() * 12_000),
      evidenceRequestId: req?.id,
    });
  }

  /**
   * Simulated customer: responds to whatever the session is asking for until
   * the AI resolves or escalates (or `maxTurns` is hit).
   */
  runCustomer(opts: { issue?: string; maxTurns?: number } = {}) {
    const sc = getScenario(this.state.session.scenario);
    for (let turn = 0; turn < (opts.maxTurns ?? 30); turn++) {
      const s = this.state;
      if (s.session.status !== "active" && s.session.status !== "awaiting_consent") return;
      this.advance(4 + (turn % 3) * 3);
      if (s.customerState === "consent") {
        this.send({ type: "media.update", media: { camera: true, microphone: true } });
        this.send({ type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" });
        continue;
      }
      if (s.customerState === "resolved") return;
      if (s.evidenceRequest) {
        this.advance(5);
        this.capture();
        continue;
      }
      const step = s.workflow.currentStep;
      if (step === "intake") {
        this.send({ type: "customer.utterance", text: opts.issue ?? "My internet isn't working. The router lights look different.", confidence: 0.93 });
      } else if (s.customerState === "guidance") {
        this.advance(40);
        this.send({ type: "customer.utterance", text: "Okay, done.", confidence: 0.95 });
      } else if (step === "confirm_working") {
        this.advance(20);
        this.send({ type: "customer.utterance", text: sc.confirmsWorking ? "Yes, it's working now, thanks!" : "No, still nothing.", confidence: 0.94 });
      } else {
        return;
      }
    }
  }
}
