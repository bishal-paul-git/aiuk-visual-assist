# Non-Functional Requirements

# 1. Performance

Targets should be defined and measured for:
- session start time
- voice response latency
- frame selection latency
- visual inference latency
- human join latency
- workflow action latency

The product should feel conversational rather than turn-based.

---

# 2. Availability

Production target should be agreed by service tier.

Design should support:
- graceful degradation
- voice-only fallback
- human fallback
- retry for safe actions
- provider outage handling

---

# 3. Scalability

The platform must scale by:
- active sessions
- video participants
- visual inference requests
- workflow events
- human escalations
- tenants

The media gateway and session orchestrator should be horizontally scalable.

---

# 4. Reliability

The system must handle:
- weak networks
- dropped video
- missing frames
- speech timeout
- model timeout
- provider outage
- workflow outage
- human unavailable
- duplicate requests

---

# 5. Observability

Required:
- logs
- metrics
- traces
- alerts
- correlation IDs
- session IDs
- provider timing
- error classification

---

# 6. Idempotency

All business actions must use idempotency keys where duplicate execution could cause operational harm.

---

# 7. Disaster Recovery

Production should define:
- backup strategy
- recovery objectives
- critical service dependencies
- runbooks
- failover approach
