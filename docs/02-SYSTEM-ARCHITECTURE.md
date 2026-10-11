# System Architecture
## Absolute Intelligence Visual Assist

# 1. Architecture Goal

The platform must separate:
- real-time media transport
- speech interaction
- visual frame handling
- multimodal reasoning
- workflow orchestration
- human escalation
- enterprise operations

The real-time path must remain low-latency and must not depend on slower business automation systems.

---

# 2. Target Architecture

```text
CUSTOMER DEVICE
camera + microphone
        │
        ▼
CUSTOMER WEB APP
        │
        ▼
REAL-TIME VIDEO / WEBRTC
        │
        ├───────────────┐
        │               │
        ▼               ▼
     AUDIO          VIDEO TRACK
        │               │
        ▼               ▼
 VOICE LAYER      MEDIA GATEWAY
        │         frame/event selection
        │               │
        └───────┬───────┘
                ▼
         SESSION ORCHESTRATOR
                │
                ▼
       MULTIMODAL REASONING
                │
        ┌───────┴────────┐
        ▼                ▼
 WORKFLOW ENGINE      HUMAN CONSOLE
        │                │
        ▼                ▼
 CLIENT SYSTEMS      LIVE TAKEOVER
```

---

# 3. Major Services

## 3.1 Customer Web App
Responsibilities:
- session launch
- permission handling
- camera/microphone state
- live controls
- captions
- customer prompts
- connection quality
- human-help request

## 3.2 Real-Time Media Layer
Responsibilities:
- room/session transport
- participant management
- media tracks
- join/leave state
- live handover support

## 3.3 Voice Layer
Responsibilities:
- speech recognition
- turn-taking
- voice activity
- spoken response
- transcript events

## 3.4 Real-Time Media Gateway
Responsibilities:
- observe video track
- frame selection
- scene-change events
- frame preprocessing
- visual timestamps
- image compression
- visual evidence routing
- media health telemetry

## 3.5 Session Orchestrator
Responsibilities:
- authoritative session state
- current workflow step
- current owner
- active policy
- active agent
- transcript references
- visual event references
- escalation state
- timeout state
- tool permissions
- session lifecycle

## 3.6 Multimodal Reasoning Layer
Responsibilities:
- interpret selected frames
- combine transcript + image + workflow context
- structured visual observations
- confidence output
- next conversational action
- request additional evidence
- escalation recommendation
- workflow/tool request

## 3.7 Workflow / Business Orchestration
Responsibilities:
- CRM actions
- ticket creation
- appointment booking
- notifications
- reporting
- external systems
- case updates

This component must not be in the continuous media loop.

## 3.8 Human Agent Console
Responsibilities:
- live video view
- transcript
- AI summary
- selected frames
- visual observations
- workflow state
- join
- take over
- return to AI
- case actions

## 3.9 Data Platform
Responsibilities:
- tenant configuration
- session metadata
- workflow versions
- observations
- audit
- cost
- QA
- analytics

## 3.10 Observability Layer
Responsibilities:
- logs
- metrics
- traces
- provider health
- interaction latency
- failures
- alerts
- cost telemetry

---

# 4. Critical Architecture Rules

1. n8n/business orchestration must not sit in the continuous media path.
2. Full video must not be sent continuously to the multimodal model.
3. Visual inference must be event-driven.
4. Session state must remain authoritative outside the model.
5. Model output must be structured and validated.
6. High-risk actions require deterministic policy checks.
7. Every external action should be idempotent.
8. Human escalation must work even if AI inference is unavailable.
9. Provider-specific services should be abstracted behind interfaces where practical.
10. All material state transitions should be auditable.

---

# 5. Multi-Tenancy

Tenant boundaries must include:
- data
- workflows
- policies
- users
- credentials
- branding
- retention
- integrations
- regional settings
- analytics access

No tenant should be able to read or act on another tenant's data.

---

# 6. Environments

Recommended:
- local
- development
- test
- staging
- pilot
- production

Production data must not be reused in development unless properly anonymised and approved.

---

# 7. Future Provider Abstraction

Use service interfaces for:
- video transport
- speech
- multimodal reasoning
- workflow execution
- notifications
- identity
- storage

This allows replacement or addition of providers without rewriting the entire platform.
