"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Database, FlaskConical, Loader2, Plug, PlugZap, XCircle } from "lucide-react";
import type { ConnectorStatus } from "@/lib/integrations/status";
import { Badge, buttonClass, cx, Table, Td, Th } from "@/components/ui/primitives";
import { ConnectorModeBadge, LastCall } from "@/components/platform/connector-status";
import { Mono } from "@/components/platform/config-ui";

type Mode = "simulated" | "builtin" | "http";

interface TestResult {
  route: "simulated" | "builtin" | "http" | "invalid";
  ok: boolean;
  latencyMs?: number;
  errorCode?: string;
  externalRef?: string;
  message: string;
}

const MODES: { value: Mode; label: string; hint: string; icon: typeof Plug }[] = [
  { value: "builtin", label: "Built-in", hint: "Visual Assist keeps the record itself. No outside system needed.", icon: Database },
  { value: "http", label: "Client API or n8n", hint: "Calls an HTTPS endpoint, signed with a shared secret.", icon: Plug },
  { value: "simulated", label: "Sandbox", hint: "Pretend results for demos. Nothing is recorded as real.", icon: FlaskConical },
];

const input = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm";

/**
 * Connect a client's business actions from the platform: choose a mode for
 * some or all tools, enter an endpoint and shared secret once, save, then test
 * each tool. Tools set by INTEGRATIONS_CONFIG are shown but locked.
 */
export function ConnectorEditor({ tenantId, connectors, secret }: { tenantId: string; connectors: ConnectorStatus[]; secret: { set: boolean; source?: "env" | "stored" } }) {
  const router = useRouter();
  const editable = connectors.filter((c) => c.source !== "env");
  const firstHttp = connectors.find((c) => c.mode === "http");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(editable.map((c) => c.tool)));
  const [mode, setMode] = useState<Mode>("builtin");
  const [endpoint, setEndpoint] = useState(firstHttp?.endpoint ?? "");
  const [secretValue, setSecretValue] = useState("");
  const [secretHeader, setSecretHeader] = useState(firstHttp?.secretHeader ?? true);
  const [includeScenario, setIncludeScenario] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [tests, setTests] = useState<Record<string, TestResult | "running">>({});

  const chosen = editable.filter((c) => selected.has(c.tool));
  const skipped = mode === "builtin" ? chosen.filter((c) => !c.builtinAvailable) : [];
  const toggle = (tool: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(tool)) n.delete(tool);
      else n.add(tool);
      return n;
    });

  async function save() {
    setBusy(true);
    setMessage(undefined);
    const tools = chosen.filter((c) => mode !== "builtin" || c.builtinAvailable).map((c) => c.tool);
    const res = await fetch("/api/integrations/connectors", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, tools, mode, endpoint: mode === "http" ? endpoint.trim() : undefined, secret: mode === "http" && secretValue ? secretValue.trim() : undefined, secretHeader, includeScenarioSessions: includeScenario, system: mode === "http" ? systemLabel(endpoint) : undefined }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (!res) return setMessage({ ok: false, text: "Could not reach the server." });
    if (body.error) return setMessage({ ok: false, text: body.error });
    const results = (body.results ?? []) as { tool: string; ok: boolean; error?: string }[];
    const bad = results.filter((r) => !r.ok);
    setSecretValue("");
    setTests({});
    setMessage({
      ok: bad.length === 0,
      text: bad.length ? `Saved ${results.length - bad.length}; not saved: ${bad.map((b) => `${b.tool} (${b.error})`).join(", ")}` : `Saved ${results.length} tool${results.length === 1 ? "" : "s"}${body.secretSaved ? " and the secret" : ""}. Now press Test on each tool.`,
    });
    router.refresh();
  }

  async function test(tool: string) {
    setTests((t) => ({ ...t, [tool]: "running" }));
    const res = await fetch("/api/integrations/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, tool }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as (TestResult & { error?: string }) | null;
    setTests((t) => ({ ...t, [tool]: body && !body.error ? body : { route: "invalid", ok: false, message: body?.error ?? "Could not reach the server." } }));
  }

  async function testAll() {
    for (const c of connectors) await test(c.tool);
  }

  const canSave = chosen.length > 0 && !busy && (mode !== "http" || (/^https:\/\//.test(endpoint.trim()) && (secret.set || secretValue.trim().length >= 32)));

  return (
    <div className="space-y-3 p-4">
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-[12px] font-semibold text-ink">1. How should these actions run?</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.value} className={cx("flex cursor-pointer gap-2 rounded-md border p-2.5", mode === m.value ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2")}>
              <input type="radio" name={`mode-${tenantId}`} value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-0.5 accent-brand" />
              <span>
                <span className="flex items-center gap-1 text-[13px] font-medium text-ink">
                  <m.icon className="size-3.5" aria-hidden /> {m.label}
                </span>
                <span className="block text-[11px] text-muted">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "http" && (
        <fieldset className="grid min-w-0 gap-2 md:grid-cols-2">
          <legend className="mb-1.5 text-[12px] font-semibold text-ink">2. Where to send them</legend>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-[11px] font-medium text-ink-2">Endpoint URL (HTTPS). One URL can serve every tool; the tool name is in the request.</span>
            <input className={input} type="url" inputMode="url" autoComplete="off" placeholder="https://your-n8n.example/webhook/visual-assist/actions" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-2">
              Shared secret (32+ characters){" "}
              {secret.set && <span className="text-ok">· set{secret.source === "env" ? " on the server" : ""}, leave blank to keep</span>}
            </span>
            <input className={input} type="password" autoComplete="new-password" placeholder={secret.set ? "••••••••  (unchanged)" : "Paste the secret"} value={secretValue} onChange={(e) => setSecretValue(e.target.value)} />
          </label>
          <div className="flex flex-col justify-end gap-1 text-[12px] text-ink-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={secretHeader} onChange={(e) => setSecretHeader(e.target.checked)} className="accent-brand" /> Send the secret as X-VA-Secret (needed for n8n)
            </label>
          </div>
        </fieldset>
      )}

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-[12px] font-semibold text-ink">{mode === "http" ? "3" : "2"}. Which tools</legend>
        <Table>
          <thead>
            <tr>
              <Th className="w-8">
                <span className="sr-only">Select</span>
              </Th>
              <Th>Tool</Th>
              <Th>Now</Th>
              <Th>Last call</Th>
              <Th align="right">Test</Th>
            </tr>
          </thead>
          <tbody>
            {connectors.map((c) => {
              const locked = c.source === "env";
              const t = tests[c.tool];
              return (
                <tr key={c.tool}>
                  <Td>
                    <input type="checkbox" aria-label={`Select ${c.tool}`} disabled={locked} checked={!locked && selected.has(c.tool)} onChange={() => toggle(c.tool)} className="accent-brand" />
                  </Td>
                  <Td>
                    <Mono>{c.tool}</Mono>
                    {locked && <div className="text-[11px] text-muted">Set by INTEGRATIONS_CONFIG</div>}
                    {mode === "builtin" && !c.builtinAvailable && !locked && <div className="text-[11px] text-muted">Needs a client API (no built-in)</div>}
                  </Td>
                  <Td>
                    <ConnectorModeBadge mode={c.mode} />
                    {c.endpointHost && <div className="mt-0.5 font-mono text-[11px] text-muted">{c.endpointHost}</div>}
                    {c.mode === "http" && c.secretState === "missing" && <div className="mt-0.5 text-[11px] text-danger">Secret missing</div>}
                    {c.error && <div className="mt-0.5 max-w-56 text-[11px] text-danger">{c.error}</div>}
                  </Td>
                  <Td className="text-xs">
                    <LastCall c={c} />
                  </Td>
                  <Td align="right">
                    <button type="button" className={buttonClass("secondary", "sm")} disabled={t === "running"} onClick={() => test(c.tool)}>
                      {t === "running" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <PlugZap className="size-3.5" aria-hidden />} Test
                    </button>
                    {t && t !== "running" && (
                      <div className={cx("mt-1 max-w-64 text-left text-[11px]", t.ok ? "text-ok" : "text-danger")} role="status">
                        <span className="inline-flex items-center gap-1">
                          {t.ok ? <CheckCircle2 className="size-3" aria-hidden /> : <XCircle className="size-3" aria-hidden />}
                          {t.message}
                        </span>
                        <span className="block text-muted">
                          {t.latencyMs !== undefined ? `${t.latencyMs.toLocaleString("en-GB")} ms` : ""}
                          {t.externalRef ? ` · ref ${t.externalRef}` : ""}
                          {t.errorCode ? ` · ${t.errorCode}` : ""}
                        </span>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </fieldset>

      <label className="flex items-center gap-2 text-[12px] text-ink-2">
        <input type="checkbox" checked={includeScenario} onChange={(e) => setIncludeScenario(e.target.checked)} className="accent-brand" /> Also use this for scripted scenario sessions (normally only Live AI sessions use it)
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass("primary", "sm")} disabled={!canSave} onClick={save}>
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null} Save for {chosen.length - skipped.length} tool{chosen.length - skipped.length === 1 ? "" : "s"}
        </button>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={testAll}>
          <PlugZap className="size-3.5" aria-hidden /> Test all
        </button>
        {skipped.length > 0 && <Badge tone="neutral">{skipped.length} without a built-in option are left as they are</Badge>}
        {mode === "http" && !canSave && chosen.length > 0 && <span className="text-[11px] text-muted">Enter an https:// URL and the secret to save.</span>}
      </div>
      {message && (
        <p className={cx("text-[12px]", message.ok ? "text-ok" : "text-danger")} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}

function systemLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    return /n8n/i.test(host) || /\/webhook\//.test(url) ? "n8n" : host;
  } catch {
    return "Client API";
  }
}
