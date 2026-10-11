# QA, Evaluation and Testing Strategy

# 1. Test Layers

## Unit Tests
Cover:
- workflow logic
- policy checks
- frame-selection rules
- data validation
- state transitions

## Integration Tests
Cover:
- session orchestrator
- media gateway
- voice layer
- model interface
- workflow actions
- escalation

## End-to-End Tests
Cover:
- session start
- camera permission
- visual request
- frame capture
- AI interpretation
- workflow progression
- human takeover
- session completion

---

# 2. AI Evaluation

Create controlled test sets for:
- clear visual evidence
- blurry evidence
- partial visibility
- conflicting evidence
- low light
- wrong object
- similar-looking objects
- unsupported requests

Measure:
- correctness
- confidence calibration
- refusal/escalation correctness
- hallucination rate
- workflow compliance

---

# 3. Human Handover Testing

Test:
- AI-triggered escalation
- customer-triggered escalation
- no human available
- human joins late
- human takes over
- return to AI
- customer disconnects during handover

---

# 4. Network Testing

Simulate:
- high latency
- packet loss
- weak mobile connection
- temporary video loss
- audio-only fallback

---

# 5. Security Testing

Include:
- auth testing
- authorization
- tenant isolation
- broken access control
- secrets exposure
- injection
- file/image handling
- audit integrity

---

# 6. Release Gates

A pilot release should not proceed until:
- core workflow passes
- escalation works
- no critical security issues remain
- audit trail is complete
- latency is acceptable
- error recovery works
- client acceptance tests pass
