# UX and Interaction Specification

# 1. UX Principle

The customer experience should feel simpler than a normal support call, not more complicated.

The agent experience should reduce repeated questioning and surface the most useful context immediately.

The admin experience should make complex AI behaviour understandable and governable.

---

# 2. Customer Experience

## Required States
- landing
- consent/privacy
- device permission
- connecting
- connected
- AI listening
- AI speaking
- show object
- hold steady
- analysing
- need closer view
- need another angle
- resolved
- escalating
- human joining
- human connected
- session ended
- connection degraded
- fallback to voice-only

## Customer Controls
- mute
- camera on/off
- switch camera
- request human help
- end session

## UX Requirements
- mobile first
- one primary instruction at a time
- no technical jargon
- no unnecessary menus
- clear AI/human identity
- clear privacy notice
- high contrast
- accessible controls
- connection quality visible
- clear error recovery

---

# 3. Human Agent Console

## Primary Layout
Recommended desktop structure:
- left: live video
- right: transcript and session context
- lower panels: AI summary, visual observations, completed steps, escalation reason, suggested next action

## Must Show
- current owner
- AI/human state
- session duration
- customer issue
- workflow
- visual observations
- confidence/uncertainty
- selected evidence
- business actions
- escalation reason
- next step

## Primary Actions
- join session
- take over
- return to AI
- add note
- create case action
- end session

---

# 4. Admin Portal

## Main Navigation
- Dashboard
- Live Sessions
- Sessions
- Clients
- Agents
- Workflows
- Policies
- Integrations
- QA
- Analytics
- Costs
- Audit
- Health
- Settings

## Dashboard
Should answer:
- What is happening now?
- Is the platform healthy?
- Are sessions resolving?
- Are escalations normal?
- Are costs within expectation?
- Are there incidents?

---

# 5. Workflow Builder UX

Each workflow should visibly show:
- start
- question
- visual request
- visual decision
- business action
- human escalation
- completion

Each node should expose:
- instruction
- allowed action
- required evidence
- confidence threshold
- next condition
- failure condition
- escalation rule

---

# 6. UX Rules for Uncertainty

Never silently continue when visual evidence is unclear.

The UI should surface states such as:
- confirmed
- likely
- uncertain
- unreadable
- conflicting
- needs another view

Agents should be able to inspect the evidence behind an observation.

---

# 7. Accessibility

Target:
- WCAG 2.2 AA where practical
- keyboard navigation for admin
- screen-reader labels
- adequate contrast
- large mobile tap targets
- captions/transcript support
- clear visual status indicators not based on colour alone
