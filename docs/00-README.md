# Absolute Intelligence Visual Assist — Project Documentation

This folder contains the core project-development documents for **Absolute Intelligence Visual Assist**, a Human + AI visual assistance platform for Absolute Intelligence UK.

The product enables a customer to open a secure browser session, speak naturally with AI, show a real-world issue through their phone camera, receive guided support through approved workflows, and escalate into a human-assisted session with full context when required.

## Document set

1. `01-PRD.md` — Product Requirements Document
2. `02-SYSTEM-ARCHITECTURE.md` — Target system architecture and service boundaries
3. `03-UX-AND-INTERACTION-SPEC.md` — Customer, human-agent and admin UX
4. `04-DATA-MODEL-AND-EVENTS.md` — Core entities, event model and audit structure
5. `05-AI-AND-WORKFLOW-SPEC.md` — Multimodal reasoning, confidence, workflow and escalation rules
6. `06-SECURITY-PRIVACY-COMPLIANCE.md` — Security, privacy, retention and enterprise controls
7. `07-NON-FUNCTIONAL-REQUIREMENTS.md` — Reliability, performance, availability and scalability
8. `08-QA-EVALUATION-AND-TESTING.md` — QA, AI evaluation, functional and production testing
9. `09-DELIVERY-ROADMAP.md` — Phased delivery plan from visual product to enterprise rollout
10. `10-OPERATIONS-AND-SUPPORT.md` — Monitoring, incident response, support and operational ownership
11. `11-COMMERCIAL-AND-PACKAGING.md` — Packaging, pricing structure and commercial model
12. `12-DEFINITION-OF-DONE.md` — Release gates and acceptance criteria

## Recommended build order

Build in the following sequence:

- Product shell and UX
- Session model and simulated states
- Technical POC for one narrow use case
- Real-time media layer
- Voice + multimodal reasoning
- Controlled workflow engine
- Human escalation
- Audit and observability
- Client tenancy and administration
- Security hardening
- Production pilot
- Enterprise controls
- Scale and commercial rollout

The first technical production candidate should remain narrow. A telecom router-support workflow is recommended because it demonstrates camera guidance, visual inspection, confidence handling, workflow progression and human escalation without requiring high-risk decision-making.
