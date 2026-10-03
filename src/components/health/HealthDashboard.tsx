"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { services, serviceById } from "@/lib/data/health";
import { DEMO_NOW } from "@/lib/data/sessions";
import type { ServiceStatus } from "@/lib/types/health";
import { useToast } from "@/components/audit/Toast";
import { ServiceCard } from "./ServiceCard";
import { ServiceDrawer } from "./ServiceDrawer";
import { IncidentDrawer, IncidentsPanel } from "./IncidentsPanel";
import { FallbackPanel, LatencyBudgetPanel } from "./ReliabilityPanels";

export function HealthDashboard() {
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [openService, setOpenService] = useState<string | null>(null);
  const [openIncident, setOpenIncident] = useState<string | null>(null);
  const toast = useToast();

  const statusOf = (id: string): ServiceStatus => {
    const s = serviceById(id)!;
    return s.incidentId && resolved[s.incidentId] && s.status !== "Maintenance" ? "Operational" : s.status;
  };
  const statuses = useMemo(() => services.map((s) => statusOf(s.id)), [resolved]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (st: ServiceStatus) => statuses.filter((x) => x === st).length;
  const banner = count("Incident") ? { label: "Service incident", tone: "bad", Icon: AlertTriangle } : count("Degraded") ? { label: "Partial degradation", tone: "warn", Icon: AlertTriangle } : count("Maintenance") ? { label: "Operational, maintenance scheduled", tone: "info", Icon: Wrench } : { label: "All systems operational", tone: "ok", Icon: CheckCircle2 };
  const detail = [count("Degraded") && `${count("Degraded")} degraded`, count("Incident") && `${count("Incident")} incident`, count("Maintenance") && `${count("Maintenance")} in maintenance`, `${count("Operational")} operational`].filter(Boolean).join(" · ");
  const tones: Record<string, string> = { ok: "border-ok/40 bg-ok-soft text-ok", warn: "border-warn/40 bg-warn-soft text-warn", bad: "border-bad/40 bg-bad-soft text-bad", info: "border-info/40 bg-info-soft text-info" };

  const svc = openService ? serviceById(openService) ?? null : null;
  return (
    <div className="space-y-5">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3", tones[banner.tone])}>
        <div className="flex items-center gap-2.5"><banner.Icon size={18} /><div><p className="text-sm font-semibold">{banner.label}</p><p className="text-xs opacity-80">{detail}</p></div></div>
        <p className="text-xs opacity-80">Last updated {DEMO_NOW} · demo data</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {services.map((s) => <ServiceCard key={s.id} service={s} status={statusOf(s.id)} acknowledged={!!acked[s.id]} onOpen={() => setOpenService(s.id)} />)}
      </div>

      <IncidentsPanel resolved={resolved} onOpen={setOpenIncident} />

      <div className="grid gap-5 lg:grid-cols-2">
        <FallbackPanel />
        <LatencyBudgetPanel />
      </div>

      <ServiceDrawer
        service={svc} status={svc ? statusOf(svc.id) : "Operational"} acknowledged={svc ? !!acked[svc.id] : false} notes={svc ? notes[svc.id] ?? [] : []} resolvedIncidents={resolved}
        onClose={() => setOpenService(null)} onOpenService={(name) => { const t = services.find((x) => x.name === name); if (t) setOpenService(t.id); }}
        onAck={() => { if (svc) { setAcked((a) => ({ ...a, [svc.id]: true })); toast.show(`${svc.name} acknowledged`); } }}
        onNote={(t) => { if (svc) { setNotes((n) => ({ ...n, [svc.id]: [...(n[svc.id] ?? []), t] })); toast.show("Maintenance note added"); } }}
        onOpenIncident={(id) => { setOpenService(null); setOpenIncident(id); }}
      />
      <IncidentDrawer id={openIncident} resolved={resolved} onClose={() => setOpenIncident(null)} onResolve={(id) => { setResolved((r) => ({ ...r, [id]: true })); toast.show(`${id} marked resolved`); }} />
      {toast.node}
    </div>
  );
}
