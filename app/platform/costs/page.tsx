import Link from "next/link";
import { Info } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { tenants } from "@/lib/config/catalog";
import type { CostEvent } from "@/lib/domain/types";
import { COST_RATES } from "@/lib/domain/pricing";
import { computeMetrics, costByCategory, dailySeries } from "@/lib/analytics/metrics";
import { formatDay, formatGBP, pct } from "@/lib/format";
import { Badge, Meter, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { BarList } from "@/components/charts/bar-list";
import { withinDays } from "@/components/platform/config-data";
import { FieldLabel, Mono, Note } from "@/components/platform/config-ui";

export const metadata = { title: "Cost Centre" };

const CATEGORY: Record<CostEvent["category"], { label: string; unit: string }> = {
  media: { label: "Real-time media", unit: "participant-minute" },
  speech_to_text: { label: "Speech to text", unit: "customer turn" },
  text_to_speech: { label: "Text to speech", unit: "character" },
  vision_inference: { label: "Vision inference", unit: "analysed frame" },
  llm_turn: { label: "Reasoning turns", unit: "turn" },
  workflow_action: { label: "Workflow actions", unit: "integration call" },
};

const PACKAGING: { title: string; items: string[] }[] = [
  { title: "Implementation", items: ["Discovery", "Workflow design", "Configuration", "Integration", "Testing", "Rollout"] },
  { title: "Platform fee", items: ["Tenant & portal", "Analytics & QA", "Workflow management", "Admin & monitoring"] },
  { title: "Usage", items: ["Per session", "Per minute", "Per successful resolution", "Bundled usage"] },
  { title: "Enterprise add-ons", items: ["SSO", "Dedicated environment", "Custom residency", "Enhanced support & SLA", "Advanced analytics", "Custom integrations"] },
];

function rate(n: number): string {
  return n < 0.001 ? `£${n.toFixed(6)}` : formatGBP(n, 3);
}

export default async function CostsPage() {
  const rt = await platformRuntime();
  const states = withinDays(rt.states(), 14);
  const m = computeMetrics(states);
  const categories = costByCategory(states);
  const series = dailySeries(states, 14);
  const vision = categories.find((c) => c.category === "vision_inference")?.cost ?? 0;
  const measuredEvents = states.flatMap((s) => s.costs.filter((c) => c.basis === "measured"));
  const measured = measuredEvents.reduce((n, c) => n + c.estimatedCost, 0);
  const measuredTokens = measuredEvents.reduce((n, c) => n + (c.usage ? c.usage.inputTokens + c.usage.outputTokens + c.usage.cacheCreationInputTokens + c.usage.cacheReadInputTokens : 0), 0);
  const perClient = tenants.map((t) => {
    const tm = computeMetrics(states.filter((s) => s.session.tenantId === t.id));
    return { tenant: t, m: tm };
  });

  return (
    <>
      <PageHeader
        title="Cost Centre"
        description="Per-interaction cost attribution from metered session events: media minutes, speech turns, analysed frames, reasoning turns and integration calls."
        meta={
          <>
            <Badge tone="neutral">Last 14 days · GBP</Badge>
            {measured > 0 ? <Badge tone="brand">Partly measured</Badge> : <Badge tone="warn">Estimated</Badge>}
          </>
        }
      />

      <Note className="mb-4" icon={<Info className="size-3.5" />}>
        Model costs on <span className="font-medium text-ink">live AI</span> sessions are <span className="font-medium text-ink">measured</span>: priced from the
        token usage the model provider reports on each call, at the list prices in <Mono>lib/domain/pricing.ts</Mono>. Everything else is an{" "}
        <span className="font-medium text-ink">estimate</span>: metered quantities are real session events, multiplied by placeholder unit rates until provider
        contracts are agreed. Simulated providers incur no actual spend.
      </Note>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total cost" value={formatGBP(m.costTotal)} hint={`${m.sessions} sessions`} />
        <Stat label="Cost per session" value={m.sessions ? formatGBP(m.costPerSession, 3) : "—"} />
        <Stat label="Cost per resolution" value={m.aiResolved + m.humanResolved ? formatGBP(m.costPerResolution, 3) : "—"} hint={`${m.aiResolved + m.humanResolved} resolved`} />
        <Stat label="Cost per AI resolution" value={m.aiResolved ? formatGBP(m.costTotal / m.aiResolved, 3) : "—"} hint="All cost ÷ AI-resolved sessions" />
        <Stat label="Vision share" value={m.costTotal ? pct(vision / m.costTotal) : "—"} hint={`${m.avgFramesPerSession.toFixed(1)} frames / session`} />
        <Stat
          label="Measured model cost"
          value={measured > 0 ? formatGBP(measured, 4) : "—"}
          hint={measured > 0 ? `${measuredEvents.length} live calls · ${measuredTokens.toLocaleString("en-GB")} tokens` : "No live AI calls in this period"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Cost by category" className="xl:col-span-2" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Unit rate</Th>
                <Th align="right">Cost</Th>
                <Th className="w-1/4">Share</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const share = m.costTotal ? c.cost / m.costTotal : 0;
                return (
                  <tr key={c.category}>
                    <Td className="font-medium text-ink">{CATEGORY[c.category].label}</Td>
                    <Td align="right">
                      {Math.round(c.quantity).toLocaleString("en-GB")} <span className="text-xs text-muted">{c.unit}s</span>
                    </Td>
                    <Td align="right">
                      {rate(COST_RATES[c.category])} <span className="text-xs text-muted">/ {CATEGORY[c.category].unit}</span>
                    </Td>
                    <Td align="right">{formatGBP(c.cost)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Meter value={share} label={`${CATEGORY[c.category].label} ${pct(share)} of cost`} />
                        <span className="tabular w-10 text-right text-xs text-ink-2">{pct(share)}</span>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {categories.length === 0 && (
                <tr>
                  <Td className="text-muted">No metered events in this period.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Daily cost" description="Estimated, by session start day">
          <BarList rows={[...series].reverse().map((d) => ({ label: formatDay(d.day), value: d.cost, hint: `${d.sessions} sessions` }))} format={(n) => formatGBP(n)} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Cost by client" className="xl:col-span-2" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th align="right">Sessions</Th>
                <Th align="right">Total</Th>
                <Th align="right">Per session</Th>
                <Th align="right">Per resolution</Th>
                <Th align="right">AI resolution</Th>
              </tr>
            </thead>
            <tbody>
              {perClient.map(({ tenant: t, m: tm }) => (
                <tr key={t.id}>
                  <Td>
                    <Link href={`/platform/clients/${t.id}`} className="font-medium text-brand hover:underline">
                      {t.name}
                    </Link>
                  </Td>
                  <Td align="right">{tm.sessions}</Td>
                  <Td align="right">{formatGBP(tm.costTotal)}</Td>
                  <Td align="right">{tm.sessions ? formatGBP(tm.costPerSession, 3) : "—"}</Td>
                  <Td align="right">{tm.aiResolved + tm.humanResolved ? formatGBP(tm.costPerResolution, 3) : "—"}</Td>
                  <Td align="right">{tm.completed ? pct(tm.aiResolutionRate) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Commercial packaging" description="Reference only — docs/11">
          <div className="space-y-3">
            {PACKAGING.map((p) => (
              <div key={p.title}>
                <FieldLabel>{p.title}</FieldLabel>
                <p className="mt-0.5 text-[13px] text-ink-2">{p.items.join(" · ")}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-line pt-2.5 text-xs text-muted">
            Price from value — field visits avoided, handling time saved, resolution improvement, risk reduced — not from infrastructure cost alone.
          </p>
        </Panel>
      </div>
    </>
  );
}
