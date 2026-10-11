import { Info } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { tenants, users } from "@/lib/config/catalog";
import { Badge, KeyValue, PageHeader, Panel, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { ROLE_LABELS } from "@/components/platform/config-data";
import { ImplStateBadge, Note, type ImplState } from "@/components/platform/config-ui";

export const metadata = { title: "Settings" };

const ENVIRONMENTS: { name: string; state: ImplState; label: string; detail: string }[] = [
  { name: "Local", state: "implemented", label: "In use", detail: "Developer machines; simulated providers and seeded sessions" },
  { name: "Development", state: "partial", label: "POC deployment", detail: "This POC; in-memory store, simulated AI providers" },
  { name: "Test", state: "partial", label: "Automated tests only", detail: "Unit and runtime tests (Vitest) run locally; no CI pipeline or hosted test environment yet" },
  { name: "Staging", state: "planned", label: "Not provisioned", detail: "Production-like infrastructure for release verification" },
  { name: "Pilot", state: "planned", label: "Not provisioned", detail: "First client pilot (Phase 4)" },
  { name: "Production", state: "planned", label: "Not provisioned", detail: "Production pilot onwards (Phase 5)" },
];

/** docs/06 §2 — stated honestly against what the POC actually does. */
const CONTROLS: { control: string; state: ImplState; label?: string; detail: string }[] = [
  { control: "Tenant isolation", state: "implemented", detail: "Tenant-scoped data model; every session, workflow, policy and query carries tenantId. Hardened tenancy in Phase 5." },
  { control: "Audit logs", state: "implemented", detail: "Every material state transition is an audit event with workflow, policy, model and prompt versions. In-memory; durable store planned." },
  { control: "TLS in transit", state: "partial", label: "Deployment-dependent", detail: "Provided by the hosting edge; not enforced by the application." },
  { control: "Encryption at rest", state: "planned", label: "Planned (Phase 4–6)", detail: "POC data is held in memory only." },
  { control: "SSO", state: "planned", label: "Planned (Phase 4–6)", detail: "OIDC / SAML workforce SSO (enterprise add-on)." },
  { control: "MFA", state: "planned", label: "Planned (Phase 4–6)", detail: "With production-like authentication for the client pilot." },
  { control: "RBAC", state: "planned", label: "Planned (Phase 4–6)", detail: "Roles are modelled on users but not enforced; the POC has no sign-in." },
  { control: "Least privilege", state: "planned", label: "Planned (Phase 5)", detail: "Depends on RBAC and per-tenant service credentials." },
  { control: "Secrets management", state: "planned", label: "Planned (Phase 4)", detail: "No client credentials are stored in the POC." },
  { control: "Key rotation", state: "planned", label: "Planned (Phase 5)", detail: "With managed keys and secrets store." },
  { control: "Security logging", state: "planned", label: "Planned (Phase 5)", detail: "OpenTelemetry export not deployed." },
  { control: "Retention controls", state: "partial", detail: "Per-tenant retention periods configured; automated expiry not yet enforced." },
  { control: "Deletion workflows", state: "planned", label: "Planned (Phase 5)", detail: "Subject-request and tenant offboarding deletion." },
  { control: "Redaction", state: "planned", label: "Planned (Phase 4)", detail: "Sensitive-data handling is configured in policies; automatic blur is not implemented." },
  { control: "Incident response", state: "partial", detail: "Severity scale, incident register and runbook owners defined; paging not connected." },
  { control: "Vulnerability management", state: "planned", label: "Planned (Phase 5)", detail: "Scanning and patch SLAs." },
  { control: "Dependency management", state: "partial", detail: "Lockfile-pinned dependencies; automated update and audit tooling not configured." },
];

const NOTIFICATIONS: { name: string; state: ImplState; label: string; detail: string }[] = [
  { name: "Escalation queue (in-console)", state: "implemented", label: "Live", detail: "Waiting sessions appear in the console and dashboard in real time" },
  { name: "Queue breach alerts", state: "planned", label: "Not configured", detail: "Alert when wait exceeds a team's target answer time (Phase 5)" },
  { name: "Incident paging", state: "planned", label: "Not configured", detail: "On-call paging for P0/P1 incidents" },
  { name: "Cost anomaly alerts", state: "planned", label: "Not configured", detail: "Daily cost deviation per tenant" },
  { name: "Customer session links (SMS)", state: "partial", label: "Sandbox", detail: "Via the client's SMS gateway integration; sandbox only" },
];

export default async function SettingsPage() {
  // Settings are static configuration, but the page renders per request like the rest of the platform.
  await platformRuntime();
  const transcriptDays = tenants.map((t) => t.retention.transcriptRetentionDays);
  const auditDays = tenants.map((t) => t.retention.auditRetentionDays);
  const evidenceDays = tenants.filter((t) => t.retention.evidenceMode === "retained_evidence").map((t) => t.retention.evidenceRetentionDays);
  const range = (xs: number[]) => (xs.length ? (Math.min(...xs) === Math.max(...xs) ? `${xs[0]} days` : `${Math.min(...xs)}–${Math.max(...xs)} days`) : "—");
  const staff = users.filter((u) => u.tenantId === "aiuk");

  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform-wide configuration: environments, security controls, retention defaults and notifications. Where a control is not yet built, it is shown as planned."
        meta={<Badge tone="neutral">Read-only in POC</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Controls implemented" value={CONTROLS.filter((c) => c.state === "implemented").length} hint={`of ${CONTROLS.length} required (docs/06 §2)`} />
        <Stat label="Partially in place" value={CONTROLS.filter((c) => c.state === "partial").length} />
        <Stat label="Planned" value={CONTROLS.filter((c) => c.state === "planned").length} hint="Phases 4–6" />
        <Stat label="Platform staff" value={staff.length} hint={staff.map((u) => ROLE_LABELS[u.role]).join(" · ")} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Security controls" description="docs/06 §2" className="xl:col-span-2" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Control</Th>
                <Th>State</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {CONTROLS.map((c) => (
                <tr key={c.control}>
                  <Td className="whitespace-nowrap font-medium text-ink">{c.control}</Td>
                  <Td>
                    <ImplStateBadge state={c.state} label={c.label} />
                  </Td>
                  <Td className="min-w-64 text-xs">{c.detail}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <div className="space-y-4">
          <Panel title="Environments" description="docs/02 §6" bodyClassName="p-0">
            <ul className="divide-y divide-line text-[13px]">
              {ENVIRONMENTS.map((e) => (
                <li key={e.name} className="px-4 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{e.name}</span>
                    <ImplStateBadge state={e.state} label={e.label} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{e.detail}</div>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Production data must not be reused in development unless properly anonymised and approved.
            </p>
          </Panel>

          <Panel title="Retention defaults" description="docs/06 §3">
            <KeyValue
              items={[
                ["Full video", "Never recorded"],
                ["Default evidence mode", "Live only (fallback when unset)"],
                ["Evidence (retained)", `${range(evidenceDays)} across tenants`],
                ["Transcripts", `${range(transcriptDays)} across tenants`],
                ["Audit trail", `${range(auditDays)} across tenants`],
              ]}
            />
            <Note className="mt-3" icon={<Info className="size-3.5" />}>
              Periods are set per tenant on the client page. Automated expiry and deletion are planned (Phase 5); the POC store is cleared on restart.
            </Note>
          </Panel>
        </div>
      </div>

      <Panel title="Notifications" className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Notification</Th>
              <Th>State</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATIONS.map((n) => (
              <tr key={n.name}>
                <Td className="font-medium text-ink">{n.name}</Td>
                <Td>
                  <ImplStateBadge state={n.state} label={n.label} />
                </Td>
                <Td className="text-xs">{n.detail}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
