import Link from "next/link";
import { Info } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { policies, tenantName, workflows } from "@/lib/config/catalog";
import type { SensitiveCategory } from "@/lib/domain/types";
import { humanize } from "@/lib/domain/labels";
import { confidencePct, formatMinutes } from "@/lib/format";
import { Badge, KeyValue, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { EscalationReasonBadge, WorkflowStatusBadge } from "@/components/domain/badges";
import { withinDays } from "@/components/platform/config-data";
import { ConfigStatusBadge, FieldLabel, Mono, Note, RiskBadge, SensitiveHandlingBadge, ToolModeBadge, YesNo } from "@/components/platform/config-ui";

export const metadata = { title: "Policies" };

/** docs/06 §4 — every policy must explicitly address each category. */
const SENSITIVE_CATEGORIES: SensitiveCategory[] = [
  "bystanders",
  "children",
  "identity_documents",
  "payment_cards",
  "medical_information",
  "confidential_documents",
  "private_interiors",
  "computer_screens",
  "vehicle_plates",
  "special_category",
];

export default async function PoliciesPage() {
  const rt = await platformRuntime();
  const states = withinDays(rt.states(), 14);
  const denied = states.flatMap((s) => s.toolActions.filter((a) => a.status === "denied"));

  return (
    <>
      <PageHeader
        title="Policies"
        description="Deterministic rules the AI cannot override: which business tools it may run, which escalations hand control permanently to a human, how sensitive visual data is handled, and the confidence and duration limits for each client."
        meta={<Badge tone="neutral">{policies.length} policies</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active policies" value={policies.filter((p) => p.status === "active").length} hint={`${policies.filter((p) => p.status === "draft").length} draft`} />
        <Stat label="Tools governed" value={policies.reduce((n, p) => n + p.tools.length, 0)} hint="Across all policies" />
        <Stat
          label="Human-only or denied tools"
          value={policies.reduce((n, p) => n + p.tools.filter((t) => t.mode !== "allow").length, 0)}
          hint="AI may not perform these"
        />
        <Stat label="Tool calls denied (14 d)" value={denied.length} hint="Blocked by policy at runtime" />
      </div>

      <Note className="mt-4" icon={<Info className="size-3.5" />}>
        Tool permission is decided by the policy engine, never by the model (docs/02 §4 rule 6). Regulated tools always require a human even when listed as allowed.
        Sensitive-data handling is configured here; automatic blurring and capture-avoidance enforcement in the media gateway is not yet implemented in the POC.
      </Note>

      <div className="mt-4 space-y-4">
        {policies.map((p) => {
          const wfs = workflows.filter((w) => w.policyId === p.id);
          const handling = new Map(p.sensitiveData.map((s) => [s.category, s.handling]));
          const unspecified = SENSITIVE_CATEGORIES.filter((c) => !handling.has(c)).length;
          return (
            <Panel
              key={p.id}
              title={`${p.name} v${p.version}`}
              description={
                <>
                  {tenantName(p.tenantId)} · <span className="font-mono">{p.id}</span>
                </>
              }
              actions={<ConfigStatusBadge status={p.status} />}
              bodyClassName="p-0"
            >
              <div className="grid gap-0 xl:grid-cols-3">
                <div className="border-b border-line xl:col-span-2 xl:border-r">
                  <div className="px-4 pb-1 pt-3">
                    <FieldLabel>Tool permissions</FieldLabel>
                  </div>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Tool</Th>
                        <Th>Risk</Th>
                        <Th>Mode</Th>
                        <Th>Idempotency</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.tools.map((t) => (
                        <tr key={t.tool}>
                          <Td>
                            <Mono>{t.tool}</Mono>
                          </Td>
                          <Td>
                            <RiskBadge risk={t.risk} />
                          </Td>
                          <Td>
                            <ToolModeBadge mode={t.mode} />
                            {t.mode === "allow" && t.risk === "regulated" && <div className="mt-0.5 text-[11px] text-muted">Regulated: human required</div>}
                          </Td>
                          <Td className="text-xs">{t.requiresIdempotencyKey ? "Key required" : "Not required"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <p className="px-4 py-2.5 text-xs text-muted">Tools not listed are denied by default.</p>
                </div>

                <div className="border-b border-line px-4 py-3">
                  <FieldLabel>Thresholds & control</FieldLabel>
                  <KeyValue
                    className="mt-2"
                    items={[
                      ["Min confidence", `≥ ${confidencePct(p.minObservationConfidence)}`],
                      ["Max capture attempts", p.maxCaptureAttempts],
                      ["Max AI duration", formatMinutes(p.maxAiDurationSec)],
                      ["Return to AI", <YesNo key="r" value={p.allowReturnToAi} yes="Permitted" no="Not permitted" />],
                    ]}
                  />
                  <div className="mt-4">
                    <FieldLabel>Mandatory human escalation</FieldLabel>
                    <p className="mt-1 text-xs text-muted">A human must finish the session; control never returns to AI.</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {p.mandatoryHumanReasons.map((r) => (
                        <li key={r}>
                          <EscalationReasonBadge reason={r} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4">
                    <FieldLabel>Used by workflows</FieldLabel>
                    <ul className="mt-1.5 space-y-1 text-[13px]">
                      {wfs.length === 0 && <li className="text-xs text-muted">Not linked to any workflow</li>}
                      {wfs.map((w) => (
                        <li key={w.id} className="flex flex-wrap items-center gap-2">
                          <Link href={`/platform/workflows/${w.id}`} className="text-brand hover:underline">
                            {w.name} v{w.version}
                          </Link>
                          <WorkflowStatusBadge status={w.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="xl:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-3">
                    <FieldLabel>Sensitive visual data (docs/06 §4)</FieldLabel>
                    {unspecified > 0 ? (
                      <Badge tone="warn">{unspecified} of {SENSITIVE_CATEGORIES.length} categories not specified</Badge>
                    ) : (
                      <Badge tone="ok">All categories addressed</Badge>
                    )}
                  </div>
                  <ul className="grid gap-x-6 px-4 pb-3 sm:grid-cols-2 lg:grid-cols-5">
                    {SENSITIVE_CATEGORIES.map((c) => (
                      <li key={c} className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-[13px]">
                        <span className="text-ink-2">{humanize(c)}</span>
                        <SensitiveHandlingBadge handling={handling.get(c)} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
