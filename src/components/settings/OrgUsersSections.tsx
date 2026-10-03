"use client";
import { useState } from "react";
import { Upload, UserPlus } from "lucide-react";
import { Button, Chip, Field, Modal, Select, Table, TextInput, Td, Th, Toggle, Tr } from "@/components/ui/primitives";
import { org, roles, users as seedUsers } from "@/lib/data/settings";
import type { OrgUser, UserRole } from "@/lib/types/settings";
import { SectionCard } from "./SectionCard";

export function OrganisationSection() {
  const [f, setF] = useState(org);
  const set = (k: keyof typeof org) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <SectionCard title="Organisation" description="Legal identity and contacts shown to tenants and in exported evidence.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organisation name"><TextInput value={f.name} onChange={set("name")} /></Field>
        <Field label="Legal entity"><TextInput value={f.legalEntity} onChange={set("legalEntity")} /></Field>
        <Field label="Company number"><TextInput value={f.companyNo} onChange={set("companyNo")} /></Field>
        <Field label="Primary domain" hint="Used for SSO domain matching."><TextInput value={f.domain} onChange={set("domain")} /></Field>
        <Field label="Support email"><TextInput type="email" value={f.supportEmail} onChange={set("supportEmail")} /></Field>
        <Field label="Support phone"><TextInput value={f.supportPhone} onChange={set("supportPhone")} /></Field>
        <Field label="Security contact" hint="Receives incident and breach notifications."><TextInput type="email" value={f.securityEmail} onChange={set("securityEmail")} /></Field>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-ink-soft">Branding</p>
        <div className="flex items-center gap-4 rounded border border-dashed border-line bg-subtle/50 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded border border-line bg-surface text-xs font-semibold text-ink-mute">AI</div>
          <div className="min-w-0 flex-1"><p className="text-[13px] font-medium">Logo and accent colour</p><p className="text-xs text-ink-mute">SVG or PNG, up to 1 MB. Upload is a placeholder in this demo.</p></div>
          <Button size="sm"><Upload size={13} />Upload</Button>
        </div>
      </div>
    </SectionCard>
  );
}

export function UsersSection() {
  const [list, setList] = useState<OrgUser[]>(seedUsers);
  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState({ name: "", email: "", role: "Human Agent" as UserRole });
  const [seq, setSeq] = useState(1);
  const invite = () => {
    setList([...list, { id: `inv${seq}`, name: inv.name || inv.email, email: inv.email, role: inv.role, active: true, mfa: false, lastActive: "Invited" }]);
    setSeq(seq + 1); setInv({ name: "", email: "", role: "Human Agent" }); setOpen(false);
  };
  return (
    <>
      <SectionCard title="Users" description={`${list.filter((u) => u.active).length} active of ${list.length} users`} >
        <div className="-mx-4 -mt-1">
          <div className="flex justify-end px-4 pb-2"><Button size="sm" variant="primary" onClick={() => setOpen(true)}><UserPlus size={13} />Invite user</Button></div>
          <Table>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>MFA</Th><Th>Last active</Th><Th className="text-right">Active</Th></tr></thead>
            <tbody>
              {list.map((u) => (
                <Tr key={u.id}>
                  <Td className="whitespace-nowrap font-medium">{u.name}</Td>
                  <Td className="text-xs text-ink-soft">{u.email}</Td>
                  <Td className="whitespace-nowrap">{u.role}</Td>
                  <Td>{u.lastActive === "Invited" ? <Chip tone="info">Invited</Chip> : <Chip tone={u.active ? "ok" : "neutral"} dot>{u.active ? "Active" : "Deactivated"}</Chip>}</Td>
                  <Td><Chip tone={u.mfa ? "ok" : "warn"}>{u.mfa ? "Enrolled" : "Not enrolled"}</Chip></Td>
                  <Td className="whitespace-nowrap text-xs text-ink-mute">{u.lastActive}</Td>
                  <Td className="text-right"><Toggle on={u.active} label={`${u.active ? "Deactivate" : "Activate"} ${u.name}`} onChange={(v) => setList(list.map((x) => (x.id === u.id ? { ...x, active: v } : x)))} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </SectionCard>
      <Modal open={open} onClose={() => setOpen(false)} title="Invite user" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!/.+@.+\..+/.test(inv.email)} onClick={invite}>Send invite (demo)</Button></>}>
        <div className="space-y-4">
          <Field label="Full name"><TextInput value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></Field>
          <Field label="Work email"><TextInput type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder="name@company.example" /></Field>
          <Field label="Role"><Select label="Role" className="w-full" value={inv.role} onChange={(v) => setInv({ ...inv, role: v as UserRole })} options={roles.map((r) => ({ value: r, label: r }))} /></Field>
          <p className="text-xs text-ink-mute">No email is sent in this demo. MFA enrolment is required at first sign-in.</p>
        </div>
      </Modal>
    </>
  );
}
