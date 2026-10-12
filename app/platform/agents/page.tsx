import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { agents as allAgents, getPolicy, getWorkflow, tenantName } from "@/lib/config/catalog";
import { computeMetrics } from "@/lib/analytics/metrics";
import { pct } from "@/lib/format";
import { Badge, KeyValue, PageHeader, Panel, Stat } from "@/components/ui/primitives";
import { SimulatedTag, WorkflowStatusBadge } from "@/components/domain/badges";
import { withinDays } from "@/components/platform/config-data";
import { Chips, ConfigStatusBadge, FieldLabel, Mono, Note } from "@/components/platform/config-ui";

export const metadata = { title: "AI Agents" };

function providerLabel(provider: string): { label: string; simulated: boolean; browser: boolean } {
  if (provider === "mock") return { label: "Simulated (mock provider)", simulated: true, browser: false };
  if (provider === "browser") return { label: "Browser-native", simulated: false, browser: true };
  return { label: provider, simulated: false, browser: false };
}

export default async function AgentsPage() {
  const scope = await platformScope("platform.access", "/platform/agents");
  const agents = scope.filter(allAgents);
  const all = withinDays(scope.states(), 14);
  const simulatedCount = agents.filter((a) => a.model.provider === "mock").length;

  return (
    <>
      <PageHeader
        title="AI Agents"
        description="Agent configurations bind a reasoning and vision model, a voice, languages, a prompt version, policies and workflows for one client. The model never decides policy; it runs inside the workflow and policy assigned here."
        meta={
          <>
            <Badge tone="neutral">{agents.length} agents</Badge>
            {simulatedCount > 0 && <SimulatedTag label={`${simulatedCount} on simulated provider`} />}
          </>
        }
      />

      <Note icon={<FlaskConical className="size-3.5" />} className="mb-4">
        <span className="font-medium text-ink">Provider status:</span> every agent currently runs on the <Mono>mock</Mono> provider —{" "}
        <Mono>aiuk-reasoning-sim-1</Mono> and <Mono>aiuk-vision-sim-1</Mono> are scenario-driven simulations behind the ReasoningProvider interface, not real model
        output. Speech uses the customer&apos;s browser (Web Speech / speechSynthesis). Real provider selection is a Phase 2+ decision (docs/02 §7).
      </Note>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active agents" value={agents.filter((a) => a.status === "active").length} hint={`${agents.filter((a) => a.status === "draft").length} draft`} />
        <Stat label="Clients covered" value={new Set(agents.map((a) => a.tenantId)).size} />
        <Stat label="Sessions handled (14 d)" value={computeMetrics(all).sessions} hint={scope.allClients ? "All agents" : scope.label} />
        <Stat label="Real model providers" value={agents.filter((a) => a.model.provider !== "mock").length} hint="Simulated until Phase 2" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {agents.map((a) => {
          const states = all.filter((s) => s.session.agentId === a.id);
          const m = computeMetrics(states);
          const model = providerLabel(a.model.provider);
          const voice = providerLabel(a.voice.provider);
          return (
            <Panel
              key={a.id}
              title={a.name}
              description={`${tenantName(a.tenantId)} · version ${a.version}`}
              actions={
                <>
                  {model.simulated && <SimulatedTag />}
                  <ConfigStatusBadge status={a.status} />
                </>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Models</FieldLabel>
                  <KeyValue
                    className="mt-1.5"
                    items={[
                      ["Provider", model.simulated ? <Badge tone="neutral" className="border-dashed">{model.label}</Badge> : model.label],
                      ["Reasoning model", <Mono key="m">{a.model.model}</Mono>],
                      ["Vision model", <Mono key="v">{a.model.visionModel}</Mono>],
                      ["Prompt version", <Mono key="p">{a.promptVersion}</Mono>],
                    ]}
                  />
                </div>
                <div>
                  <FieldLabel>Voice & language</FieldLabel>
                  <KeyValue
                    className="mt-1.5"
                    items={[
                      ["Voice provider", voice.label],
                      ["Voice", <Mono key="vo">{a.voice.voiceId}</Mono>],
                      ["Speaking rate", `${a.voice.speakingRate.toFixed(2)}×`],
                      ["Languages", `${a.language.primary} primary${a.language.supported.length > 1 ? ` · ${a.language.supported.filter((l) => l !== a.language.primary).join(", ")}` : ""}`],
                    ]}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Policies</FieldLabel>
                  <ul className="mt-1.5 space-y-1 text-[13px]">
                    {a.policyIds.map((id) => {
                      const p = getPolicy(id);
                      return (
                        <li key={id} className="flex flex-wrap items-center gap-2">
                          <Link href="/platform/policies" className="text-brand hover:underline">
                            {p ? `${p.name} v${p.version}` : id}
                          </Link>
                          {p && <ConfigStatusBadge status={p.status} />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <FieldLabel>Workflows</FieldLabel>
                  <ul className="mt-1.5 space-y-1 text-[13px]">
                    {a.workflowIds.map((id) => {
                      const w = getWorkflow(id);
                      return (
                        <li key={id} className="flex flex-wrap items-center gap-2">
                          <Link href={`/platform/workflows/${id}`} className="text-brand hover:underline">
                            {w ? `${w.name} v${w.version}` : id}
                          </Link>
                          {w && <WorkflowStatusBadge status={w.status} />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
                <span>
                  Last 14 days: <span className="tabular font-medium text-ink">{m.sessions}</span> sessions
                  {m.completed > 0 && (
                    <>
                      {" "}
                      · AI resolution <span className="tabular font-medium text-ink">{pct(m.aiResolutionRate)}</span> · uncertain observations{" "}
                      <span className="tabular font-medium text-ink">{pct(m.uncertainObservationRate)}</span>
                    </>
                  )}
                </span>
                <Chips items={[a.id]} mono />
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
