# Product Requirements Document
## Absolute Intelligence Visual Assist

**Owner:** Absolute Intelligence UK  
**Product type:** Enterprise Human + AI Visual Assistance Platform  
**Status:** Product development specification  
**Primary users:** End customers, contact-centre agents, supervisors, client administrators, AIUK operations teams

---

# 1. Product Summary

Absolute Intelligence Visual Assist allows customers to **show a problem instead of only describing it**.

A customer opens a secure browser-based visual assistance session from a link, QR code, SMS, website or contact-centre journey. The customer speaks naturally with an AI assistant and points their phone camera at the relevant device, object, damage or environment.

The AI can:
- listen to the conversation
- request specific visual evidence
- analyse selected frames
- distinguish clear observations from uncertain ones
- follow an approved workflow
- give permitted guidance
- trigger controlled business actions
- escalate into a human-assisted session when required

When escalation occurs, the human agent receives the existing conversation, relevant visual observations, selected evidence, steps completed, business actions already taken and reason for escalation.

The product is intended to become a reusable Absolute Intelligence UK capability across multiple sectors and clients.

---

# 2. Product Problem

Many support interactions are difficult or inefficient because the customer must describe something that would be easier to show.

Typical examples:
- router lights
- boiler displays
- meter readings
- product damage
- cabling
- equipment state
- installation position
- property damage
- physical faults

This creates:
- longer calls
- misunderstanding
- repeated questions
- unnecessary escalations
- avoidable engineer visits
- poor first-contact resolution
- incomplete case data

Visual Assist addresses this by combining voice, visual context, approved workflows and human intervention.

---

# 3. Product Objectives

The platform must:

1. Allow customers to join without installing an app.
2. Support natural spoken interaction during a live visual session.
3. Use selected visual evidence rather than continuously sending every video frame to an AI model.
4. Allow AI to ask the customer for another angle, closer view or clearer image.
5. Treat visual interpretation as confidence-based observation rather than fact.
6. Follow deterministic business rules for sensitive or high-risk actions.
7. Support seamless human takeover without forcing the customer to restart.
8. Provide a structured handover package to human agents.
9. Support client-specific workflows, policies, branding and integrations.
10. Be auditable, observable and enterprise-ready.
11. Support multi-tenant deployment.
12. Track operational and unit-economics metrics.

---

# 4. Non-Goals

The product is not initially intended to:
- act as an AI avatar platform
- analyse every frame of continuous video
- replace human agents in all scenarios
- make autonomous regulated decisions
- provide open-ended expert diagnosis in high-risk domains
- replace CRM, field-service or case-management systems
- require a native iOS or Android app for the core experience

---

# 5. Target Sectors

Primary target sectors:
- Telecommunications
- Utilities
- Insurance
- Retail
- Field Service
- Local Government
- Property / Facilities

Potential future use:
- carefully bounded healthcare support where governance permits
- manufacturing
- maintenance
- logistics
- automotive

---

# 6. Personas

## 6.1 End Customer
Needs help with a visible issue and wants fast resolution.

Needs:
- easy access
- no installation
- clear instructions
- privacy transparency
- low friction
- easy human escalation

## 6.2 Human Agent
Takes over difficult or escalated sessions.

Needs:
- live session context
- concise AI summary
- visual findings
- uncertainty flags
- actions already completed
- next suggested action
- ability to join immediately

## 6.3 Supervisor
Monitors operations.

Needs:
- live sessions
- escalations
- failures
- QA
- cost
- resolution metrics
- incident visibility

## 6.4 Client Administrator
Configures tenant-level behaviour.

Needs:
- workflows
- agents
- policies
- users
- branding
- retention
- integrations
- reports

## 6.5 AIUK Administrator
Operates the platform.

Needs:
- tenant management
- service health
- incidents
- versions
- deployments
- monitoring
- audit
- cost attribution

---

# 7. Core User Journeys

## Journey A — AI resolves the issue
1. Customer opens secure link.
2. Customer grants camera and microphone access.
3. AI starts voice conversation.
4. AI asks customer to show relevant object.
5. System captures selected frames.
6. AI analyses the evidence.
7. AI guides customer through approved steps.
8. Issue is resolved.
9. System records outcome and closes session.

## Journey B — AI requests better evidence
1. AI receives unclear visual evidence.
2. AI marks observation as uncertain.
3. AI asks for a closer or clearer view.
4. New selected frame is captured.
5. AI continues only after adequate evidence is available.

## Journey C — Human escalation
1. AI reaches low confidence, safety trigger, policy restriction or customer request.
2. Escalation is created.
3. Human agent sees live session and handover summary.
4. Human joins same interaction.
5. Customer does not repeat previous steps.
6. Human resolves or continues the case.

## Journey D — Business action
1. AI reaches approved workflow step.
2. Controlled business action is triggered.
3. System records request and result.
4. Workflow continues or closes.

---

# 8. Functional Requirements

## 8.1 Session Start
The system must support:
- secure links
- QR code entry
- website entry
- SMS-triggered entry
- optional authenticated journeys
- camera permission
- microphone permission
- consent/privacy notice
- device capability check

## 8.2 Real-Time Conversation
The system must support:
- natural voice interaction
- turn-taking
- interruptions
- transcript state
- conversational context
- AI spoken instructions
- live connection status

## 8.3 Visual Evidence
The system must support:
- periodic visual sampling
- AI-requested frame capture
- user-triggered capture
- scene-change-triggered capture
- visual checkpoint capture
- image resizing/compression
- frame timestamps
- frame-to-transcript synchronization

## 8.4 Visual Observation
The system must support structured output containing:
- observation
- confidence
- evidence reference
- uncertainty state
- timestamp
- model/version
- whether human confirmation is required

## 8.5 Workflow Execution
The system must support:
- workflow definitions
- ordered steps
- branching
- visual checkpoints
- allowed guidance
- prohibited actions
- business actions
- escalation conditions
- completion conditions

## 8.6 Human Escalation
The system must support:
- customer-requested human help
- AI-triggered escalation
- policy-triggered escalation
- safety-triggered escalation
- operational fallback escalation
- live join
- human takeover
- optional AI copilot after takeover

## 8.7 Handover Context
Human agent must receive:
- session summary
- customer issue
- visual observations
- selected evidence
- uncertainty flags
- workflow progress
- actions completed
- escalation reason
- current recommendations

## 8.8 Client Administration
The system must support:
- tenants
- branding
- users
- roles
- agents
- workflows
- policies
- integrations
- retention settings
- regional settings
- feature flags

## 8.9 Analytics
The system must support:
- session volume
- AI resolution rate
- escalation rate
- average duration
- frame count
- visual confidence failures
- workflow completion
- failed sessions
- cost per interaction
- human handling time
- repeat-contact rate
- field-visit avoidance where measurable

---

# 9. Product Modules

1. Customer Visual Assist
2. Human Agent Console
3. Live Operations
4. Session History
5. Session Detail
6. Client Management
7. AI Agent Management
8. Visual Workflow Builder
9. Policy Management
10. Integrations
11. QA
12. Analytics
13. Cost Centre
14. Audit Logs
15. System Health
16. Settings

---

# 10. Initial Production Use Case

Recommended first production candidate:

## Telecom Router Troubleshooting

The AI should be able to:
- identify the support intent
- request front view of router
- request closer view of lights
- record visible status
- request rear cable view
- guide approved low-risk checks
- detect uncertainty
- escalate if unresolved

Success criteria:
- reliable session start
- acceptable response latency
- correct workflow progression
- safe uncertainty handling
- successful human join
- complete audit record
- measurable interaction cost

---

# 11. Product Success Metrics

Primary:
- AI-only resolution rate
- first-contact resolution
- human escalation rate
- average resolution time
- customer effort
- task completion rate
- visual interpretation accuracy
- escalation correctness
- session failure rate
- cost per interaction

Secondary:
- engineer visits avoided
- repeat contacts avoided
- agent handling time saved
- customer satisfaction
- workflow compliance
- business-action success rate

---

# 12. Product Risks

Key risks:
- poor video quality
- high inference latency
- incorrect visual interpretation
- customer privacy concerns
- bystander capture
- weak mobile connectivity
- unreliable handover
- provider dependency
- cost growth at scale
- over-trust in AI observations
- inconsistent client workflows

Mitigation must be designed into architecture, policy, UX and operations.

---

# 13. Release Strategy

The product should progress through:

1. Visual product prototype
2. Narrow technical POC
3. Internal alpha
4. Controlled client pilot
5. Production pilot
6. Enterprise hardening
7. Multi-client rollout
8. Scaled product offering
