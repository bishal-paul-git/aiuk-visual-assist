import type { SessionState } from "@/lib/domain/session";
import type { EvidenceInput, ReasoningProvider, UtteranceInput } from "./types";

/**
 * Chooses the reasoning provider per session: sessions created with a
 * simulation scenario always use the simulator (deterministic tests, demos);
 * live sessions use the configured model provider when one is available.
 */
export class RoutingReasoningProvider implements ReasoningProvider {
  readonly id = "routing";
  readonly simulated: boolean;

  constructor(
    private readonly simulator: ReasoningProvider,
    private readonly live?: ReasoningProvider & { modelVersion?: string },
  ) {
    this.simulated = !live;
  }

  get liveAvailable(): boolean {
    return Boolean(this.live);
  }

  get liveModel(): string | undefined {
    return this.live?.modelVersion;
  }

  isSimulatedFor(state: SessionState): boolean {
    return Boolean(state.session.scenario) || !this.live;
  }

  private pick(state: SessionState): ReasoningProvider {
    return !state.session.scenario && this.live ? this.live : this.simulator;
  }

  interpretUtterance(input: UtteranceInput) {
    return this.pick(input.state).interpretUtterance(input);
  }

  interpretEvidence(input: EvidenceInput) {
    return this.pick(input.state).interpretEvidence(input);
  }
}
