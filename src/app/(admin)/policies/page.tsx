"use client";
import { useMemo, useState } from "react";
import { Chip, EmptyState, PageHeader, Panel, Segmented, Table, Td, Th, Toggle, Tr } from "@/components/ui/primitives";
import { humanRequiredMatrix, policies, policyCategories } from "@/lib/data/policies";
import { useAppState } from "@/lib/store";
import { ClientTag } from "@/components/clients/shared";
import { PolicyStatusChip } from "@/components/policies/shared";
import { PolicyDrawer } from "@/components/policies/PolicyDrawer";
import { RiskChip } from "@/components/agents/shared";
import type { PolicyCategory } from "@/lib/types/policies";

export default function PoliciesPage() {
  const clientFilter = useAppState((s) => s.clientFilter);
  const [cat, setCat] = useState<PolicyCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(policies.map((p) => [p.id, p.status !== "draft"])));
  const rows = useMemo(() => policies.filter((p) => (cat === "all" || p.category === cat) && (clientFilter === "all" || p.clientIds.includes(clientFilter))), [cat, clientFilter]);
  const open = policies.find((p) => p.id === openId) ?? null;
  return (
    <>
      <PageHeader title="Policies" description="Safety, confidence, privacy and retention rules enforced across workflows. Policy changes are versioned and reviewed before they take effect." />
      <div className="mb-3 overflow-x-auto"><Segmented<PolicyCategory | "all"> value={cat} onChange={setCat} options={[{ id: "all", label: "All" }, ...policyCategories.map((c) => ({ id: c, label: c }))]} /></div>
      <Panel flush title={`${rows.length} polic${rows.length === 1 ? "y" : "ies"}`}>
        <Table>
          <thead><tr><Th>ID</Th><Th>Policy</Th><Th>Category</Th><Th>Scope</Th><Th>Version</Th><Th>Status</Th><Th className="text-right">Rules</Th><Th className="text-right">Workflows</Th><Th>Owner</Th><Th>Updated</Th><Th>Enforced</Th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <Tr key={p.id} onClick={() => setOpenId(p.id)} selected={openId === p.id}>
                <Td className="font-mono text-xs">{p.id}</Td>
                <Td className="font-medium">{p.name}</Td>
                <Td className="text-ink-soft">{p.category}</Td>
                <Td><Chip tone={p.scope === "global" ? "brand" : "neutral"}>{p.scope === "global" ? "Global" : "Tenant"}</Chip></Td>
                <Td className="font-mono text-xs">{p.version}</Td>
                <Td><PolicyStatusChip status={p.status} /></Td>
                <Td className="num text-right">{p.rules.length}</Td>
                <Td className="num text-right">{p.workflowsAffected.length}</Td>
                <Td className="text-ink-soft">{p.owner}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{p.updated}</Td>
                <Td><span onClick={(e) => e.stopPropagation()}><Toggle on={enabled[p.id]} onChange={(v) => setEnabled((s) => ({ ...s, [p.id]: v }))} label={`Enforce ${p.name}`} /></span></Td>
              </Tr>
            ))}
            {rows.length === 0 && <tr><Td colSpan={11}><EmptyState title="No policies in this category" hint="Choose another category or the global client switcher." /></Td></tr>}
          </tbody>
        </Table>
      </Panel>

      <Panel className="mt-4" flush title="Human-required actions" subtitle="Who must confirm before the action executes">
        <Table>
          <thead><tr><Th>Action</Th><Th>Risk</Th><Th>Must be confirmed by</Th><Th>Reason</Th></tr></thead>
          <tbody>{humanRequiredMatrix.map((m) => (
            <Tr key={m.action}><Td className="font-medium">{m.action}</Td><Td><RiskChip risk={m.risk} /></Td><Td>{m.confirmer}</Td><Td className="text-ink-soft">{m.reason}</Td></Tr>
          ))}</tbody>
        </Table>
      </Panel>
      <PolicyDrawer key={openId ?? "none"} policy={open} enabled={open ? enabled[open.id] : true} onToggle={(v) => open && setEnabled((s) => ({ ...s, [open.id]: v }))} onClose={() => setOpenId(null)} />
    </>
  );
}
