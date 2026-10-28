"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, FlaskConical, Headset, Mail, MessageSquare, Send, Sparkles, Smartphone, X, XCircle } from "lucide-react";
import { SCENARIOS } from "@/lib/providers/mock/scenarios";
import { BASE_PATH, STATIC_DEMO, getTransport, type LinkDelivery } from "@/lib/client/transport";
import { normaliseEmail, normalisePhone } from "@/lib/notifications/validate";
import { buttonClass, cx } from "@/components/ui/primitives";
import { useIdentity } from "@/lib/client/identity";
import { can } from "@/lib/auth/rbac";

interface Created {
  id: string;
  customerPath: string;
  consolePath: string;
  delivery?: LinkDelivery[];
}

/**
 * Creates a real session on the runtime and hands out the secure customer
 * link. The scenario only drives the simulated vision provider.
 */
export function TestSessionLauncher({
  variant = "primary",
  tenantId = "tnt_northline",
  workflowKey = "router-troubleshooting",
  workflowName = "X Telecom · Router Troubleshooting",
  liveOnly = false,
}: {
  variant?: "primary" | "navy";
  /** Client the session is created for (the client portal passes its own). */
  tenantId?: string;
  workflowKey?: string;
  workflowName?: string;
  /** Workflows without simulation scenarios (every client except Northline's router workflow) can only run on live AI. */
  liveOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState(liveOnly ? "live" : SCENARIOS[0].key);
  const [channel, setChannel] = useState("secure_link");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<Created>();
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState<{ liveReasoning: boolean; model: string | null }>();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const id = useIdentity();

  useEffect(() => {
    if (!open || live) return;
    getTransport()
      .then((t) => t.capabilities())
      .then(setLive)
      .catch(() => setLive({ liveReasoning: false, model: null }));
  }, [open, live]);

  async function create() {
    setError(undefined);
    const deliverTo: { sms?: string; email?: string } = {};
    if (!STATIC_DEMO && phone.trim()) {
      const p = normalisePhone(phone);
      if (!p) return setError("Enter the mobile number in international format, e.g. +44 7700 900123.");
      deliverTo.sms = p;
    }
    if (!STATIC_DEMO && email.trim()) {
      const e = normaliseEmail(email);
      if (!e) return setError("Enter a valid email address.");
      deliverTo.email = e;
    }
    setBusy(true);
    try {
      const t = await getTransport();
      const r = await t.createSession({
        workflowKey,
        tenantId,
        scenario,
        channel,
        ...(deliverTo.sms || deliverTo.email ? { deliverTo } : {}),
      });
      if (!r.ok) throw new Error(r.error);
      setCreated(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Only roles that may start sessions see the launcher (client admins and QA reviewers don't).
  if (id.status === "signed_in" && !can({ ...id.user, status: "active" }, "session.create", { tenantId })) return null;

  const link = created ? `${typeof window !== "undefined" ? window.location.origin : ""}${BASE_PATH}${created.customerPath}` : "";

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
                {liveOnly ? `Start a ${workflowName} session` : "Start a Router Visual Support session"}
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
                  Creates a live session on <strong>{workflowName}</strong> (current published version) and issues a secure customer link.{" "}
                  {liveOnly
                    ? "This workflow runs on live AI: what the AI sees is what you show the camera."
                    : "Choose live AI, or a simulation scenario that decides what the vision model “sees” so every branch can be tested."}
                </p>
                <label
                  className={cx(
                    "flex gap-3 rounded-md border px-3 py-2",
                    !live?.liveReasoning ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    scenario === "live" ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="scenario"
                    value="live"
                    disabled={!live?.liveReasoning}
                    checked={scenario === "live"}
                    onChange={() => setScenario("live")}
                    className="mt-0.5 accent-brand"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                      <Sparkles className="size-3.5 text-brand" aria-hidden /> Live AI
                    </span>
                    <span className="block text-xs text-muted">
                      {live === undefined
                        ? "Checking availability…"
                        : live.liveReasoning
                          ? "Real multimodal reasoning on the frames the camera sends. Results depend on what you actually show."
                          : STATIC_DEMO
                            ? "Available in the full version. This online demo uses the scenarios below."
                            : "Not configured on this deployment — set ANTHROPIC_API_KEY on the server to enable."}
                    </span>
                  </span>
                </label>
                {!liveOnly && (
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
                )}
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
                {!STATIC_DEMO && (
                  <fieldset className="rounded-md border border-line p-3">
                    <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-ink-2">
                      <Send className="size-3.5" aria-hidden /> Send the link to the customer <span className="font-normal text-muted">(optional)</span>
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-ink-2">Mobile (SMS)</span>
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="off"
                          placeholder="+44 7700 900123"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-ink-2">Email</span>
                        <input
                          type="email"
                          autoComplete="off"
                          placeholder="customer@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm"
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      Sent through the configured SMS and email providers. Without provider credentials the message is kept in the outbox on the Integrations page
                      instead of being delivered.
                    </p>
                  </fieldset>
                )}
                {error && <p className="text-xs text-danger">{error}</p>}
                <div className="flex justify-end">
                  <button type="button" className={buttonClass("primary")} disabled={busy || (liveOnly && live !== undefined && !live.liveReasoning)} onClick={create}>
                    {busy ? "Creating…" : "Create session"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <p className="text-sm text-ink-2">Session created. Open the customer link on a phone (or this device), then follow along in the console.</p>
                {created.delivery && created.delivery.length > 0 && (
                  <ul className="space-y-1.5" aria-label="Link delivery">
                    {created.delivery.map((d) => (
                      <li key={d.channel} className="flex items-start gap-2 rounded-md border border-line px-3 py-2 text-xs">
                        {d.channel === "sms" ? <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden /> : <Mail className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />}
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">
                            {d.channel === "sms" ? "SMS" : "Email"} to {d.to}
                          </span>
                          <span className="block text-muted">
                            {d.ok ? (d.simulated ? "Recorded in the outbox — not delivered (no provider configured)" : `Accepted by ${d.provider}`) : (d.error ?? "Not sent")}
                          </span>
                        </span>
                        {d.ok ? <CheckCircle2 className="size-4 shrink-0 text-ok" aria-label="Sent" /> : <XCircle className="size-4 shrink-0 text-danger" aria-label="Failed" />}
                      </li>
                    ))}
                  </ul>
                )}
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
                  <a href={`${BASE_PATH}${created.customerPath}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                    <ExternalLink className="size-4" aria-hidden /> Open customer view
                  </a>
                  <a href={`${BASE_PATH}${created.consolePath}`} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
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
