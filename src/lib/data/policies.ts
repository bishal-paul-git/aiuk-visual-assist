import type { HumanRequiredAction, Policy, PolicyCategory } from "../types/policies";

export const policyCategories: PolicyCategory[] = ["Visual confidence", "Safety", "Human-required actions", "Sensitive visual data", "Retention", "Escalation"];

export const policies: Policy[] = [
  {
    id: "POL-VC-01", name: "Visual confidence thresholds", category: "Visual confidence", scope: "global", status: "active", version: "v4",
    description: "Defines how the platform treats visual observations at each confidence band. Applies to every workflow checkpoint.",
    rules: [
      { id: "r1", condition: "Observation confidence ≥ 0.85", action: "Treat as confirmed; AI may state the observation as fact", effect: "allow" },
      { id: "r2", condition: "Confidence between workflow threshold and 0.85", action: "AI states observation as 'likely' and asks the customer to confirm", effect: "restrict" },
      { id: "r3", condition: "Confidence below workflow threshold", action: "Request a better view; do not act on the observation", effect: "restrict" },
      { id: "r4", condition: "Two consecutive low-confidence reads on a required checkpoint", action: "Escalate to a human adviser", effect: "escalate" },
      { id: "r5", condition: "Conflicting evidence between frames", action: "Mark as 'conflicting' and require a human to review", effect: "escalate" },
    ],
    workflowsAffected: ["router-troubleshooting", "boiler-visual-triage", "property-damage-capture", "meter-reading-assist"], clientIds: ["northstar", "clearwave", "horizon"],
    owner: "Platform Safety", updated: "19 Sep 2026",
    history: [
      { v: "v4", date: "19 Sep 2026", author: "A. Whitfield", note: "Added conflicting-evidence rule" },
      { v: "v3", date: "30 Jul 2026", author: "A. Whitfield", note: "Raised 'confirmed' band to 0.85" },
      { v: "v2", date: "02 Jun 2026", author: "M. Clarke", note: "Introduced per-workflow threshold override" },
    ],
  },
  {
    id: "POL-VC-02", name: "Display & gauge reading accuracy", category: "Visual confidence", scope: "tenant", status: "active", version: "v2",
    description: "Stricter evidence standard for numeric reads (fault codes, pressure gauges, meter digits) where a misread has safety or billing impact.",
    rules: [
      { id: "r1", condition: "Numeric read from display or gauge", action: "Require confidence ≥ 0.80 and read-back confirmation by the customer", effect: "restrict" },
      { id: "r2", condition: "Digits partially obscured or glare detected", action: "Do not guess; request closer frame", effect: "block" },
      { id: "r3", condition: "Pressure reading outside 0.8–2.0 bar", action: "Stop self-service guidance and escalate", effect: "escalate" },
    ],
    workflowsAffected: ["boiler-visual-triage", "meter-reading-assist"], clientIds: ["northstar"],
    owner: "R. Okafor", updated: "03 Sep 2026",
    history: [{ v: "v2", date: "03 Sep 2026", author: "R. Okafor", note: "Added pressure range rule" }, { v: "v1", date: "14 Jun 2026", author: "R. Okafor", note: "Initial" }],
  },
  {
    id: "POL-SF-01", name: "Gas, CO & physical safety", category: "Safety", scope: "tenant", status: "active", version: "v3",
    description: "Hard safety stops. The AI must never advise on actions that could cause physical harm and must hand over immediately on safety keywords.",
    rules: [
      { id: "r1", condition: "Customer mentions gas smell, CO alarm or smoke", action: "Give approved safety advice, then immediate warm transfer to a safety-trained adviser", effect: "escalate" },
      { id: "r2", condition: "AI would instruct the customer to open a panel or casing", action: "Block the instruction", effect: "block" },
      { id: "r3", condition: "Customer touches or is near mains power during capture", action: "Pause capture and advise stepping away", effect: "restrict" },
      { id: "r4", condition: "Repeat appliance reset requested more than once", action: "Block; raise engineer work order", effect: "block" },
    ],
    workflowsAffected: ["boiler-visual-triage", "router-troubleshooting"], clientIds: ["northstar", "clearwave"],
    owner: "Platform Safety", updated: "15 Aug 2026",
    history: [{ v: "v3", date: "15 Aug 2026", author: "M. Clarke", note: "Added repeat-reset block" }, { v: "v2", date: "01 Jul 2026", author: "M. Clarke", note: "Added mains power rule" }, { v: "v1", date: "02 Jun 2026", author: "M. Clarke", note: "Initial" }],
  },
  {
    id: "POL-HR-01", name: "Human-required actions", category: "Human-required actions", scope: "global", status: "active", version: "v5",
    description: "Actions with financial, legal or physical consequence that the AI may recommend but never execute without human confirmation.",
    rules: [
      { id: "r1", condition: "Tool risk = high (e.g. book_engineer_visit, schedule_loss_adjuster)", action: "Queue for human confirmation; AI cannot execute", effect: "block" },
      { id: "r2", condition: "Tool risk = medium", action: "AI may execute after explicit customer consent, logged to audit", effect: "restrict" },
      { id: "r3", condition: "Customer asks about cover, liability or compensation", action: "AI declines and offers a human adviser", effect: "escalate" },
      { id: "r4", condition: "Any high-risk action approved", action: "Record approver, time and evidence frames in audit trail", effect: "log" },
    ],
    workflowsAffected: ["router-troubleshooting", "boiler-visual-triage", "property-damage-capture"], clientIds: ["northstar", "clearwave", "horizon"],
    owner: "Platform Safety", updated: "26 Sep 2026",
    history: [{ v: "v5", date: "26 Sep 2026", author: "S. Patel", note: "Added liability-question rule" }, { v: "v4", date: "11 Aug 2026", author: "A. Whitfield", note: "Audit record requirement" }],
  },
  {
    id: "POL-SD-01", name: "People, faces & documents in frame", category: "Sensitive visual data", scope: "global", status: "review", version: "v2",
    description: "Controls how bystanders, children, identity documents and screens are handled when they appear in camera frames.",
    rules: [
      { id: "r1", condition: "Face or bystander detected in frame", action: "Ask customer to reposition; flag frame for redaction", effect: "restrict" },
      { id: "r2", condition: "Child detected", action: "Do not retain frame; ask customer to reposition", effect: "block" },
      { id: "r3", condition: "Identity document, card or screen with personal data detected", action: "Do not analyse content; discard frame from model input", effect: "block" },
      { id: "r4", condition: "Frame flagged for redaction", action: "Apply blur before any human review or export", effect: "log" },
    ],
    workflowsAffected: ["property-damage-capture", "router-troubleshooting"], clientIds: ["horizon", "clearwave"],
    owner: "Data Protection Office", updated: "26 Sep 2026",
    history: [{ v: "v2", date: "26 Sep 2026", author: "S. Patel", note: "Submitted for DPO review: added child-detection rule" }, { v: "v1", date: "12 Jul 2026", author: "S. Patel", note: "Initial" }],
  },
  {
    id: "POL-RT-01", name: "Evidence retention (selected frames)", category: "Retention", scope: "tenant", status: "active", version: "v2",
    description: "Default retention regime: only frames selected for model analysis are stored. Raw video is never stored.",
    rules: [
      { id: "r1", condition: "Retention mode = selected frames", action: "Store only analysed frames; discard live stream on session end", effect: "restrict" },
      { id: "r2", condition: "Frame age exceeds tenant retention days", action: "Automatically purge frame and derived thumbnails", effect: "log" },
      { id: "r3", condition: "Legal hold applied to a session", action: "Suspend purge; require Legal Ops to release", effect: "restrict" },
    ],
    workflowsAffected: ["router-troubleshooting", "boiler-visual-triage"], clientIds: ["northstar", "clearwave"],
    owner: "Data Protection Office", updated: "28 Aug 2026",
    history: [{ v: "v2", date: "28 Aug 2026", author: "J. Rowe", note: "Added legal hold rule" }, { v: "v1", date: "02 Jun 2026", author: "J. Rowe", note: "Initial" }],
  },
  {
    id: "POL-RT-02", name: "Claims evidence retention (full)", category: "Retention", scope: "tenant", status: "draft", version: "v1-draft",
    description: "Extended retention for regulated claims evidence, including annotated frames and AI summaries, for the statutory period.",
    rules: [
      { id: "r1", condition: "Retention mode = full evidence", action: "Retain evidence frames, annotations and transcript for 90 days minimum", effect: "restrict" },
      { id: "r2", condition: "Claim closed", action: "Move evidence to archive tier; restrict access to Claims Ops", effect: "log" },
    ],
    workflowsAffected: ["property-damage-capture"], clientIds: ["horizon"],
    owner: "S. Patel", updated: "30 Sep 2026",
    history: [{ v: "v1-draft", date: "30 Sep 2026", author: "S. Patel", note: "Draft created" }],
  },
  {
    id: "POL-ES-01", name: "Escalation triggers & routing", category: "Escalation", scope: "global", status: "active", version: "v3",
    description: "When a session must move from AI to a human, and how the handover is routed.",
    rules: [
      { id: "r1", condition: "Customer asks for a person", action: "Warm transfer within 10 seconds", effect: "escalate" },
      { id: "r2", condition: "AI-handled duration exceeds workflow maximum", action: "Escalate with AI summary", effect: "escalate" },
      { id: "r3", condition: "Customer flagged vulnerable on account", action: "Route to specialist queue with priority", effect: "escalate" },
      { id: "r4", condition: "Handover occurs", action: "Attach transcript, selected frames and observation list for the adviser", effect: "log" },
    ],
    workflowsAffected: ["router-troubleshooting", "boiler-visual-triage", "property-damage-capture", "meter-reading-assist"], clientIds: ["northstar", "clearwave", "horizon"],
    owner: "Contact Centre Ops", updated: "07 Sep 2026",
    history: [{ v: "v3", date: "07 Sep 2026", author: "T. Ellery", note: "Added vulnerable customer routing" }, { v: "v2", date: "20 Jul 2026", author: "T. Ellery", note: "Warm transfer SLA" }],
  },
];

export const policyById = (id: string) => policies.find((p) => p.id === id);

export const humanRequiredMatrix: HumanRequiredAction[] = [
  { action: "Book engineer visit", risk: "high", confirmer: "Human adviser", reason: "Cost and customer commitment" },
  { action: "Schedule loss adjuster", risk: "high", confirmer: "Claims adviser", reason: "Claims process commitment" },
  { action: "Trigger remote line reset", risk: "medium", confirmer: "Customer consent (AI) · audit logged", reason: "Temporary service interruption" },
  { action: "Create work order", risk: "medium", confirmer: "Customer consent (AI) · supervisor review", reason: "Dispatches field resource" },
  { action: "Advise on cover or liability", risk: "high", confirmer: "Human adviser only", reason: "Regulated advice" },
  { action: "Release frame outside tenant", risk: "high", confirmer: "Data Protection Officer", reason: "Data export" },
  { action: "Send SMS summary", risk: "low", confirmer: "None (AI)", reason: "Informational" },
];
