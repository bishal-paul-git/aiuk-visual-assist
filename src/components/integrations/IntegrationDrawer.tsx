"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { Button, Drawer, Field, KeyValue, TextInput } from "@/components/ui/primitives";
import { actions } from "@/lib/store";
import { statusLabel } from "@/lib/data/integrations";
import type { Integration, IntegrationStatus } from "@/lib/types/integrations";
import { StatusPill, iconMap } from "./IntegrationCard";

export function IntegrationDrawer({ item, status, onClose, toast }: { item: Integration | null; status: IntegrationStatus; onClose: () => void; toast: (t: string, tone?: "ok" | "info") => void }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setTesting(false); setResult(null); return () => window.clearTimeout(timer.current); }, [item?.id]);
  if (!item) return null;
  const Icon = iconMap[item.icon];

  const test = () => {
    setTesting(true); setResult(null);
    timer.current = window.setTimeout(() => {
      setTesting(false);
      const msg = `Simulated: ${item.name} responded in ${120 + item.id.length * 17} ms. No request was sent.`;
      setResult(msg); toast(msg, "info");
    }, 1400);
  };
  const markConnected = () => {
    actions.setIntegrationStatus(item.id, "connected");
    toast(`${item.name} marked as connected (demo only — nothing was connected).`);
  };

  return (
    <Drawer
      open onClose={onClose} width="max-w-lg"
      title={<span className="flex items-center gap-2"><Icon size={16} />{item.name}</span>}
      subtitle={`${item.vendor} · ${item.category} · configuration preview`}
      footer={<>
        <Button onClick={test} disabled={testing}>{testing && <Loader2 size={14} className="animate-spin" />}{testing ? "Testing…" : "Test connection"}</Button>
        <Button variant="primary" onClick={markConnected} disabled={status === "connected"}>Mark as connected (demo)</Button>
      </>}
    >
      <div className="space-y-5">
        <div role="note" className="flex gap-2 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
          <ShieldAlert size={15} className="mt-px shrink-0" />
          <p><strong>Demo environment — no connection is made and no credentials are stored.</strong> Fields below are read-only placeholders.</p>
        </div>
        <div className="flex items-center gap-2"><span className="label">Status</span><StatusPill status={status} />{status !== item.defaultStatus && <span className="text-2xs text-ink-mute">(default: {statusLabel[item.defaultStatus]})</span>}</div>
        <p className="text-[13px] text-ink-soft">{item.role}</p>
        <div className="space-y-3">
          {item.fields.map((f) => (
            <Field key={f.label} label={f.label}>
              <TextInput readOnly value={f.value} aria-label={f.label} className={f.kind === "secret" ? "font-mono tracking-wider bg-subtle" : "bg-subtle font-mono text-xs"} />
            </Field>
          ))}
        </div>
        <KeyValue cols={2} items={[{ k: "Region", v: item.region }, { k: "Environment", v: item.environment }]} />
        <div>
          <p className="label mb-1">Capabilities used</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px] text-ink-soft">{item.capabilities.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
        {testing && <p className="flex items-center gap-2 text-xs text-ink-mute"><Loader2 size={13} className="animate-spin" />Simulating connection test…</p>}
        {result && <p className="flex items-start gap-2 rounded border border-line bg-subtle px-3 py-2 text-xs"><CheckCircle2 size={14} className="mt-px shrink-0 text-ok" /><span><strong>Simulated result.</strong> {result}</span></p>}
      </div>
    </Drawer>
  );
}
