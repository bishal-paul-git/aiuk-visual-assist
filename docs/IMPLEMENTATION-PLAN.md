# Implementation Plan and Status
## Absolute Intelligence Visual Assist

**Owner:** Engineering (handover from product definition)
**Last updated:** 2026-10-11
**Source of truth:** documents `00`–`12` in this folder. This plan maps them to code and tracks status. Where this plan and a spec disagree, the spec wins; conflicts are listed in §6.

---

## 1. Repository audit (at handover)

| Area | Finding |
|---|---|
| Codebase | Unmodified `create-next-app` (Next.js 16.2, React 19.2, Tailwind 4, TypeScript). One placeholder page. |
| Product code | None. No domain model, services, UI, tests or data. |
| Reusable components | None beyond Next.js defaults. |
| Docs | Complete product specification (PRD, architecture, UX, data model, AI/workflow, security, NFRs, QA, roadmap, ops, commercial, DoD). Added to `/docs`. |

**Conclusion:** nothing to keep or rework; the build starts from the documented architecture. No existing work was discarded.

---

## 2. Gap analysis against the PRD

Status key: ✅ built · 🟡 partial · ⬜ missing · 🔮 future production work.

### 2.1 Core domain and architecture (docs/02, 04, 05)

| Requirement | Status | Where / notes |
|---|---|---|
| Typed data model (Tenant, User, Agent, Session, Participant, Workflow, WorkflowStep, TranscriptEvent, VisualEvent, VisualObservation, ToolAction, Escalation, AuditEvent, CostEvent) | ✅ | `lib/domain/types.ts`, `lib/domain/session.ts` |
| Event model (`session.*`, `media.*`, `ai.*`, `workflow.*`, `human.*`, `tool.*`) | ✅ | Every material transition is recorded as an `AuditEvent` with workflow/policy/model/prompt versions |
| Session orchestrator — authoritative state outside the model | ✅ | `lib/session/orchestrator.ts` — pure reducer `(state, command) → { state, effects }` |
| Structured, validated model output | ✅ | Observations are schema-typed, clamped and assessed against thresholds before the workflow can branch |
| Event-driven visual inference (never every frame) | ✅ | Only frames that answer an open evidence request are analysed; others are stored as `pending` |
| Workflow engine (ordered steps, branching, visual checkpoints, business actions, escalation, completion) | ✅ | `lib/workflow/engine.ts` + versioned definitions in `lib/config/workflows/` |
| Workflow publish validation | ✅ | `validateWorkflow()` — unknown targets, missing evidence/failure paths, unreachable steps, mandatory human-escalation step |
| Deterministic policy checks for actions | ✅ | `lib/policy/engine.ts` — allow / human-only / deny, regulated = human-only |
| Idempotent business actions | ✅ | Idempotency key per session+step+tool+params; duplicates blocked and audited |
| Business automation outside the media loop | ✅ | Tools run as async effects in the runtime, never inside the orchestrator or media path |
| Human escalation works when AI is unavailable | ✅ | Deterministic human-request detection + `ai_model_failure` fallback (tested) |
| Provider abstraction (reasoning, tools) | ✅ | `lib/providers/types.ts`; simulated implementations in `lib/providers/mock/` |
| Real multimodal reasoning | ✅ (needs key) | `lib/providers/claude/reasoning.ts` — Claude (`claude-opus-5-5`, low effort, server-side refusal fallback) with JSON-schema output, validated against each workflow's `observationVocabulary`; enabled when `ANTHROPIC_API_KEY` is set. Scenario sessions keep using the simulator (`lib/providers/routing.ts`) |
| Sensitive visual data policy (docs/06 §4) | ✅ | Vision layer flags people, cards, ID, screens, plates; tenant policy decides escalate / ask to re-frame / allow |
| Workflow versioning (draft → review → publish, retire, pinning) | ✅ | `lib/workflow/registry.ts`, `/platform/workflows/[id]/edit`; config changes audited; structural (step/rule) editing still to come |
| Provider abstraction (video transport, speech, identity, storage, notifications) | 🟡 | Voice is browser-native behind hooks (`lib/client/speech.ts`); media transport is an interim preview relay; storage is in-memory |
| Multi-tenancy | 🟡 | All entities tenant-scoped; config per tenant (workflow, policy, agent, retention, branding, flags). No auth-enforced isolation yet |
| Durable data platform | ⬜ | In-memory runtime (`lib/server/runtime.ts`) — Phase 3 |
| Observability (logs/metrics/traces) | 🟡 | Audit + cost + latency captured per session; OpenTelemetry export not yet |

### 2.2 Customer Visual Assistance (docs/03 §2)

| Requirement | Status | Notes |
|---|---|---|
| Secure link entry, no app | ✅ | `/assist/[token]` — unguessable token per session |
| Consent / privacy notice | ✅ | Versioned notice; decline ends the session; explains selected-stills-only and retention mode |
| Device permission + capability check | ✅ | Secure-context check, permission errors, voice-only fallback, demo camera for test sessions |
| Live camera, switch camera, camera on/off, mute, human help, end | ✅ | |
| AI voice + natural speech input | 🟡 | Browser speech synthesis/recognition, typed fallback + quick replies. Provider streaming voice is Phase 2 |
| One primary instruction at a time; clear AI vs human identity | ✅ | |
| Required states: show object, hold steady, analysing, need closer view, need another angle, resolved, escalating, human joining/connected, ended, connection degraded, voice-only | ✅ | Stability-gated "hold steady" capture with progress ring |
| Captions / transcript | ✅ | Live caption of current instruction + full transcript sheet |
| Connection quality visible | ✅ | SSE status + upload latency → good/fair/weak/reconnecting, reported to the orchestrator |
| Transparency when a human can see the camera | ✅ | "Your camera is visible to …" indicator |
| QR / SMS / website / authenticated entry | 🟡 | Channel recorded on session; SMS/QR delivery integrations not built |

### 2.3 Human Agent Console (docs/03 §3)

| Requirement | Status |
|---|---|
| Live queue with wait time, SLA, reason, severity, mandatory-human flag | ✅ |
| Live video (left), transcript & context (right), lower panels | ✅ (video is a 1 fps preview relay until WebRTC) |
| AI summary, visual observations with confidence/uncertainty, selected evidence inspection | ✅ |
| Workflow progress, completed steps, escalation reason, suggested next action | ✅ |
| Business actions (policy-checked, idempotent), notes | ✅ |
| Join, take over, return to AI (policy-gated), request a view, message customer, confirm/reject observations, end with outcome | ✅ |
| Structured handover payload (docs/05 §6) | ✅ |
| Real agent authentication / presence / routing by skill | ⬜ (agent picker stands in for SSO) |

### 2.4 AIUK Management Platform (docs/01 §9, docs/03 §4)

| Module | Status |
|---|---|
| Dashboard | ✅ |
| Live Sessions, Session History, Session Detail (audit reconstruction) | ✅ |
| Clients, AI Agents, Visual Workflows (builder view + publish checks + funnel), Policies, Human Teams, Integrations | ✅ read-only views over tenant configuration |
| QA, Analytics, Costs, Audit Logs, System Health, Settings | ✅ computed from session records; unmeasurable metrics labelled as such |
| Editing/publishing workflows | 🟡 Wording, thresholds, attempts and durations editable with versioned publish; step/rule structure editing and policy editing still to come |

### 2.5 Security, privacy, NFRs (docs/06, 07)

| Requirement | Status |
|---|---|
| Selected evidence only; no video retention; preview relay keeps only the latest frame for ≤10 s | ✅ |
| Customer projection excludes internal data (audit, confidence, notes, costs) | ✅ (tested) |
| Command allow-lists per role; input validation; frame size limits | ✅ |
| SSO, MFA, RBAC, encryption at rest, key rotation, retention/deletion jobs, redaction | ⬜ 🔮 Phases 4–6 |
| DPIA, data-residency records | ⬜ (residency fields exist per tenant) |
| Horizontal scale, durable store, DR | ⬜ 🔮 |

### 2.6 QA (docs/08)

| Requirement | Status |
|---|---|
| Unit tests: workflow logic, policy checks, frame-selection rules, validation, state transitions | ✅ `tests/` (Vitest) |
| End-to-end workflow tests through the orchestrator for every scenario (clear, glare, never-clear, wrong object, loose cable, model outage, customer asks for human, return to AI, max duration) | ✅ |
| Browser E2E (Playwright), network simulation, security tests | ⬜ |
| AI evaluation sets with real images | ⬜ — needs real model |

---

## 3. Phased implementation plan

Phases follow `09-DELIVERY-ROADMAP.md`, adjusted so the first complete router loop runs end-to-end as early as possible.

### Phase 1 — Full visual product + domain foundation ✅ (this delivery)
- Domain model, orchestrator, workflow and policy engines, handover, analytics.
- Router Troubleshooting v3 workflow (+ v2 retired, boiler and home-damage drafts for multi-client shape).
- Customer experience, Agent Console, all 16 platform modules.
- Simulated reasoning/tool providers with named scenarios covering every branch.
- In-process runtime with SSE fan-out; seed history generated through the real orchestrator.
- 50+ unit/E2E tests.

### Phase 2 — Technical POC: real router interaction (in progress)
1. ✅ **Real multimodal reasoning provider** behind `ReasoningProvider` — structured JSON output (docs/05 §2) validated against the workflow vocabulary; refusals/invalid output escalate. Remaining: per-token cost capture from `usage`, prompt-version registry, evaluation set with real images.
2. **Real voice layer** — streaming ASR/TTS with barge-in/turn-taking, behind the existing hooks.
3. **WebRTC media layer** — SFU rooms with customer, AI and human participants; replaces the preview relay; human join uses the same room.
4. **Media gateway service** — server-side frame selection on the video track (scene change, scheduled low-rate sample), alongside the client stability gate.
5. Latency and cost measurement against NFR targets; DoD §2 checklist.

### Phase 3 — Internal alpha
- Durable event store + session store (Postgres), orchestrator as a service, outbox for effects.
- ✅ Workflow versioning (draft → review → publish, pinning, audit). Remaining: durable storage, four-eyes approval, structural builder, policy versioning.
- OpenTelemetry traces with session correlation IDs; alerting.
- QA tooling: human review queue, evaluation sets with labelled images, calibration reports.

### Phase 4 — Client pilot (Northline)
- SSO for agents/admins, tenant-enforced RBAC, real CRM/line-test/engineer-booking integrations, SMS link delivery, privacy controls and DPIA.

### Phase 5 — Production pilot
- Retention/deletion jobs, redaction, incident process, resilience (provider failover, retries), cost attribution per tenant, production monitoring.

### Phase 6–7 — Enterprise and scale
- Regional deployment, enterprise audit export, self-service client admin, workflow templates per sector (boiler, insurance evidence), AI copilot after takeover, partner integrations.

---

## 4. How to run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit + orchestrator E2E tests
npm run typecheck
npm run lint
```

Optional: set `ANTHROPIC_API_KEY` (and optionally `VISUAL_ASSIST_MODEL`, default `claude-opus-5-5`) to enable **Live AI** sessions. Without it, every session uses the simulated provider.

- `/` — entry point; **Start test session** creates a live router session and gives you the customer link.
- `/assist/<token>` — customer experience (use a phone on the same network over HTTPS for the real camera, or the demo camera).
- `/console` — Human Agent Console (pick an agent identity top right).
- `/platform` — AIUK Management Platform.
- Seeded in-flight sessions: `/assist/demo-escalated`, `/assist/demo-glare`, `/assist/demo-power-cycle`, `/assist/demo-human`.

The runtime is in-process and in-memory: restarting the server resets live sessions and regenerates seed history.

---

## 5. Architecture map

```
app/assist/[token]        Customer web app (client)  ─┐
app/console/**            Human Agent Console        ─┼─ SSE snapshots ◄── lib/server/runtime.ts
app/platform/**           Management platform (RSC)  ─┘                       │
app/api/assist/**         Customer commands, frame upload, preview relay       │ commands
app/api/sessions/**       Agent commands, session views, evidence, streams     ▼
                                                        lib/session/orchestrator.ts  (pure, deterministic)
                                                          ├─ lib/workflow/engine.ts  (branching, evidence assessment)
                                                          ├─ lib/policy/engine.ts    (tool permissions, return-to-AI)
                                                          └─ effects ─► lib/providers/* (reasoning, tools) ─► result commands
lib/config/*              Tenant configuration catalog (tenants, workflows, policies, agents, teams, integrations)
lib/analytics/metrics.ts  Metrics derived from session records
```

---

## 6. Assumptions and open questions (flagged, not silently decided)

1. **Return to AI after a customer asks for a person** — treated as mandatory-human (customer must not be bounced back to AI). Configurable per policy via `mandatoryHumanReasons`.
2. **"Join" vs "Take over"** — join adds the agent to the interaction (observe/assist) without changing ownership; take over transfers ownership and stops AI workflow progression. AI continues to analyse requested frames as a copilot after takeover (docs/01 §8.6 "optional AI copilot"), but cannot advance the workflow.
3. **Agent preview before WebRTC** — a 1 fps JPEG relay, active only while a human is present or the session is escalated, never analysed or retained. The customer is told when their camera is visible to a person.
4. **Costs** use placeholder unit rates in `lib/domain/pricing.ts` until provider contracts exist.
5. **Repeat-contact rate, field-visit avoidance and CSAT** need CRM integration and are shown as not yet measurable rather than estimated.
6. **Customer-facing brand** (e.g. "Northline") is per-tenant configuration; the reference image's third-party router branding is not used.
