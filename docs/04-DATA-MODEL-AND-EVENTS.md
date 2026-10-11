# Data Model and Event Specification

# 1. Core Entities

## Tenant
Fields:
- id
- name
- status
- brand configuration
- region
- retention policy
- feature flags
- created_at
- updated_at

## User
- id
- tenant_id
- role
- name
- email
- status

## Agent
- id
- tenant_id
- name
- model configuration
- voice configuration
- language configuration
- policy references
- workflow assignments
- version
- status

## Session
- id
- tenant_id
- workflow_id
- agent_id
- channel
- status
- owner_type
- started_at
- ended_at
- outcome
- escalation_reason
- cost_total

## Participant
- id
- session_id
- type
- user_id
- joined_at
- left_at

## Workflow
- id
- tenant_id
- name
- version
- status
- definition

## WorkflowStep
- id
- workflow_id
- step_key
- step_type
- configuration
- next_rules

## TranscriptEvent
- id
- session_id
- speaker
- timestamp
- text
- confidence

## VisualEvent
- id
- session_id
- trigger_type
- timestamp
- frame_reference
- processing_status

## VisualObservation
- id
- visual_event_id
- observation_type
- observation_text
- confidence
- status
- requires_confirmation
- model_version

## ToolAction
- id
- session_id
- tool_name
- idempotency_key
- request
- result
- status
- started_at
- completed_at

## Escalation
- id
- session_id
- reason
- severity
- requested_at
- accepted_at
- assigned_user_id
- resolution

## AuditEvent
- id
- tenant_id
- session_id
- actor_type
- actor_id
- event_type
- payload
- timestamp

## CostEvent
- id
- session_id
- provider
- category
- quantity
- unit
- estimated_cost
- currency
- timestamp

---

# 2. Event Model

Recommended events include:

## Session Events
- session.created
- session.started
- session.connected
- session.degraded
- session.completed
- session.failed

## Media Events
- media.camera_enabled
- media.camera_disabled
- media.microphone_enabled
- media.connection_degraded
- media.frame_selected
- media.frame_failed

## AI Events
- ai.turn_started
- ai.turn_completed
- ai.visual_request
- ai.observation_created
- ai.uncertain
- ai.escalation_requested

## Workflow Events
- workflow.started
- workflow.step_entered
- workflow.step_completed
- workflow.branch_selected
- workflow.action_requested
- workflow.completed
- workflow.failed

## Human Events
- human.requested
- human.queued
- human.joined
- human.took_over
- human.returned_to_ai
- human.left

## Tool Events
- tool.requested
- tool.completed
- tool.failed
- tool.duplicate_blocked

---

# 3. Audit Principle

The system should be able to reconstruct:
- what the customer said
- what visual evidence was selected
- what the AI observed
- what confidence it had
- what workflow state existed
- what action was requested
- what policy applied
- why escalation happened
- what the human did

without retaining unnecessary data.
