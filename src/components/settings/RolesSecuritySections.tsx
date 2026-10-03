"use client";
import { useState } from "react";
import { AlertOctagon } from "lucide-react";
import { Button, Chip, Field, Modal, Segmented, TextArea, TextInput, Th, Table, Td, Tr } from "@/components/ui/primitives";
import { defaultMatrix, permissions, roles } from "@/lib/data/settings";
import type { UserRole } from "@/lib/types/settings";
import { Checkbox, SectionCard, ToggleRow } from "./SectionCard";
import { useToast } from "@/components/audit/Toast";

export function RolesSection() {
  const [m, setM] = useState<Record<UserRole, string[]>>(defaultMatrix);
  const toggle = (r: UserRole, p: string, on: boolean) => setM({ ...m, [r]: on ? [...m[r], p] : m[r].filter((x) => x !== p) });
  let lastGroup = "";
  return (
    <SectionCard title="Roles and permissions" description="Role-based access control. Platform Admin permissions are fixed.">
      <div className="-mx-4 -mt-1">
        <Table>
          <thead><tr><Th>Permission</Th>{roles.map((r) => <Th key={r} className="text-center">{r}</Th>)}</tr></thead>
          <tbody>
            {permissions.map((p) => {
              const head = p.group !== lastGroup; lastGroup = p.group;
              return [
                head && <tr key={p.group}><td colSpan={roles.length + 1} className="bg-subtle/40 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-ink-mute">{p.group}</td></tr>,
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap">{p.label}</Td>
                  {roles.map((r) => <Td key={r} className="text-center"><Checkbox label={`${r}: ${p.label}`} checked={m[r].includes(p.id)} disabled={r === "Platform Admin"} onChange={(v) => toggle(r, p.id, v)} /></Td>)}
                </Tr>,
              ];
            })}
          </tbody>
        </Table>
      </div>
    </SectionCard>
  );
}

export function SecuritySection() {
  const [proto, setProto] = useState<"saml" | "oidc">("saml");
  const [mfa, setMfa] = useState(true);
  const [timeout, setTimeoutMin] = useState("30");
  const [ips, setIps] = useState("203.0.113.0/24\n198.51.100.16/28");
  const [kill, setKill] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  return (
    <div className="space-y-5">
      {kill && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-bad">
          <div className="flex items-center gap-2"><AlertOctagon size={18} /><div><p className="text-sm font-semibold">Kill switch engaged (demo)</p><p className="text-xs">New AI sessions are routed to human agents. In-flight sessions continue.</p></div></div>
          <Button size="sm" onClick={() => setKill(false)}>Disengage</Button>
        </div>
      )}
      <SectionCard title="Security" description="Authentication, session and network controls for all users.">
        <div className="rounded border border-line p-3.5">
          <div className="flex items-center justify-between"><p className="text-[13px] font-semibold">Single sign-on</p><Chip tone="neutral">Not configured (preview)</Chip></div>
          <div className="mt-3 space-y-3 opacity-80">
            <Segmented options={[{ id: "saml", label: "SAML 2.0" }, { id: "oidc", label: "OpenID Connect" }]} value={proto} onChange={setProto} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={proto === "saml" ? "IdP SSO URL" : "Issuer URL"}><TextInput disabled placeholder={proto === "saml" ? "https://idp.example/sso" : "https://login.example/oauth2"} /></Field>
              <Field label={proto === "saml" ? "IdP certificate" : "Client ID"}><TextInput disabled placeholder={proto === "saml" ? "Upload X.509 certificate" : "client-id"} /></Field>
            </div>
            <p className="text-xs text-ink-mute">SSO is a visual preview. No identity provider is connected in the demo.</p>
          </div>
        </div>
        <ToggleRow label="Enforce multi-factor authentication" hint="All users must enrol an authenticator app or security key." on={mfa} onChange={setMfa} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Session timeout (idle)"><select aria-label="Session timeout" value={timeout} onChange={(e) => setTimeoutMin(e.target.value)} className="h-8 w-full rounded border border-line bg-surface px-2.5 text-[13px]">{["15", "30", "60", "240"].map((v) => <option key={v} value={v}>{v} minutes</option>)}</select></Field>
          <Field label="IP allow-list" hint="One CIDR per line. Empty allows all addresses."><TextArea rows={3} className="font-mono text-xs" value={ips} onChange={(e) => setIps(e.target.value)} /></Field>
        </div>
        <div className="flex items-center justify-between gap-3 rounded border border-line bg-subtle/40 p-3">
          <div><p className="text-[13px] font-medium">Audit export</p><p className="text-xs text-ink-mute">Stream audit events to your SIEM or download a signed archive.</p></div>
          <Button size="sm" onClick={() => toast.show("Audit export queued (demo)")}>Export audit log</Button>
        </div>
      </SectionCard>

      <section className="rounded-lg border border-bad/40 bg-surface">
        <header className="border-b border-bad/30 px-4 py-2.5"><h2 className="text-[13px] font-semibold text-bad">Operational kill switch</h2><p className="text-2xs text-ink-mute">Immediately stop new AI-handled sessions platform-wide.</p></header>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="max-w-xl text-[13px] text-ink-soft">Use during a safety or compliance event. New sessions are offered a human agent or callback. Requires the Kill switch permission and is written to the audit log.</p>
          <Button variant="danger" onClick={() => (kill ? setKill(false) : setConfirm(true))}>{kill ? "Disengage kill switch" : "Engage kill switch"}</Button>
        </div>
      </section>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Engage operational kill switch?" footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={() => { setKill(true); setConfirm(false); }}>Engage (demo)</Button></>}>
        <p className="text-[13px] text-ink-soft">This stops new AI-handled sessions for every tenant. This is a demonstration: only a local banner changes and no service is affected.</p>
      </Modal>
      {toast.node}
    </div>
  );
}
