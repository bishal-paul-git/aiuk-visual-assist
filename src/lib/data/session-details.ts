import type { AuditEntry, CostLine, Frame, Session, SessionDetail, ToolAction, TranscriptLine, VisualObservation, WorkflowStepProgress } from "../types";
import { sessionById } from "./sessions";

const PRIMARY: SessionDetail = {
  sessionId: "VA-27413",
  summary:
    "Customer J. Morrison reported no internet on a ClearWave Hub 5. AI confirmed power and DSL status from the front view, but the Internet LED could not be read reliably in two selected frames (glare, 0.58 and 0.61 confidence). Rear cable view showed cables seated. A remote line reset was run without recovery. Confidence stayed below the 0.70 policy threshold, so the session was escalated to a human adviser with all evidence attached. The adviser identified a loose DSL filter, the customer re-seated it and service was restored.",
  recommendedNext: "Confirm Internet LED is steady green with the customer, then close the case and send the SMS summary.",
  uncertaintyFlags: ["Internet LED state unresolved after 2 attempts (glare on casing)", "Wi-Fi LED not in any selected frame", "Customer router model inferred from badge — 0.82"],
  observations: [
    { id: "o1", text: "ClearWave Hub 5 router identified from front badge", confidence: 0.96, status: "confirmed_visible", frameId: "F-01", requiresConfirmation: false, at: "01:02" },
    { id: "o2", text: "Power LED steady green", confidence: 0.94, status: "confirmed_visible", frameId: "F-03", requiresConfirmation: false, at: "01:48" },
    { id: "o3", text: "DSL LED flashing amber", confidence: 0.88, status: "likely_visible", frameId: "F-03", requiresConfirmation: false, at: "01:48" },
    { id: "o4", text: "Internet LED appears off", confidence: 0.58, status: "uncertain", frameId: "F-05", requiresConfirmation: true, at: "02:31" },
    { id: "o5", text: "Internet LED state could not be read — glare on casing", confidence: 0.61, status: "needs_another_view", frameId: "F-07", requiresConfirmation: true, at: "03:12" },
    { id: "o6", text: "DSL cable inserted in rear DSL port", confidence: 0.9, status: "confirmed_visible", frameId: "F-09", requiresConfirmation: false, at: "03:58" },
    { id: "o7", text: "Inline DSL filter visible but not fully seated", confidence: 0.64, status: "conflicting_evidence", frameId: "F-12", requiresConfirmation: true, at: "05:20" },
  ],
  frames: [
    { id: "F-01", scene: "router_front", label: "Router front view", trigger: "workflow_checkpoint", at: "01:02", quality: 0.92, selectedForModel: true },
    { id: "F-03", scene: "router_lights", label: "Status lights", trigger: "workflow_checkpoint", at: "01:48", quality: 0.88, selectedForModel: true },
    { id: "F-05", scene: "router_blur", label: "Status lights (glare)", trigger: "ai_request", at: "02:31", quality: 0.46, selectedForModel: true },
    { id: "F-07", scene: "router_blur", label: "Closer frame — retry", trigger: "ai_request", at: "03:12", quality: 0.52, selectedForModel: true },
    { id: "F-09", scene: "router_rear", label: "Rear cable view", trigger: "workflow_checkpoint", at: "03:58", quality: 0.85, selectedForModel: true },
    { id: "F-12", scene: "router_rear", label: "DSL filter (human-requested)", trigger: "human_request", at: "05:20", quality: 0.9, selectedForModel: true },
  ],
  steps: [
    { key: "confirm", label: "Confirm problem", state: "done", at: "00:34", note: "No internet since morning" },
    { key: "front", label: "Request router front view", state: "done", at: "01:02" },
    { key: "lights", label: "Inspect status lights", state: "done", at: "01:48", note: "2 of 3 LEDs confirmed" },
    { key: "better", label: "Need better view?", state: "done", at: "02:31", note: "Yes — Internet LED below threshold" },
    { key: "closer", label: "Request closer frame", state: "done", at: "03:12", note: "Retry 1 of 2 — still unreadable" },
    { key: "rear", label: "Request rear cable view", state: "done", at: "03:58" },
    { key: "checks", label: "Run approved checks", state: "done", at: "04:30", note: "Remote line reset executed" },
    { key: "resolved", label: "Resolved?", state: "escalated", at: "04:48", note: "Not resolved — confidence policy triggered" },
    { key: "human", label: "Human adviser resolution", state: "done", at: "06:12", note: "Loose DSL filter re-seated" },
  ],
  actions: [
    { id: "a1", tool: "lookup_line_status", request: "Account ****4471 — DSL sync", result: "Sync intermittent (4.2 Mbps down, 3 resyncs in 1h)", status: "success", at: "01:20", actor: "AI" },
    { id: "a2", tool: "create_support_case", request: "Priority: standard, symptom: no internet", result: "Case CW-558210 created", status: "success", at: "02:05", actor: "AI" },
    { id: "a3", tool: "trigger_remote_line_reset", request: "Line reset (approved, low risk)", result: "Reset completed — no recovery", status: "success", at: "04:30", actor: "AI" },
    { id: "a4", tool: "book_engineer_visit", request: "Standard visit slot", result: "Blocked — human confirmation required", status: "blocked", at: "04:44", actor: "AI" },
    { id: "a5", tool: "update_case", request: "Add resolution note, attach 6 frames", result: "Case CW-558210 updated, status Resolved", status: "success", at: "06:05", actor: "Human" },
    { id: "a6", tool: "send_sms_summary", request: "Template: visual-assist-resolved", result: "SMS delivered to ****2291", status: "success", at: "06:10", actor: "System" },
  ],
  transcript: [
    { id: "t1", speaker: "ai", at: "00:04", text: "Hello, I'm Ava from ClearWave support. I can see and hear you. What seems to be the problem today?" },
    { id: "t2", speaker: "customer", at: "00:12", text: "My internet's been down since this morning. The router's got lights on but nothing connects." },
    { id: "t3", speaker: "ai", at: "00:34", text: "Thanks, sorry about that. Could you show me the front of the router, so I can see the lights?" },
    { id: "t4", speaker: "customer", at: "00:50", text: "Sure — here, is this okay?" },
    { id: "t5", speaker: "ai", at: "01:02", text: "That's a Hub 5, perfect. Please hold steady for a moment while I take a look at the lights." },
    { id: "t6", speaker: "ai", at: "01:48", text: "Power is solid green and the DSL light is flashing amber. I can't quite tell the Internet light yet." },
    { id: "t7", speaker: "customer", at: "02:20", text: "I think that one's off but it's hard to say." },
    { id: "t8", speaker: "ai", at: "02:31", text: "Could you move a little closer and tilt it away from the window? There's some glare." },
    { id: "t9", speaker: "ai", at: "03:12", text: "Still tricky to read. Let's look at the cables at the back instead." },
    { id: "t10", speaker: "ai", at: "03:58", text: "The DSL cable is in the right port. I'm going to run a line reset from here — it takes about a minute." },
    { id: "t11", speaker: "system", at: "04:30", text: "Remote line reset completed — no recovery detected." },
    { id: "t12", speaker: "ai", at: "04:48", text: "I'm not confident I can see everything I need, so I'm bringing in a colleague who can see exactly what we've covered. One moment." },
    { id: "t13", speaker: "system", at: "04:52", text: "Priya Nair joined the session (AI → Human handover)." },
    { id: "t14", speaker: "human", at: "05:10", text: "Hi Mr Morrison, I'm Priya. I've got your photos and notes already — could you show me the grey filter on the phone socket?" },
    { id: "t15", speaker: "customer", at: "05:20", text: "That one? It's a bit loose, actually." },
    { id: "t16", speaker: "human", at: "05:34", text: "Push it in firmly until it clicks. The Internet light should settle in around thirty seconds." },
    { id: "t17", speaker: "customer", at: "06:02", text: "Oh — it's gone green! It's working." },
  ],
  audit: [
    { id: "e1", at: "00:00", actor: "System", event: "Session started", detail: "Channel: QR code · Workflow Router Troubleshooting v3 · Policy POL-VC v2.3", tone: "neutral" },
    { id: "e2", at: "00:02", actor: "Customer", event: "Consent recorded", detail: "Camera, microphone and selected-frame analysis accepted", tone: "ok" },
    { id: "e3", at: "01:02", actor: "Ava (AI)", event: "Frame selected", detail: "F-01 · workflow checkpoint · sent to multimodal model", tone: "neutral" },
    { id: "e4", at: "02:31", actor: "Ava (AI)", event: "Low-confidence observation", detail: "Internet LED 0.58 < threshold 0.70 → request better view", tone: "warn" },
    { id: "e5", at: "03:12", actor: "Ava (AI)", event: "Retry exhausted", detail: "Closer frame returned 0.61 — confidence policy remains unmet", tone: "warn" },
    { id: "e6", at: "04:30", actor: "Ava (AI)", event: "Tool action", detail: "trigger_remote_line_reset — success, no recovery", tone: "neutral" },
    { id: "e7", at: "04:44", actor: "Policy engine", event: "Action blocked", detail: "book_engineer_visit requires human confirmation (rule HR-04)", tone: "warn" },
    { id: "e8", at: "04:48", actor: "Ava (AI)", event: "Escalation raised", detail: "Reason: low visual confidence · queue: Broadband L1", tone: "bad" },
    { id: "e9", at: "04:52", actor: "Priya Nair", event: "Ownership changed", detail: "AI → Human · handover package delivered (6 frames, 7 observations)", tone: "human" },
    { id: "e10", at: "05:20", actor: "Priya Nair", event: "Frame captured", detail: "F-12 · human request · DSL filter", tone: "human" },
    { id: "e11", at: "06:05", actor: "Priya Nair", event: "Case updated", detail: "CW-558210 resolved — loose DSL filter", tone: "ok" },
    { id: "e12", at: "06:12", actor: "System", event: "Session ended", detail: "Outcome: resolved by human · retention: selected frames, 14 days", tone: "ok" },
  ],
  cost: [
    { category: "Video transport", provider: "Twilio Video (demo)", amount: 0.12, detail: "6.2 participant-min × 2" },
    { category: "Voice AI", provider: "ElevenLabs (demo)", amount: 0.21, detail: "4.8 conversational min" },
    { category: "Multimodal model", provider: "Anthropic (demo)", amount: 0.19, detail: "14 frames · 21k tokens" },
    { category: "Application compute", provider: "AIUK platform", amount: 0.04, detail: "Media gateway + orchestrator" },
    { category: "Workflow orchestration", provider: "n8n (demo)", amount: 0.02, detail: "4 executions" },
    { category: "Storage", provider: "AIUK platform", amount: 0.01, detail: "6 retained frames · 14 days" },
    { category: "Human handling time", provider: "Contact centre", amount: 0.25, detail: "1.4 min handling @ blended rate" },
  ],
  retention: "Selected frames only · 6 frames retained · auto-delete 17 Oct 2026",
};

const SCENES = {
  router: { items: ["Router identified", "Power LED steady green", "DSL LED steady green", "Internet LED steady green", "Cables seated at rear"], steps: ["Confirm problem", "Request router front view", "Inspect status lights", "Request rear cable view", "Run approved checks", "Resolved?"] },
  boiler: { items: ["Boiler model badge readable", "Display shows fault code", "Pressure gauge needle visible", "Pressure within approved range", "No visible leaks"], steps: ["Safety check", "Show boiler front panel", "Read display fault code", "Read pressure gauge", "In safe range?", "Guide approved reset"] },
  damage: { items: ["Room context established", "Damage area visible", "Scale reference present", "Probable source identified", "No people in frame"], steps: ["Welfare check", "Wide shot of room", "Close-up of damage", "Probable source", "People / documents check", "Create FNOL"] },
} as const;

function generate(s: Session): SessionDetail {
  const kind = s.clientId === "clearwave" ? "router" : s.clientId === "northstar" ? "boiler" : "damage";
  const sc = SCENES[kind];
  const mm = (f: number) => { const t = Math.round(s.durationSec * f); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const lowConf = s.aiConfidence < 0.7;
  const observations: VisualObservation[] = sc.items.map((text, i) => {
    const bad = lowConf && i === 3;
    return {
      id: `o${i + 1}`, text: bad ? text.replace(/steady green|within approved range|identified/, "unclear") + " (unclear)" : text,
      confidence: bad ? +(s.aiConfidence - 0.05).toFixed(2) : +(0.84 + ((i * 7) % 13) / 100).toFixed(2),
      status: bad ? "uncertain" : i % 2 ? "likely_visible" : "confirmed_visible", frameId: `F-0${i + 1}`, requiresConfirmation: bad, at: mm((i + 1) / 7),
    };
  });
  const scenes: Record<string, Frame["scene"][]> = {
    router: ["router_front", "router_lights", "router_rear"], boiler: ["boiler_panel", "boiler_pressure", "boiler_panel"], damage: ["damage_wall", "damage_vehicle", "damage_wall"],
  };
  const frames: Frame[] = [0, 1, 2, 3].map((i) => ({
    id: `F-0${i + 1}`, scene: lowConf && i === 3 ? "router_blur" : scenes[kind][i % 3], label: ["Primary view", "Detail view", "Alternate angle", "Retry frame"][i],
    trigger: (["workflow_checkpoint", "workflow_checkpoint", "scene_change", "ai_request"] as const)[i], at: mm((i + 1) / 6), quality: +(0.9 - i * 0.07).toFixed(2), selectedForModel: true,
  }));
  const live = !["resolved", "failed"].includes(s.status);
  const done = live ? Math.max(2, Math.min(sc.steps.length - 2, Math.round(s.durationSec / 70))) : sc.steps.length;
  const steps: WorkflowStepProgress[] = sc.steps.map((label, i) => ({
    key: `s${i}`, label,
    state: s.status === "failed" && i === done - 1 ? "escalated" : i < done ? "done" : i === done && live ? "current" : "pending",
    at: i < done ? mm((i + 1) / (sc.steps.length + 1)) : undefined,
  }));
  const actions: ToolAction[] = [
    { id: "a1", tool: kind === "damage" ? "create_claim_fnol" : kind === "boiler" ? "lookup_account" : "lookup_line_status", request: "Automated lookup", result: "Returned successfully", status: "success", at: mm(0.2), actor: "AI" },
    { id: "a2", tool: kind === "damage" ? "attach_evidence" : "create_support_case", request: `Attach ${s.framesAnalysed} frames`, result: live ? "Pending" : "Completed", status: live ? "pending" : "success", at: mm(0.7), actor: "AI" },
  ];
  const transcript: TranscriptLine[] = [
    { id: "t1", speaker: "ai", at: "00:04", text: `Hello, I'm ${s.agentName}. I can see and hear you. How can I help today?` },
    { id: "t2", speaker: "customer", at: "00:12", text: kind === "router" ? "My broadband keeps dropping out." : kind === "boiler" ? "My boiler's showing a code and there's no hot water." : "We've had water coming through the ceiling." },
    { id: "t3", speaker: "ai", at: "00:30", text: "Thanks. Please show me the affected area and hold the camera steady." },
    { id: "t4", speaker: "customer", at: "00:46", text: "Okay, like this?" },
    { id: "t5", speaker: "ai", at: "01:05", text: lowConf ? "I can't read that clearly. Could you move closer?" : "That's clear, thank you. Taking a careful look now." },
  ];
  if (s.escalated) transcript.push({ id: "t6", speaker: "system", at: mm(0.6), text: `Escalated: ${s.escalationReason}. ${s.humanAgent ?? "A human adviser"} joined.` });
  const audit: AuditEntry[] = [
    { id: "e1", at: "00:00", actor: "System", event: "Session started", detail: `Workflow ${s.workflowName} ${s.workflowVersion} · ${s.policyVersion}`, tone: "neutral" },
    { id: "e2", at: "00:02", actor: "Customer", event: "Consent recorded", detail: "Camera, microphone and selected-frame analysis accepted", tone: "ok" },
    { id: "e3", at: mm(0.2), actor: `${s.agentName} (AI)`, event: "Frame selected", detail: "F-01 · workflow checkpoint", tone: "neutral" },
    ...(s.escalated ? [{ id: "e4", at: mm(0.6), actor: "Policy engine", event: "Escalation raised", detail: s.escalationReason ?? "", tone: "bad" as const }, { id: "e5", at: mm(0.62), actor: s.humanAgent ?? "Human", event: "Ownership changed", detail: "AI → Human", tone: "human" as const }] : []),
    ...(live ? [] : [{ id: "e9", at: mm(1), actor: "System", event: s.status === "failed" ? "Session failed" : "Session ended", detail: `Outcome: ${s.outcome}`, tone: s.status === "failed" ? "bad" as const : "ok" as const }]),
  ];
  const t = s.cost;
  const cost: CostLine[] = [
    { category: "Video transport", provider: "Twilio Video (demo)", amount: +(t * 0.14).toFixed(2), detail: "participant minutes" },
    { category: "Voice AI", provider: "ElevenLabs (demo)", amount: +(t * 0.25).toFixed(2), detail: "conversational minutes" },
    { category: "Multimodal model", provider: "Anthropic (demo)", amount: +(t * 0.23).toFixed(2), detail: `${s.framesAnalysed} frames` },
    { category: "Application compute", provider: "AIUK platform", amount: +(t * 0.05).toFixed(2), detail: "gateway + orchestrator" },
    { category: "Workflow orchestration", provider: "n8n (demo)", amount: +(t * 0.03).toFixed(2), detail: "executions" },
    { category: "Storage", provider: "AIUK platform", amount: +(t * 0.01).toFixed(2), detail: "retained frames" },
    { category: "Human handling time", provider: "Contact centre", amount: +(s.escalated ? t * 0.29 : 0).toFixed(2), detail: s.escalated ? "handling minutes" : "not escalated" },
  ];
  return {
    sessionId: s.id,
    summary: `${s.customer} contacted ${s.agentName} about a visible issue. ${s.framesAnalysed} frames were analysed under ${s.workflowName} ${s.workflowVersion}. ${s.escalated ? `The session was escalated (${s.escalationReason}).` : "No escalation was required."} Current status: ${s.outcome}.`,
    recommendedNext: live ? "Continue the approved workflow; request an additional view if confidence stays below threshold." : "No further action.",
    uncertaintyFlags: lowConf ? ["Key checkpoint below confidence threshold", "Additional view recommended"] : [],
    observations, frames, steps, actions, transcript, audit, cost, retention: "Selected frames only · auto-delete per tenant policy",
  };
}

export function getSessionDetail(id: string): SessionDetail | undefined {
  if (id === "VA-27413") return PRIMARY;
  const s = sessionById(id);
  return s ? generate(s) : undefined;
}
