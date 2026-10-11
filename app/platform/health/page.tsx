import { AlertTriangle, BookOpen, CheckCircle2 } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { INCIDENTS, RUNBOOKS, SERVICES, type ServiceStatus } from "@/lib/config/operations";
import { latencyStats } from "@/lib/analytics/metrics";
import { formatDateTime, formatMinutes, secondsBetween } from "@/lib/format";
import { Badge, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { withinDays } from "@/components/platform/config-data";
import { Note, ServiceModeBadge, ServiceStatusBadge } from "@/components/platform/config-ui";

export const metadata = { title: "System Health" };

const LAYERS: { key: ServiceStatus["layer"]; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "media", label: "Media" },
  { key: "voice", label: "Voice" },
  { key: "reasoning", label: "Reasoning" },
  { key: "orchestration", label: "Orchestration" },
  { key: "workflow", label: "Workflow" },
  { key: "human", label: "Human" },
  { key: "data", label: "Data" },
  { key: "observability", label: "Observability" },
];

const SEVERITY_TONE = { P0: "danger", P1: "danger", P2: "warn", P3: "neutral" } as const;

export default async function HealthPage() {
  const rt = await platformRuntime();
  const recent = withinDays(rt.states(), 1);
  const latency = latencyStats(recent);
  const latency14 = latencyStats(withinDays(rt.states(), 14));
  const live = rt.summaries().filter((s) => s.live && s.status !== "completed" && s.status !== "failed");
  const waiting = live.filter((s) => s.status === "escalated");
  const longestWait = waiting.reduce((mx, s) => Math.max(mx, secondsBetween(s.escalation!.requestedAt)), 0);
  const open = INCIDENTS.filter((i) => i.status !== "resolved");
  const serviceName = (key: string) => SERVICES.find((s) => s.key === key)?.name ?? key;
  const runbookTitle = (key: string) => RUNBOOKS.find((r) => r.key === key)?.title ?? key;
  const fmtMs = (n: number) => (Number.isFinite(n) ? `${(n / 1000).toFixed(2)} s` : "—");

  return (
    <>
      <PageHeader
        title="System Health"
        description="Service status by architecture layer, with each service's delivery mode stated plainly: live, browser-native, simulated, or not yet deployed."
        meta={
          open.length ? (
            <Badge tone="warn" icon={<AlertTriangle className="size-3" aria-hidden />}>
              {open.length} open incident{open.length === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge tone="ok" icon={<CheckCircle2 className="size-3" aria-hidden />}>
              No open incidents
            </Badge>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Services operational" value={`${SERVICES.filter((s) => s.status === "operational").length} / ${SERVICES.length}`} hint={`${SERVICES.filter((s) => s.status === "degraded").length} degraded`} />
        <Stat label="Simulated services" value={SERVICES.filter((s) => s.mode === "simulated").length} hint={`${SERVICES.filter((s) => s.mode === "not_deployed").length} not deployed`} />
        <Stat label="Live sessions" value={live.length} hint={`${waiting.length} waiting for a human`} />
        <Stat label="Longest queue wait" value={waiting.length ? formatMinutes(longestWait) : "—"} tone={longestWait > 120 ? "warn" : undefined} />
        <Stat label="Vision p95 (24 h)" value={fmtMs(latency.visionP95)} hint={`p50 ${fmtMs(latency.visionP50)} · ${latency.samples} samples`} />
        <Stat label="Vision p95 (14 d)" value={fmtMs(latency14.visionP95)} hint={`p50 ${fmtMs(latency14.visionP50)} · ${latency14.samples} samples`} />
      </div>

      <Note className="mt-4">
        Vision latency is measured from observation audit events produced by the <span className="font-medium text-ink">simulated</span> reasoning provider, so it
        reflects the simulation, not a production model. Speech latency is not measured — speech runs in the customer&apos;s browser.
      </Note>

      <Panel title="Services" className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Service</Th>
              <Th>Mode</Th>
              <Th>Status</Th>
              <Th>Provider</Th>
              <Th>Region</Th>
              <Th align="right">p95</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          {LAYERS.map((layer) => {
            const list = SERVICES.filter((s) => s.layer === layer.key);
            if (list.length === 0) return null;
            return (
              <tbody key={layer.key}>
                <tr>
                  <th scope="rowgroup" colSpan={7} className="border-b border-line bg-surface-2 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {layer.label}
                  </th>
                </tr>
                {list.map((s) => (
                  <tr key={s.key}>
                    <Td className="font-medium text-ink">{s.name}</Td>
                    <Td>
                      <ServiceModeBadge mode={s.mode} />
                    </Td>
                    <Td>
                      <ServiceStatusBadge status={s.status} />
                    </Td>
                    <Td className="text-xs">{s.provider}</Td>
                    <Td className="text-xs">{s.region}</Td>
                    <Td align="right">{s.p95Ms !== undefined ? `${s.p95Ms.toLocaleString("en-GB")} ms` : "—"}</Td>
                    <Td className="min-w-56 text-xs">{s.note}</Td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </Table>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Incidents" className="xl:col-span-2" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Incident</Th>
                <Th>Severity</Th>
                <Th>Status</Th>
                <Th>Service</Th>
                <Th>Runbook</Th>
                <Th>Opened</Th>
                <Th>Duration</Th>
              </tr>
            </thead>
            <tbody>
              {INCIDENTS.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <div className="font-medium text-ink">{i.id}</div>
                    <div className="text-xs text-muted">{i.title}</div>
                  </Td>
                  <Td>
                    <Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge>
                  </Td>
                  <Td>
                    <Badge
                      tone={i.status === "resolved" ? "ok" : i.status === "monitoring" ? "warn" : "danger"}
                      icon={i.status === "resolved" ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
                    >
                      {i.status.charAt(0).toUpperCase() + i.status.slice(1)}
                    </Badge>
                  </Td>
                  <Td className="text-xs">{serviceName(i.service)}</Td>
                  <Td className="text-xs">{runbookTitle(i.runbook)}</Td>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(i.openedAt)}</Td>
                  <Td className="whitespace-nowrap text-xs">{i.resolvedAt ? formatMinutes(secondsBetween(i.openedAt, i.resolvedAt)) : `${formatMinutes(secondsBetween(i.openedAt))} (ongoing)`}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="px-4 py-2.5 text-xs text-muted">Severity: P0 widespread outage or unsafe behaviour · P1 major client impact · P2 degraded feature · P3 minor issue.</p>
        </Panel>

        <Panel title="Runbooks" description="docs/10 §4" bodyClassName="p-0">
          <ul className="divide-y divide-line text-[13px]">
            {RUNBOOKS.map((r) => {
              const linked = INCIDENTS.filter((i) => i.runbook === r.key);
              return (
                <li key={r.key} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <BookOpen className="size-3.5 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{r.title}</span>
                      <span className="block text-xs text-muted">Owner: {r.owner}</span>
                    </span>
                  </span>
                  {linked.length > 0 && <Badge tone="neutral">{linked.length} incident{linked.length === 1 ? "" : "s"}</Badge>}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
