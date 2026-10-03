"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Pencil } from "lucide-react";
import { Button, Chip, Drawer, Field, KeyValue, Modal, Select, Table, Td, TextArea, Th, Toggle, Tr } from "@/components/ui/primitives";
import { workflowById } from "@/lib/data/workflows";
import { clientById } from "@/lib/data/clients";
import type { Policy, PolicyRule } from "@/lib/types/policies";
import { PolicyStatusChip, effectMeta } from "./shared";
import { ClientTag } from "@/components/clients/shared";

export function PolicyDrawer({ policy, enabled, onToggle, onClose }: { policy: Policy | null; enabled: boolean; onToggle: (v: boolean) => void; onClose: () => void }) {
  const [edit, setEdit] = useState<PolicyRule | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Pick<PolicyRule, "condition" | "action" | "effect">>>({});
  if (!policy) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const rules = policy.rules.map((r) => ({ ...r, ...overrides[`${policy.id}:${r.id}`] }));
  return (
    <>
      <Drawer open onClose={onClose} width="max-w-xl" title={<span className="flex items-center gap-2"><span className="font-mono text-xs text-ink-mute">{policy.id}</span>{policy.name}</span>} subtitle={`${policy.category} · ${policy.scope === "global" ? "Global" : "Tenant"} scope · ${policy.version}`}
        footer={<Button onClick={onClose}>Close</Button>}>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded border border-line bg-subtle/60 px-3 py-2.5">
            <div><p className="text-[13px] font-medium">{enabled ? "Policy enforced" : "Policy disabled"}</p><p className="text-2xs text-ink-mute">{enabled ? "Rules below are applied to affected workflows." : "Rules are not applied. Safety-critical policies should stay enabled."}</p></div>
            <Toggle on={enabled} onChange={onToggle} label={`Enable ${policy.name}`} />
          </div>
          <p className="text-[13px] text-ink-soft">{policy.description}</p>
          <KeyValue cols={2} items={[{ k: "Status", v: <PolicyStatusChip status={policy.status} /> }, { k: "Owner", v: policy.owner }, { k: "Last updated", v: policy.updated }, { k: "Clients", v: <span className="flex flex-col gap-1">{policy.clientIds.map((c) => <ClientTag key={c} id={c} />)}</span> }]} />

          <section>
            <h3 className="label mb-2">Rules ({rules.length})</h3>
            <ul className="space-y-2">
              {rules.map((r, i) => (
                <li key={r.id} className="rounded border border-line p-2.5">
                  <div className="flex items-start gap-2">
                    <span className="num mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded bg-subtle text-2xs font-semibold text-ink-soft">{i + 1}</span>
                    <div className="min-w-0 flex-1 text-[13px]">
                      <p><span className="text-2xs font-semibold uppercase tracking-wider text-ink-mute">When </span>{r.condition}</p>
                      <p className="mt-1 flex items-start gap-1.5"><ArrowRight size={13} className="mt-1 shrink-0 text-ink-mute" /><span>{r.action}</span></p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Chip tone={effectMeta[r.effect].tone}>{effectMeta[r.effect].label}</Chip>
                      <button onClick={() => setEdit(r)} className="inline-flex items-center gap-1 text-2xs font-medium text-brand-strong hover:underline"><Pencil size={11} />Edit rule</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="label mb-2">Workflows affected ({policy.workflowsAffected.length})</h3>
            <ul className="divide-y divide-line rounded border border-line">
              {policy.workflowsAffected.map((id) => { const w = workflowById(id); return (
                <li key={id} className="flex items-center justify-between px-3 py-1.5 text-[13px]">
                  <Link href={`/workflows/${id}`} className="font-medium hover:text-brand-strong hover:underline">{w?.name ?? id}</Link>
                  <span className="text-2xs text-ink-mute">{w ? clientById(w.clientId)?.name : ""}</span>
                </li>
              ); })}
            </ul>
          </section>

          <section>
            <h3 className="label mb-2">Version history</h3>
            <div className="overflow-hidden rounded border border-line">
              <Table>
                <thead><tr><Th>Version</Th><Th>Date</Th><Th>Author</Th><Th>Change</Th></tr></thead>
                <tbody>{policy.history.map((h) => <Tr key={h.v}><Td className="font-mono text-xs">{h.v}</Td><Td className="whitespace-nowrap text-ink-soft">{h.date}</Td><Td>{h.author}</Td><Td>{h.note}</Td></Tr>)}</tbody>
              </Table>
            </div>
          </section>
        </div>
      </Drawer>
      <EditRuleModal key={edit?.id ?? "none"} rule={edit} onClose={() => setEdit(null)} onSave={(patch) => { if (edit) setOverrides((o) => ({ ...o, [`${policy.id}:${edit.id}`]: patch })); setEdit(null); }} />
    </>
  );
}

function EditRuleModal({ rule, onClose, onSave }: { rule: PolicyRule | null; onClose: () => void; onSave: (p: Pick<PolicyRule, "condition" | "action" | "effect">) => void }) {
  const [condition, setCondition] = useState(rule?.condition ?? "");
  const [action, setAction] = useState(rule?.action ?? "");
  const [effect, setEffect] = useState<PolicyRule["effect"]>(rule?.effect ?? "log");
  return (
    <Modal open={!!rule} onClose={onClose} title="Edit rule" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ condition, action, effect })}>Save to draft</Button></>}>
      <div className="space-y-3">
        <p className="rounded border border-line bg-subtle px-3 py-2 text-xs text-ink-soft">Visual only. Changes apply to this view and would create a new draft version for compliance review.</p>
        <Field label="Condition"><TextArea rows={2} value={condition} onChange={(e) => setCondition(e.target.value)} /></Field>
        <Field label="Action"><TextArea rows={2} value={action} onChange={(e) => setAction(e.target.value)} /></Field>
        <Field label="Effect"><Select className="w-full" value={effect} onChange={(v) => setEffect(v as PolicyRule["effect"])} options={Object.entries(effectMeta).map(([value, m]) => ({ value, label: m.label }))} /></Field>
      </div>
    </Modal>
  );
}
