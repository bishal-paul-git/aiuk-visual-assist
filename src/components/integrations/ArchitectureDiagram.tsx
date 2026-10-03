"use client";
import { Panel } from "@/components/ui/primitives";
import { archEdges, archNodes, statusLabel, integrationById } from "@/lib/data/integrations";
import type { IntegrationStatus } from "@/lib/types/integrations";

const W = 940, H = 210, NW = 136, NH = 56;
const dot: Record<IntegrationStatus, string> = { demo: "#2f6bd7", connected: "#2a9d5c", requires_setup: "#d98a1c", not_configured: "#9aa5b5" };

export function ArchitectureDiagram({ statuses }: { statuses: Record<string, IntegrationStatus> }) {
  const byId = Object.fromEntries(archNodes.map((n) => [n.id, n]));
  return (
    <Panel title="Architecture" subtitle="Real-time loop (spec 6.1) — dot colour shows integration status; n8n sits outside the audio/video loop">
      <div className="overflow-x-auto">
        <svg viewBox={`-6 -6 ${W} ${H}`} className="min-w-[860px] w-full" role="img" aria-label="Customer to Twilio, then ElevenLabs voice and Media Gateway, into session state, Claude, then n8n or a human adviser">
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8592a6" /></marker>
          </defs>
          {archEdges.map(([a, b]) => {
            const from = byId[a], to = byId[b];
            const x1 = from.x + NW, y1 = from.y + NH / 2, x2 = to.x, y2 = to.y + NH / 2, mx = (x1 + x2) / 2;
            return <path key={a + b} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}`} fill="none" stroke="#8592a6" strokeWidth="1.25" markerEnd="url(#arr)" />;
          })}
          {archNodes.map((n) => {
            const st = n.integration ? statuses[n.integration] : undefined;
            const isHuman = n.id === "human";
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                <rect width={NW} height={NH} rx="4" className={isHuman ? "fill-human-soft stroke-human" : n.integration ? "fill-surface stroke-line" : "fill-subtle stroke-line"} strokeWidth="1" />
                <text x="10" y="22" className="fill-ink" fontSize="12" fontWeight="600">{n.label}</text>
                <text x="10" y="39" className="fill-ink-mute" fontSize="10">{n.sub}</text>
                {st && (
                  <g>
                    <circle cx={NW - 12} cy="14" r="4.5" fill={dot[st]} />
                    <title>{`${integrationById(n.integration!)?.name}: ${statusLabel[st]}`}</title>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-mute">
        {(Object.keys(dot) as IntegrationStatus[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: dot[s] }} />{statusLabel[s]}</li>
        ))}
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-subtle ring-1 ring-line" />AIUK-owned component (no integration)</li>
      </ul>
    </Panel>
  );
}
