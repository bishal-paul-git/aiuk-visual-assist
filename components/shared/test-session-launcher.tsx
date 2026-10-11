"use client";

import { useState } from "react";
import { Copy, ExternalLink, FlaskConical, Headset, Smartphone, X } from "lucide-react";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { buttonClass, cx } from "@/components/ui/primitives";

interface Created {
  id: string;
  customerPath: string;
  consolePath: string;
}

/**
 * Creates a real session on the runtime and hands out the secure customer
 * link. The scenario only drives the simulated vision provider.
 */
export function TestSessionLauncher({ variant = "primary" }: { variant?: "primary" | "navy" }) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState(SCENARIOS[0].key);
  const [channel, setChannel] = useState("secure_link");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<Created>();
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: "wf_router_v3", scenario, channel }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create session");
      setCreated(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const link = created ? `${typeof window !== "undefined" ? window.location.origin : ""}${created.customerPath}` : "";

  return (
    <>
      <button type="button" className={buttonClass(variant, "sm")} onClick={() => setOpen(true)}>
        <Smartphone className="size-3.5" aria-hidden /> Start test session
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4" role="dialog" aria-modal="true" aria-labelledby="launcher-title">
          <div className="w-full max-w-lg rounded-xl bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 id="launcher-title" className="text-sm font-semibold text-ink">
                Start a Router Visual Support session
              </h2>
              <button
                type="button"
                className={buttonClass("ghost", "sm")}
                onClick={() => {
                  setOpen(false);
                  setCreated(undefined);
                }}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            {!created ? (
              <div className="space-y-4 p-5">
                <p className="text-xs text-muted">
                  Creates a live session on <strong>Northline · Router Troubleshooting v3</strong> and issues a secure customer link. The AI
                  provider is <strong>simulated</strong>: the scenario decides what the vision model “sees”, so every branch can be tested.
                </p>
                <fieldset>
                  <legend className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                    <FlaskConical className="size-3.5" aria-hidden /> Simulation scenario
                  </legend>
                  <div className="grid max-h-64 gap-1.5 overflow-y-auto pr-1">
                    {SCENARIOS.map((s) => (
                      <label
                        key={s.key}
                        className={cx(
                          "flex cursor-pointer gap-3 rounded-md border px-3 py-2",
                          scenario === s.key ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2",
                        )}
                      >
                        <input type="radio" name="scenario" value={s.key} checked={scenario === s.key} onChange={() => setScenario(s.key)} className="mt-0.5 accent-brand" />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-ink">{s.name}</span>
                          <span className="block text-xs text-muted">{s.description}</span>
                          <span className="mt-0.5 block text-[11px] font-medium text-ink-2">Expected: {s.expectedOutcome}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-2">Entry channel</span>
                  <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm">
                    <option value="secure_link">Secure link</option>
                    <option value="sms">SMS link</option>
                    <option value="qr">QR code</option>
                    <option value="website">Website</option>
                    <option value="contact_centre">Contact-centre transfer</option>
                  </select>
                </label>
                {error && <p className="text-xs text-danger">{error}</p>}
                <div className="flex justify-end">
                  <button type="button" className={buttonClass("primary")} disabled={busy} onClick={create}>
                    {busy ? "Creating…" : "Create session"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <p className="text-sm text-ink-2">Session created. Open the customer link on a phone (or this device), then follow along in the console.</p>
                <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-ink">{link}</code>
                  <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={async () => {
                      await navigator.clipboard?.writeText(link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden /> {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <a href={created.customerPath} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                    <ExternalLink className="size-4" aria-hidden /> Open customer view
                  </a>
                  <a href={created.consolePath} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
                    <Headset className="size-4" aria-hidden /> Open in agent console
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
