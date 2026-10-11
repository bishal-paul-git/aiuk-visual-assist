import { Check, Info, Minus } from "lucide-react";
import { platformRuntime } from "@/lib/server/platform-data";
import { RETENTION_INTERVAL_MS } from "@/lib/server/runtime";
import type { RetentionStatus } from "@/lib/runtime/session-runtime";
import { formatDateTime } from "@/lib/format";
import { PERMISSIONS, PERMISSION_LABELS, ROLES, ROLE_NAMES, ROLE_PERMISSIONS, isPlatformRole } from "@/lib/auth/rbac";
import { evidenceRetentionDays } from "@/lib/privacy/retention";
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
  { control: "Tenant isolation", state: "implemented", detail: "Tenant-scoped data model; agents, supervisors and client admins can only read or act on their own organisation's sessions and configuration (enforced on every API route). Hardened tenancy in Phase 5." },
  { control: "Audit logs", state: "implemented", detail: "Every material state transition is an audit event with workflow, policy, model and prompt versions. In-memory; durable store planned." },
  { control: "TLS in transit", state: "partial", label: "Deployment-dependent", detail: "Provided by the hosting edge; not enforced by the application." },
  { control: "Encryption at rest", state: "planned", label: "Planned (Phase 4–6)", detail: "POC data is held in memory only." },
  { control: "SSO", state: "partial", label: "Provider interface ready", detail: "Sign-in goes through an identity provider interface; the POC uses a demo provider (no passwords) with a signed, HttpOnly session cookie. Entra ID / Okta / Auth0 (OIDC) plug in behind the same interface." },
  { control: "MFA", state: "planned", label: "Planned (Phase 4)", detail: "Delegated to the client's SSO provider once OIDC is connected." },
  { control: "RBAC", state: "implemented", detail: "Five roles with a permission matrix (below). Enforced on API routes and console/platform pages; denials return 401/403 and are audited." },
  { control: "Least privilege", state: "partial", detail: "Platform admins configure but do not operate sessions; QA reviewers are read-only. Per-tenant service credentials planned (Phase 5)." },
  { control: "Secrets management", state: "planned", label: "Planned (Phase 4)", detail: "No client credentials are stored in the POC." },
  { control: "Key rotation", state: "planned", label: "Planned (Phase 5)", detail: "With managed keys and secrets store." },
  { control: "Security logging", state: "partial", detail: "Sign-in, sign-out and permission denials are audit events (Audit Logs › Security). SIEM / OpenTelemetry export not deployed." },
  { control: "Retention controls", state: "implemented", detail: "Retention job deletes expired evidence frames and transcripts per tenant policy and audits each purge (see Retention below)." },
  { control: "Deletion workflows", state: "planned", label: "Planned (Phase 5)", detail: "Subject-request and tenant offboarding deletion." },
  { control: "Redaction", state: "partial", label: "Transcripts only", detail: "Card numbers (Luhn-checked), emails, phone numbers, UK postcodes and account numbers are removed from customer and agent transcript text before storage, and audited. Automatic image blur is not implemented." },
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
  const rt = await platformRuntime();
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
              Periods are set per tenant on the client page and enforced by the retention job below. The POC store is also cleared on restart.
            </Note>
          </Panel>
        </div>
      </div>

      <RetentionPanel status={rt.retentionStatus} />
      <AccessPanel />

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

function RetentionPanel({ status: st }: { status: RetentionStatus | undefined }) {
  return (
    <Panel
      title="Retention"
      description={`docs/06 §3 · runs every ${Math.round(RETENTION_INTERVAL_MS / 60_000)} minutes · ${st ? `last run ${formatDateTime(st.lastRunAt)}` : "not run yet"}`}
      className="mt-4"
      bodyClassName="p-0"
    >
      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Evidence mode</Th>
            <Th align="right">Evidence kept</Th>
            <Th align="right">Transcripts kept</Th>
            <Th align="right">Audit kept</Th>
            <Th align="right">Sessions purged</Th>
            <Th align="right">Frames deleted</Th>
            <Th align="right">Transcript lines deleted</Th>
            <Th>Last purge</Th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => {
            const done = st?.byTenant[t.id];
            const evidence = evidenceRetentionDays(t.retention);
            return (
              <tr key={t.id}>
                <Td className="whitespace-nowrap font-medium text-ink">{t.name}</Td>
                <Td>
                  <Badge tone={t.retention.evidenceMode === "live_only" ? "ok" : "neutral"}>
                    {t.retention.evidenceMode === "live_only" ? "Live only" : "Retained evidence"}
                  </Badge>
                </Td>
                <Td align="right" className="whitespace-nowrap">{evidence === 0 ? "Until session ends" : `${evidence} days`}</Td>
                <Td align="right" className="whitespace-nowrap">{t.retention.transcriptRetentionDays} days</Td>
                <Td align="right" className="whitespace-nowrap">{t.retention.auditRetentionDays} days</Td>
                <Td align="right">{done?.sessions ?? 0}</Td>
                <Td align="right">{done?.frames ?? 0}</Td>
                <Td align="right">{done?.transcriptEvents ?? 0}</Td>
                <Td className="whitespace-nowrap text-xs">{done?.lastPurgeAt ? formatDateTime(done.lastPurgeAt) : "Nothing past retention yet"}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
        Periods count from when a session ends; live sessions are never purged. Deleted frames and transcripts leave structured metadata (observations,
        workflow steps, actions) and a <span className="font-mono">privacy.retention_purged</span> audit event. Audit records follow the audit period in the
        durable store (planned). Counts are since the runtime last started.
      </p>
    </Panel>
  );
}

function AccessPanel() {
  return (
    <Panel title="Roles and permissions" description="docs/06 §2 · enforced on every API route and page in the server edition" className="mt-4" bodyClassName="p-0">
      <Table>
        <thead>
          <tr>
            <Th>Permission</Th>
            {ROLES.map((r) => (
              <Th key={r} className="whitespace-nowrap">
                {ROLE_NAMES[r]}
                <div className="text-[11px] font-normal text-muted">{isPlatformRole(r) ? "All clients" : "Own client"}</div>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((p) => (
            <tr key={p}>
              <Td className="whitespace-nowrap">
                <span className="text-ink">{PERMISSION_LABELS[p]}</span>
                <div className="font-mono text-[11px] text-muted">{p}</div>
              </Td>
              {ROLES.map((r) => (
                <Td key={r}>
                  {ROLE_PERMISSIONS[r].includes(p) ? (
                    <Check className="size-4 text-ok" aria-label="Allowed" />
                  ) : (
                    <Minus className="size-4 text-line-strong" aria-label="Not allowed" />
                  )}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}
