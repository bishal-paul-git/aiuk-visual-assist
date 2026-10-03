import type { ActorType, AuditEvent, AuditResult } from "../types/audit";
import { sessions } from "./sessions";
import { clientById } from "./clients";

function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

/** Deterministic 64-hex mock digest (FNV-1a folded). Demo only, not cryptographic. */
function mockHash(input: string): string {
  let out = "";
  for (let k = 0; k < 8; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b1);
    for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}

export const AUDIT_EVENT_TYPES = [
  "Session started", "Consent recorded", "Frame selected", "Observation low confidence", "Tool action", "Action blocked by policy",
  "Escalation raised", "Ownership changed", "Session ended", "Workflow published", "Policy updated", "User login", "Config changed", "Retention purge",
] as const;
export const AUDIT_ACTOR_TYPES: ActorType[] = ["AI agent", "Human adviser", "System", "Policy engine", "Admin user"];
export const AUDIT_RESULTS: AuditResult[] = ["Success", "Warning", "Blocked", "Failed"];

const MODEL = "vision-4.2 (demo)";
const POLICY = "POL-VC v2.3";

type Draft = Omit<AuditEvent, "id" | "at" | "hash" | "prevHash" | "tenant" | "policyVersion" | "modelVersion"> & { tenant?: string; policyVersion?: string; modelVersion?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
const iso = (day: number, h: number, m: number, s: number) => `2026-10-${pad(day)}T${pad(h)}:${pad(m)}:${pad(s)}Z`;

function build(): AuditEvent[] {
  const r = rng(11909);
  const d: Draft[] = [];
  const tenantOf = (cid: string) => clientById(cid)?.name ?? cid;

  // --- Hand-crafted trail for the primary demo session ---
  const s0 = sessions.find((s) => s.id === "VA-27413")!;
  const wf0 = `${s0.workflowName} ${s0.workflowVersion}`;
  const t0 = tenantOf(s0.clientId);
  const base = (x: Partial<Draft> & Pick<Draft, "iso" | "actor" | "actorType" | "event" | "result" | "payload">): Draft => ({
    sessionId: "VA-27413", tenant: t0, workflowVersion: wf0, ...x,
  });
  d.push(
    base({ iso: iso(3, 13, 18, 4), actor: "System", actorType: "System", event: "Session started", result: "Success", payload: { channel: "QR code", agent: "Ava", region: "uk-south-london", device: "iOS 18 / Safari" } }),
    base({ iso: iso(3, 13, 18, 19), actor: "Customer consent", actorType: "System", event: "Consent recorded", result: "Success", payload: { consentVersion: "CONSENT-CW v4", scopes: ["camera", "audio", "frame_retention_14d"], granted: true } }),
    base({ iso: iso(3, 13, 19, 12), actor: "Ava (AI)", actorType: "AI agent", event: "Frame selected", result: "Success", payload: { frameId: "F-0003", trigger: "workflow_checkpoint", quality: 0.88, selectedForModel: true } }),
    base({ iso: iso(3, 13, 20, 41), actor: "Ava (AI)", actorType: "AI agent", event: "Observation low confidence", result: "Warning", payload: { observation: "WAN light state", confidence: 0.54, threshold: 0.7, status: "uncertain", frameId: "F-0007", action: "request_another_view" } }),
    base({ iso: iso(3, 13, 21, 33), actor: "Ava (AI)", actorType: "AI agent", event: "Tool action", result: "Success", payload: { tool: "lookup_router_model", request: { account: "****4821" }, response: { model: "ClearWave Hub 3", firmware: "3.2.1" }, latencyMs: 412 } }),
    base({ iso: iso(3, 13, 22, 58), actor: "Ava (AI)", actorType: "AI agent", event: "Tool action", result: "Success", payload: { tool: "check_line_status", status: "no_fault_detected", latencyMs: 640 } }),
    base({ iso: iso(3, 13, 23, 27), actor: "Policy engine", actorType: "Policy engine", event: "Action blocked by policy", result: "Blocked", payload: { attempted: "remote_factory_reset", rule: "POL-VC-017", reason: "Destructive action requires human approval", ruleSet: POLICY } }),
    base({ iso: iso(3, 13, 23, 40), actor: "Ava (AI)", actorType: "AI agent", event: "Escalation raised", result: "Success", payload: { reason: "Low visual confidence", confidence: 0.61, queue: "clearwave-tier2", waitSec: 14 } }),
    base({ iso: iso(3, 13, 23, 58), actor: "Priya Nair", actorType: "Human adviser", event: "Ownership changed", result: "Success", payload: { from: "AI", to: "Human", mode: "take_over", handoverSummary: true } }),
    base({ iso: iso(3, 13, 24, 31), actor: "Priya Nair", actorType: "Human adviser", event: "Frame selected", result: "Success", payload: { frameId: "F-0012", trigger: "human_request", quality: 0.93, note: "Router rear ports" } }),
    base({ iso: iso(3, 13, 24, 16), actor: "Priya Nair", actorType: "Human adviser", event: "Tool action", result: "Success", payload: { tool: "create_callback", slot: "none", note: "Not required" } }),
    base({ iso: iso(3, 13, 24, 36), actor: "Priya Nair", actorType: "Human adviser", event: "Session ended", result: "Success", payload: { outcome: "Resolved by human", durationSec: 372, framesAnalysed: 14, cost: 0.84 } }),
  );

  // --- Generated session trails ---
  const others = sessions.filter((s) => s.id !== "VA-27413");
  const aiNames: Record<string, string> = { ava: "Ava (AI)", sophie: "Sophie (AI)", ella: "Ella (AI)" };
  for (let n = 0; n < 15; n++) {
    const s = others[Math.floor(r() * others.length)];
    const day = 1 + Math.floor(r() * 3), h = 8 + Math.floor(r() * 9), m0 = Math.floor(r() * 50);
    let sec = Math.floor(r() * 40);
    const t = tenantOf(s.clientId), wf = `${s.workflowName} ${s.workflowVersion}`, ai = aiNames[s.agentId] ?? "AI agent";
    const step = () => { sec += 8 + Math.floor(r() * 50); return iso(day, h, m0 + Math.floor(sec / 60), sec % 60); };
    const mk = (e: string, actor: string, at: ActorType, res: AuditResult, payload: Record<string, unknown>) =>
      d.push({ iso: step(), sessionId: s.id, tenant: t, workflowVersion: wf, actor, actorType: at, event: e, result: res, payload });
    mk("Session started", "System", "System", "Success", { channel: s.channel, agent: s.agentName });
    mk("Consent recorded", "Customer consent", "System", "Success", { scopes: ["camera", "audio"], granted: true });
    mk("Frame selected", ai, "AI agent", "Success", { frameId: `F-${pad(1 + Math.floor(r() * 9))}`, trigger: r() > 0.5 ? "scene_change" : "workflow_checkpoint", quality: +(0.7 + r() * 0.25).toFixed(2) });
    if (r() > 0.45) mk("Observation low confidence", ai, "AI agent", "Warning", { confidence: +(0.45 + r() * 0.22).toFixed(2), threshold: 0.7, action: "request_another_view" });
    if (r() > 0.4) mk("Tool action", ai, "AI agent", r() > 0.85 ? "Failed" : "Success", { tool: ["check_line_status", "lookup_account", "create_case", "book_engineer"][Math.floor(r() * 4)], latencyMs: 300 + Math.floor(r() * 900) });
    if (r() > 0.72) mk("Action blocked by policy", "Policy engine", "Policy engine", "Blocked", { rule: `POL-VC-0${10 + Math.floor(r() * 12)}`, reason: "Requires human approval" });
    if (s.escalated) {
      mk("Escalation raised", ai, "AI agent", "Success", { reason: s.escalationReason ?? "Low visual confidence", queue: `${s.clientId}-tier2` });
      mk("Ownership changed", s.humanAgent ?? "Human adviser", "Human adviser", "Success", { from: "AI", to: "Human" });
    }
    mk("Session ended", s.escalated ? s.humanAgent ?? "Human adviser" : "System", s.escalated ? "Human adviser" : "System", s.status === "failed" ? "Failed" : "Success", { outcome: s.outcome, durationSec: s.durationSec });
  }

  // --- Platform / admin events (no session) ---
  const admins = ["Amelia Hart", "Marcus Lee", "Rhiannon Pugh"];
  const platform: [string, ActorType, string, AuditResult, Record<string, unknown>, string?][] = [
    ["Workflow published", "Admin user", admins[0], "Success", { workflow: "Router Troubleshooting", version: "v3", changes: 4, approvedBy: "Marcus Lee" }, "ClearWave Telecom"],
    ["Workflow published", "Admin user", admins[1], "Success", { workflow: "Boiler Visual Triage", version: "v2", changes: 2 }, "Northstar Utilities"],
    ["Policy updated", "Admin user", admins[0], "Success", { policy: "POL-VC", from: "v2.2", to: "v2.3", rulesChanged: ["POL-VC-017"] }, "ClearWave Telecom"],
    ["Policy updated", "Admin user", admins[2], "Warning", { policy: "POL-HI", from: "v1.4", to: "v1.5", note: "Pending second approver" }, "Horizon Insurance"],
    ["User login", "Admin user", admins[0], "Success", { method: "SSO (SAML)", mfa: true, ip: "203.0.113.24" }],
    ["User login", "Admin user", admins[1], "Success", { method: "SSO (SAML)", mfa: true, ip: "203.0.113.58" }],
    ["User login", "Admin user", "unknown user", "Failed", { method: "password", mfa: false, ip: "198.51.100.77", reason: "invalid_credentials", attempts: 3 }],
    ["Config changed", "Admin user", admins[0], "Success", { key: "frame.sampling.periodSec", from: 10, to: 8 }, "ClearWave Telecom"],
    ["Config changed", "Admin user", admins[2], "Success", { key: "retention.defaultDays", from: 30, to: 14 }, "ClearWave Telecom"],
    ["Config changed", "Admin user", admins[1], "Failed", { key: "voice.fallback.enabled", error: "validation_failed" }, "Northstar Utilities"],
    ["Retention purge", "System", "Retention job", "Success", { scope: "frames", olderThanDays: 14, objectsDeleted: 1842, bytesFreed: 2410000000 }, "ClearWave Telecom"],
    ["Retention purge", "System", "Retention job", "Success", { scope: "frames", olderThanDays: 30, objectsDeleted: 967 }, "Northstar Utilities"],
    ["Retention purge", "System", "Retention job", "Warning", { scope: "evidence", olderThanDays: 90, objectsDeleted: 211, skippedLegalHold: 6 }, "Horizon Insurance"],
    ["Policy updated", "Policy engine", "Policy engine", "Success", { policy: "POL-VC", action: "hot-reload", rules: 31 }, "ClearWave Telecom"],
    ["Config changed", "System", "Autoscaler", "Success", { key: "visual.region.secondary", from: "inactive", to: "active", incident: "INC-0412" }],
  ];
  platform.forEach((p, i) => {
    const day = 1 + (i % 3), h = 7 + Math.floor(r() * 11);
    d.push({ iso: iso(day, h, Math.floor(r() * 59), Math.floor(r() * 59)), sessionId: null, tenant: p[5] ?? "Platform", workflowVersion: p[0] === "Workflow published" ? `${(p[4] as { workflow: string; version: string }).workflow} ${(p[4] as { version: string }).version}` : null, actorType: p[1], actor: p[2], event: p[0], result: p[3], payload: p[4] });
  });

  // Chain: sort ascending to compute hashes, then present newest first.
  d.sort((a, b) => a.iso.localeCompare(b.iso));
  let prev = "0".repeat(64);
  const out: AuditEvent[] = d.map((x, i) => {
    const ev: AuditEvent = { ...x, tenant: x.tenant ?? "Platform", policyVersion: x.policyVersion ?? POLICY, modelVersion: x.modelVersion ?? MODEL, id: `AUD-${String(40100 + i)}`, at: fmt(x.iso), hash: "", prevHash: prev };
    ev.hash = mockHash(prev + ev.id + ev.iso + ev.event + JSON.stringify(ev.payload));
    prev = ev.hash;
    return ev;
  });
  return out.reverse();
}

export const auditEvents: AuditEvent[] = build();
export const auditTenants = ["Platform", ...Array.from(new Set(auditEvents.map((e) => e.tenant))).filter((t) => t !== "Platform")];
