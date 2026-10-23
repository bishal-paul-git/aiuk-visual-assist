import { CheckCircle2, Database, FlaskConical, KeyRound, Plug, TriangleAlert, XCircle } from "lucide-react";
import type { ConnectorStatus } from "@/lib/integrations/status";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Badge, Table, Td, Th } from "@/components/ui/primitives";
import { Mono } from "@/components/platform/config-ui";

const I = "size-3";

export function ConnectorModeBadge({ mode }: { mode: ConnectorStatus["mode"] }) {
  if (mode === "http")
    return (
      <Badge tone="ok" icon={<Plug className={I} aria-hidden />}>
        Client API
      </Badge>
    );
  if (mode === "builtin")
    return (
      <Badge tone="violet" icon={<Database className={I} aria-hidden />}>
        Built-in
      </Badge>
    );
  if (mode === "invalid")
    return (
      <Badge tone="danger" icon={<TriangleAlert className={I} aria-hidden />}>
        Misconfigured
      </Badge>
    );
  return (
    <Badge tone="brand" icon={<FlaskConical className={I} aria-hidden />}>
      Simulated
    </Badge>
  );
}

function SourceLabel({ c }: { c: ConnectorStatus }) {
  if (c.source === "default") return <span className="text-muted">Default sandbox</span>;
  return <span className="text-muted">{c.source === "env" ? "INTEGRATIONS_CONFIG" : "Set on Integrations page"}</span>;
}

function Secret({ c }: { c: ConnectorStatus }) {
  if (c.mode !== "http" || !c.secretRef) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Badge tone={c.secretState === "set" ? "ok" : "danger"} icon={<KeyRound className={I} aria-hidden />}>
        {c.secretState === "set" ? "Set" : "Missing"}
      </Badge>
      <span className="font-mono text-[11px] text-muted">{c.secretRef}</span>
      {c.secretSource === "stored" && <span className="text-[11px] text-muted">Entered on this page (encrypted)</span>}
    </span>
  );
}

export function LastCall({ c }: { c: ConnectorStatus }) {
  const l = c.lastCall;
  if (!l) return <span className="text-muted">No calls yet</span>;
  const ok = l.status === "succeeded";
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className={ok ? "inline-flex items-center gap-1 text-ok" : "inline-flex items-center gap-1 text-danger"}>
        {ok ? <CheckCircle2 className={I} aria-hidden /> : <XCircle className={I} aria-hidden />}
        {ok ? "Succeeded" : `Failed${l.errorCode ? ` · ${l.errorCode}` : ""}`}
        {l.latencyMs !== undefined && <span className="text-ink-2">· {l.latencyMs.toLocaleString("en-GB")} ms</span>}
      </span>
      <span className="text-[11px] text-muted" title={formatDateTime(l.at)}>
        {formatRelative(l.at)} · {l.mode === "http" ? l.provider : l.mode === "builtin" ? "built-in" : "sandbox"}
        {l.externalRef ? (
          <>
            {" "}
            · ref <span className="font-mono">{l.externalRef}</span>
          </>
        ) : null}
      </span>
    </span>
  );
}

/** Connector routing per tool for one tenant (read-only; no secret values, endpoint host only). */
export function ConnectorTable({ connectors }: { connectors: ConnectorStatus[] }) {
  if (connectors.length === 0) return <p className="px-4 py-6 text-sm text-muted">No business actions configured.</p>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Tool</Th>
          <Th>Mode</Th>
          <Th>Endpoint</Th>
          <Th>Signing secret</Th>
          <Th align="right">Timeout</Th>
          <Th>Last call</Th>
        </tr>
      </thead>
      <tbody>
        {connectors.map((c) => (
          <tr key={c.tool}>
            <Td>
              <Mono>{c.tool}</Mono>
              <div className="mt-0.5 text-[11px]">
                <SourceLabel c={c} />
              </div>
            </Td>
            <Td>
              <ConnectorModeBadge mode={c.mode} />
              {c.error && <div className="mt-1 max-w-56 text-[11px] text-danger">{c.error}</div>}
              {c.mode === "http" && !c.includeScenarioSessions && <div className="mt-1 text-[11px] text-muted">Scenario sessions simulated</div>}
            </Td>
            <Td>
              {c.endpointHost ? (
                <>
                  <span className="font-mono text-xs text-ink">{c.endpointHost}</span>
                  {c.system && <div className="text-[11px] text-muted">{c.system}</div>}
                </>
              ) : (
                <span className="text-muted">{c.mode === "builtin" ? "Visual Assist records" : "Sandbox executor"}</span>
              )}
            </Td>
            <Td>
              <Secret c={c} />
            </Td>
            <Td align="right">{c.timeoutMs !== undefined && c.mode === "http" ? `${c.timeoutMs.toLocaleString("en-GB")} ms` : "—"}</Td>
            <Td className="text-xs">
              <LastCall c={c} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
