import type { ClientId } from "../types";

export type NodeKind = "start" | "ask" | "capture" | "decision" | "tool" | "end" | "escalate";

export interface WfNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number; // canvas coordinates
  y: number;
  description: string;
  checkpoint?: boolean;
  minConfidence?: number;
  allowed?: string[];
  prohibited?: string[];
  onFail?: string;
}
export interface WfEdge { from: string; to: string; label?: string }

export interface Workflow {
  id: string;
  name: string;
  clientId: ClientId;
  version: string;
  status: "published" | "draft" | "in_review";
  completionRate: number;
  sessions30d: number;
  avgDuration: string;
  objective: string;
  confidenceThreshold: number;
  maxAiMinutes: number;
  completionCondition: string;
  escalationRules: string[];
  updated: string;
  author: string;
  nodes: WfNode[];
  edges: WfEdge[];
  versions: { v: string; date: string; note: string; status: string }[];
}

export const workflows: Workflow[] = [
  {
    id: "router-troubleshooting", name: "Router Troubleshooting", clientId: "clearwave", version: "v3", status: "published",
    completionRate: 74, sessions30d: 4218, avgDuration: "05:41",
    objective: "Diagnose loss-of-service on a ClearWave Hub 5 router using visual status-light evidence and approved checks, avoiding unnecessary engineer visits.",
    confidenceThreshold: 0.7, maxAiMinutes: 8,
    completionCondition: "Service restored and confirmed by customer, or case created with full visual evidence attached.",
    escalationRules: ["Two consecutive low-confidence reads on a required checkpoint", "Customer requests a human", "Hardware fault suspected (no power LED after cable check)", "AI duration exceeds 8 minutes"],
    updated: "19 Sep 2026", author: "A. Whitfield",
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 300, y: 0, description: "Session opens. Greeting played, privacy notice acknowledged, camera and microphone enabled." },
      { id: "confirm", kind: "ask", label: "Confirm problem", x: 300, y: 90, description: "Confirm the customer's symptom (no internet, slow, intermittent) and that they are in front of the router.", allowed: ["Ask clarifying questions", "Confirm account postcode"], prohibited: ["Request account password"] },
      { id: "front", kind: "capture", label: "Request router front view", x: 300, y: 190, checkpoint: true, minConfidence: 0.7, description: "Ask the customer to show the front of the router so the model, power state and indicator panel are visible.", allowed: ["Ask the customer to move closer", "Ask to hold steady"], prohibited: ["Ask customer to open the casing"], onFail: "Request closer frame, then escalate after two attempts" },
      { id: "lights", kind: "capture", label: "Inspect status lights", x: 300, y: 295, checkpoint: true, minConfidence: 0.75, description: "Read power, DSL/Fibre, Internet and Wi-Fi LED states against the approved status-light guide.", allowed: ["Describe observed LED colours", "Quote the approved meaning of each LED"], prohibited: ["Infer a fault from an unreadable LED"], onFail: "Branch to closer frame" },
      { id: "better", kind: "decision", label: "Need better view?", x: 300, y: 400, description: "If any required LED is below the confidence threshold the AI asks for a closer or better-lit view.", minConfidence: 0.75 },
      { id: "closer", kind: "ask", label: "Request closer frame", x: 60, y: 400, description: "Ask the customer to move to ~20cm and reduce glare. Maximum two retries.", allowed: ["Suggest turning on a room light", "Suggest tilting the router"], prohibited: ["Ask customer to unplug while filming without warning"] },
      { id: "rear", kind: "capture", label: "Request rear cable view", x: 300, y: 505, checkpoint: true, minConfidence: 0.7, description: "Ask to see the rear ports to verify the DSL/Fibre cable and power lead are seated.", allowed: ["Ask customer to gently reseat a cable"], prohibited: ["Touch mains power cable while powered"] },
      { id: "checks", kind: "tool", label: "Run approved checks", x: 300, y: 610, description: "Look up line status and, if eligible, trigger a remote line reset via the approved tool.", allowed: ["lookup_line_status", "trigger_remote_line_reset"], prohibited: ["book_engineer_visit (human only)"] },
      { id: "resolved", kind: "decision", label: "Resolved?", x: 300, y: 715, description: "Customer confirms service, and the Internet LED shows steady with high confidence." },
      { id: "complete", kind: "end", label: "Complete", x: 60, y: 820, description: "Record outcome, send SMS summary, close session." },
      { id: "escalate", kind: "escalate", label: "Escalate to human", x: 540, y: 820, description: "Transfer to the human queue with full visual context, transcript and AI summary." },
    ],
    edges: [
      { from: "start", to: "confirm" }, { from: "confirm", to: "front" }, { from: "front", to: "lights" },
      { from: "lights", to: "better" }, { from: "better", to: "closer", label: "Yes" }, { from: "closer", to: "lights", label: "Retry" },
      { from: "better", to: "rear", label: "No" }, { from: "rear", to: "checks" }, { from: "checks", to: "resolved" },
      { from: "resolved", to: "complete", label: "Yes" }, { from: "resolved", to: "escalate", label: "No" },
    ],
    versions: [
      { v: "v3", date: "19 Sep 2026", note: "Added closer-frame retry loop; raised LED threshold to 0.75", status: "Published" },
      { v: "v2", date: "30 Jul 2026", note: "Added remote line-reset tool", status: "Archived" },
      { v: "v1", date: "02 Jun 2026", note: "Initial pilot workflow", status: "Archived" },
    ],
  },
  {
    id: "boiler-visual-triage", name: "Boiler Visual Triage", clientId: "northstar", version: "v2", status: "published",
    completionRate: 66, sessions30d: 2954, avgDuration: "06:27",
    objective: "Safely identify the boiler model, read the display fault code and pressure gauge, and either guide an approved reset or raise an engineer work order.",
    confidenceThreshold: 0.75, maxAiMinutes: 7,
    completionCondition: "Fault code captured and resolved by approved reset, or work order created with annotated frames.",
    escalationRules: ["Gas smell, CO alarm or smoke mentioned → immediate human", "Pressure outside 0.8–2.0 bar range", "Display unreadable after two attempts", "Customer flagged vulnerable"],
    updated: "03 Sep 2026", author: "R. Okafor",
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 300, y: 0, description: "Safety preamble: no gas smell, no CO alarm. Customer confirms they are safe." },
      { id: "safety", kind: "decision", label: "Safety concern?", x: 300, y: 95, description: "If the customer reports gas smell, CO alarm or smoke the AI gives safety advice and escalates immediately." },
      { id: "panel", kind: "capture", label: "Show boiler front panel", x: 300, y: 200, checkpoint: true, minConfidence: 0.75, description: "Capture the boiler model badge and display.", allowed: ["Read model label"], prohibited: ["Ask customer to remove covers"] },
      { id: "code", kind: "capture", label: "Read display fault code", x: 300, y: 305, checkpoint: true, minConfidence: 0.8, description: "Read the fault code from the digital display and cross-check against the approved code list.", allowed: ["Quote approved description for code"], prohibited: ["Guess a code if unreadable"], onFail: "Ask for closer frame; escalate if still unreadable" },
      { id: "pressure", kind: "capture", label: "Read pressure gauge", x: 300, y: 410, checkpoint: true, minConfidence: 0.75, description: "Read the pressure gauge. Needle position must be clearly visible.", allowed: ["Report approximate bar value"], prohibited: ["Advise filling loop if outside range"] },
      { id: "range", kind: "decision", label: "In safe range?", x: 300, y: 515, description: "Pressure within 0.8–2.0 bar and fault code in the approved self-service list." },
      { id: "reset", kind: "tool", label: "Guide approved reset", x: 60, y: 620, description: "Walk the customer through the manufacturer-approved reset button procedure.", allowed: ["Press reset once"], prohibited: ["Repeat reset more than once", "Open any panel"] },
      { id: "workorder", kind: "tool", label: "Create work order", x: 300, y: 720, description: "Create an engineer work order with annotated frames and fault code." },
      { id: "end", kind: "end", label: "Complete", x: 60, y: 820, description: "Fault cleared; record outcome and close." },
      { id: "escalate", kind: "escalate", label: "Escalate to human", x: 540, y: 620, description: "Warm transfer to a safety-trained adviser." },
    ],
    edges: [
      { from: "start", to: "safety" }, { from: "safety", to: "escalate", label: "Yes" }, { from: "safety", to: "panel", label: "No" },
      { from: "panel", to: "code" }, { from: "code", to: "pressure" }, { from: "pressure", to: "range" },
      { from: "range", to: "reset", label: "Yes" }, { from: "range", to: "escalate", label: "No" },
      { from: "reset", to: "end", label: "Cleared" }, { from: "reset", to: "workorder", label: "Persists" },
    ],
    versions: [
      { v: "v2", date: "03 Sep 2026", note: "Added pressure gauge checkpoint", status: "Published" },
      { v: "v1", date: "14 Jun 2026", note: "Initial", status: "Archived" },
    ],
  },
  {
    id: "property-damage-capture", name: "Property Damage Capture", clientId: "horizon", version: "v1", status: "in_review",
    completionRate: 58, sessions30d: 612, avgDuration: "08:03",
    objective: "Guide a policyholder through structured first-notification-of-loss evidence capture for property damage, without commenting on cover or liability.",
    confidenceThreshold: 0.7, maxAiMinutes: 10,
    completionCondition: "Minimum evidence set captured (wide, mid, close-up, cause) and FNOL created.",
    escalationRules: ["Any injury or ongoing danger", "Cover / liability question from customer", "Faces or bystanders in frame", "Estimated loss over £10,000"],
    updated: "26 Sep 2026", author: "S. Patel",
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 300, y: 0, description: "Welfare check and consent for evidence capture." },
      { id: "safe", kind: "decision", label: "Is anyone at risk?", x: 300, y: 95, description: "If injury or danger is reported, stop capture and escalate." },
      { id: "wide", kind: "capture", label: "Wide shot of room", x: 300, y: 200, checkpoint: true, minConfidence: 0.7, description: "Capture a wide view to establish location.", allowed: ["Ask customer to step back"], prohibited: ["Ask customer to enter unsafe area"] },
      { id: "close", kind: "capture", label: "Close-up of damage", x: 300, y: 305, checkpoint: true, minConfidence: 0.75, description: "Capture the damaged area with a scale reference.", allowed: ["Ask for a coin or hand for scale"], prohibited: ["Comment on cause or cover"] },
      { id: "cause", kind: "capture", label: "Probable source", x: 300, y: 410, checkpoint: true, minConfidence: 0.7, description: "Capture the probable source (pipe, window, roof line) if safely visible." },
      { id: "privacy", kind: "decision", label: "People / documents in frame?", x: 300, y: 515, description: "If faces, children or documents are detected the AI asks to reposition and flags for redaction." },
      { id: "fnol", kind: "tool", label: "Create FNOL", x: 300, y: 620, description: "Create claim record with attached evidence frames.", allowed: ["create_claim_fnol", "attach_evidence"], prohibited: ["schedule_loss_adjuster (human only)"] },
      { id: "end", kind: "end", label: "Complete", x: 300, y: 720, description: "Send claim reference by SMS and close." },
      { id: "escalate", kind: "escalate", label: "Escalate to human", x: 540, y: 200, description: "Transfer to claims adviser with evidence." },
    ],
    edges: [
      { from: "start", to: "safe" }, { from: "safe", to: "escalate", label: "Yes" }, { from: "safe", to: "wide", label: "No" },
      { from: "wide", to: "close" }, { from: "close", to: "cause" }, { from: "cause", to: "privacy" },
      { from: "privacy", to: "fnol", label: "Clear" }, { from: "privacy", to: "wide", label: "Reposition" }, { from: "fnol", to: "end" },
    ],
    versions: [{ v: "v1", date: "26 Sep 2026", note: "Initial pilot — in compliance review", status: "In review" }],
  },
  {
    id: "meter-reading-assist", name: "Meter Reading Assist", clientId: "northstar", version: "v1", status: "draft",
    completionRate: 0, sessions30d: 0, avgDuration: "—",
    objective: "Help customers read and submit a visible meter display.", confidenceThreshold: 0.85, maxAiMinutes: 4,
    completionCondition: "Reading captured at ≥0.85 confidence and confirmed by customer.",
    escalationRules: ["Unreadable display after two attempts", "Meter type not recognised"], updated: "30 Sep 2026", author: "R. Okafor",
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 300, y: 0, description: "Begin." },
      { id: "show", kind: "capture", label: "Show meter display", x: 300, y: 100, checkpoint: true, minConfidence: 0.85, description: "Capture the display clearly." },
      { id: "confirm", kind: "decision", label: "Customer confirms digits?", x: 300, y: 205, description: "Read digits back to customer." },
      { id: "submit", kind: "tool", label: "Submit reading", x: 300, y: 310, description: "Submit via approved tool." },
      { id: "end", kind: "end", label: "Complete", x: 300, y: 410, description: "Done." },
      { id: "escalate", kind: "escalate", label: "Escalate", x: 540, y: 205, description: "Human to take reading." },
    ],
    edges: [{ from: "start", to: "show" }, { from: "show", to: "confirm" }, { from: "confirm", to: "submit", label: "Yes" }, { from: "confirm", to: "escalate", label: "No" }, { from: "submit", to: "end" }],
    versions: [{ v: "v1", date: "30 Sep 2026", note: "Draft", status: "Draft" }],
  },
];

export const workflowById = (id: string) => workflows.find((w) => w.id === id);
