import type { ToolAction, ToolCallOutcome } from "@/lib/domain/types";
import type { ToolExecutionContext, ToolExecutor } from "@/lib/providers/types";
import { ToolCallError } from "./contract";
import type { ConnectorRegistry } from "./config";
import { BuiltinToolExecutor } from "./builtin";

/**
 * Picks the executor per tenant and tool (server edition):
 * - no connector, or mode "simulated" → the sandbox executor (the default);
 * - mode "builtin" → the platform's own records (BuiltinToolExecutor);
 * - mode "http" → the client's endpoint through HttpToolExecutor;
 * - an invalid connector entry → the call fails closed (never silently simulated).
 *
 * Simulation-scenario sessions stay on the sandbox unless the connector opts
 * in with includeScenarioSessions, mirroring RoutingReasoningProvider. That
 * applies to built-in connectors too, so scripted demos never create records.
 * The static demo build does not use this class at all.
 */
export class RoutingToolExecutor implements ToolExecutor {
  readonly id = "routing-tools";

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly simulated: ToolExecutor,
    private readonly http: ToolExecutor & Required<Pick<ToolExecutor, "executeWithOutcome">>,
    private readonly opts: {
      now?: () => number;
      observe?: (outcome: ToolCallOutcome, info: { tenantId: string; tool: string }) => void;
      builtin?: ToolExecutor & Required<Pick<ToolExecutor, "executeWithOutcome">>;
    } = {},
  ) {
    this.builtin = opts.builtin ?? new BuiltinToolExecutor(opts.now);
  }

  private readonly builtin: ToolExecutor & Required<Pick<ToolExecutor, "executeWithOutcome">>;

  /** Which executor a call would use. */
  route(tenantId: string, tool: string, scenario?: string): "simulated" | "builtin" | "http" | "invalid" {
    const r = this.registry.resolve(tenantId, tool);
    if (r.kind === "invalid") return "invalid";
    if (r.kind === "default" || r.config.mode === "simulated") return "simulated";
    if (scenario && !r.config.includeScenarioSessions) return "simulated";
    return r.config.mode;
  }

  async execute(action: ToolAction, ctx: ToolExecutionContext): Promise<Record<string, unknown>> {
    return (await this.executeWithOutcome(action, ctx)).result;
  }

  async executeWithOutcome(action: ToolAction, ctx: ToolExecutionContext): Promise<{ result: Record<string, unknown>; outcome: ToolCallOutcome }> {
    const info = { tenantId: ctx.tenantId, tool: action.toolName };
    try {
      const r = await this.dispatch(action, ctx);
      this.opts.observe?.(r.outcome, info);
      return r;
    } catch (e) {
      if (e instanceof ToolCallError) this.opts.observe?.(e.outcome, info);
      throw e;
    }
  }

  private async dispatch(action: ToolAction, ctx: ToolExecutionContext) {
    const now = this.opts.now ?? Date.now;
    const route = this.route(ctx.tenantId, action.toolName, ctx.scenario);
    if (route === "http") return this.http.executeWithOutcome(action, ctx);
    if (route === "builtin") return this.builtin.executeWithOutcome(action, ctx);
    if (route === "invalid") {
      throw new ToolCallError(`The ${action.toolName} connector is misconfigured`, {
        provider: "http",
        mode: "http",
        status: "failed",
        latencyMs: 0,
        attempts: 0,
        errorCode: "connector_invalid",
      });
    }
    const started = now();
    const outcome = (status: ToolCallOutcome["status"], errorCode?: string): ToolCallOutcome => ({
      provider: this.simulated.id,
      mode: "simulated",
      status,
      latencyMs: now() - started,
      attempts: 1,
      ...(errorCode ? { errorCode } : {}),
    });
    try {
      const result = await this.simulated.execute(action, ctx);
      return { result, outcome: outcome("succeeded") };
    } catch (e) {
      throw new ToolCallError((e as Error).message, outcome("failed", "simulated_failure"));
    }
  }
}
