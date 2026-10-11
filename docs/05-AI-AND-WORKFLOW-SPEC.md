# AI, Workflow and Escalation Specification

# 1. AI Role

The AI should:
- converse naturally
- request appropriate visual evidence
- analyse selected evidence
- follow approved workflows
- express uncertainty
- choose the next permitted step
- trigger approved tools
- escalate when required

The AI should not:
- invent visual details
- bypass policy
- make prohibited decisions
- execute unapproved actions
- continue after mandatory escalation

---

# 2. Structured Visual Output

Recommended schema:

```json
{
  "observation": "Internet indicator appears off",
  "status": "likely_visible",
  "confidence": 0.78,
  "evidence_frame_id": "frame_019",
  "requires_confirmation": true,
  "recommended_next_action": "request_closer_view"
}
```

Allowed status values:
- confirmed_visible
- likely_visible
- uncertain
- unreadable
- not_visible
- conflicting_evidence
- needs_another_view

---

# 3. Frame Selection Logic

Triggers:
- scheduled low-frequency sample
- customer asks a visual question
- AI requests evidence
- workflow requires evidence
- scene change
- human requests capture
- uncertainty needs confirmation

The system should not continuously infer against all frames.

---

# 4. Workflow Model

Each workflow must define:
- objective
- allowed scope
- questions
- visual checkpoints
- allowed guidance
- prohibited guidance
- business actions
- confidence thresholds
- escalation triggers
- completion states
- failure states

---

# 5. Escalation Rules

Escalation should occur when:
- customer asks for a human
- visual confidence remains too low
- repeated capture fails
- workflow reaches human-only step
- safety policy triggers
- regulated action is required
- AI model fails
- media fails
- external workflow fails critically
- maximum AI duration is exceeded

---

# 6. Human Handover Payload

Recommended structure:

```json
{
  "session_summary": "...",
  "customer_issue": "...",
  "workflow": "Router Troubleshooting v3",
  "completed_steps": [],
  "visual_observations": [],
  "uncertain_items": [],
  "actions_taken": [],
  "reason_for_escalation": "...",
  "recommended_next_step": "..."
}
```

---

# 7. AI Evaluation Dimensions

Evaluate:
- visual interpretation correctness
- uncertainty calibration
- workflow compliance
- escalation correctness
- hallucination rate
- task completion
- response relevance
- latency
- customer effort
