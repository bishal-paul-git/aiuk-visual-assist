import { ArrowRightLeft, Camera, Headphones, PhoneCall } from "lucide-react";
import { Chip, Panel, type Tone } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { fallbackPaths, latencyBudget } from "@/lib/data/health";

const icons = { "voice-only": Headphones, "still-image": Camera, human: ArrowRightLeft, callback: PhoneCall } as const;
const tone: Record<string, Tone> = { Ready: "ok", Active: "info", Degraded: "warn" };

export function FallbackPanel() {
  return (
    <Panel title="Reliability fallbacks" subtitle="Graceful degradation paths (spec §14)" bodyClassName="divide-y divide-line p-0">
      {fallbackPaths.map((f) => {
        const Icon = icons[f.id as keyof typeof icons];
        return (
          <div key={f.id} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 rounded bg-subtle p-1.5 text-ink-soft"><Icon size={14} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-semibold">{f.name}</p><Chip tone={tone[f.status]} dot>{f.status}</Chip></div>
              <p className="text-xs text-ink-soft">{f.behaviour}</p>
              <p className="mt-1 text-2xs text-ink-mute">Trigger: {f.trigger}</p>
              <p className="mt-0.5 text-2xs text-ink-mute"><span className="num">{f.last24h}</span> invocations 24h · tested {f.lastTested}</p>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

export function LatencyBudgetPanel() {
  const budget = latencyBudget.reduce((a, s) => a + s.budgetMs, 0);
  const actual = latencyBudget.reduce((a, s) => a + s.actualMs, 0);
  const max = Math.max(budget, actual);
  const over = actual > budget;
  const Bar = ({ ms, kind }: { ms: (s: (typeof latencyBudget)[number]) => number; kind: "budget" | "actual" }) => (
    <div className="flex h-5 w-full overflow-hidden rounded-sm bg-subtle">
      {latencyBudget.map((s, i) => (
        <div key={s.id} style={{ width: `${(ms(s) / max) * 100}%` }} title={`${s.label}: ${ms(s)} ms`}
          className={cn("border-r border-surface", kind === "budget" ? ["bg-line", "bg-line", "bg-line", "bg-line"][i] : s.actualMs > s.budgetMs ? "bg-warn" : "bg-brand")} />
      ))}
    </div>
  );
  return (
    <Panel title="Pipeline latency budget" subtitle="Capture → select → inference → response · end-to-end, p95" actions={<Chip tone={over ? "warn" : "ok"} dot>{over ? "Over budget" : "Within budget"}</Chip>}>
      <div className="space-y-2.5">
        <div><p className="mb-1 flex justify-between text-2xs text-ink-mute"><span>Budget</span><span className="num">{budget.toLocaleString("en-GB")} ms</span></p><Bar ms={(s) => s.budgetMs} kind="budget" /></div>
        <div><p className="mb-1 flex justify-between text-2xs text-ink-mute"><span>Actual (p95)</span><span className={cn("num", over && "font-semibold text-warn")}>{actual.toLocaleString("en-GB")} ms</span></p><Bar ms={(s) => s.actualMs} kind="actual" /></div>
      </div>
      <ul className="mt-4 divide-y divide-line text-[13px]">
        {latencyBudget.map((s) => {
          const o = s.actualMs > s.budgetMs;
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><p className="font-medium">{s.label}</p><p className="truncate text-2xs text-ink-mute">{s.detail}</p></div>
              <div className="num shrink-0 text-right text-xs"><span className={cn(o && "font-semibold text-warn")}>{s.actualMs.toLocaleString("en-GB")} ms</span><span className="text-ink-mute"> / {s.budgetMs.toLocaleString("en-GB")}</span></div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
