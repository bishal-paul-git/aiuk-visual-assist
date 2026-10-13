# Implementation Plan and Status
## Absolute Intelligence Visual Assist

**Owner:** Engineering (handover from product definition)
**Last updated:** 2026-10-13 (status update below; the tables in §2–§3 date from 2026-10-11)
**Source of truth:** documents `00`–`12` in this folder. This plan maps them to code and tracks status. Where this plan and a spec disagree, the spec wins; conflicts are listed in §6.

---

## Status update — 2026-10-13

**Stage:** working product prototype (simulated AI). Phase 1 is complete. Phase 2 (technical POC) is built in code but **not yet deployed or proven**: no server edition is running anywhere, and no real Anthropic, ElevenLabs, Deepgram, Twilio or identity-provider account has been used.

Added since the tables below were written (all in the server edition, switched on by configuration, tested against mocks or local stand-ins only):

| Area | What exists now | Still missing |
|---|---|---|
| Live video (Phase 2 item 3, part) | Peer-to-peer WebRTC from the customer to the human agent (customer video + audio, agent audio back), SSE signalling, STUN by default, TURN via `ICE_SERVERS`, fallback to the 1 fps preview relay (`lib/media/live-call.ts`, `lib/client/live-call.ts`, `lib/server/signal-relay.ts`) | SFU rooms with the AI as a participant, media gateway, managed TURN, multi-instance signalling |
| Voice (Phase 2 item 2, part) | Server speech-to-text per turn via ElevenLabs Scribe or Deepgram (`/api/assist/[token]/stt`), ElevenLabs text-to-speech (`/api/tts`), 28 pre-recorded British clips for the demo | Streaming speech in/out, barge-in, measured latency; voice is turn-based |
| Workforce sign-in (Phase 4) | OIDC for Entra ID / Okta / Auth0 with PKCE and optional MFA check (`lib/auth/oidc.ts`) | A connected identity provider; persistent user store (users are in memory) |
| Business actions (Phase 4) | Signed HTTP connector per tenant and tool, contract and reference client (`lib/integrations/`, `docs/INTEGRATION-CONTRACT.md`) | Any real client system; no n8n integration exists |
| Testing | 372 unit tests; 9 Playwright tests (public build only); CI runs lint, types, tests, both builds and a Docker build | Browser tests against the server edition, real devices, load |

**Next milestone:** one real session, deployed — a phone opens an SMS link, talks to the AI, Claude reads a real router photo, the workflow advances, one action runs against a staging system, and a human on a laptop takes over with live video, with delay and cost measured (docs/12 §2).

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
| Workflow versioning (draft → review → publish, retire, pinning) | ✅ | `lib/workflow/registry.ts`, `/platform/workflows/[id]/edit`; four-eyes approval (submitter cannot publish; approver recorded); every change audited (`config.workflow_*`) |
| Structural workflow builder | ✅ | `lib/workflow/structure.ts` + `POST /api/workflows/[id]/structure`: add/remove (reference-safe)/reorder steps, edit rules (intent, observation from the workflow vocabulary, tool result, always) and type-specific settings; publish checks re-run on every change |
| Policy versioning | ✅ | `lib/policy/registry.ts`, `/api/policies/**`, `/platform/policies/[id]/edit`: draft → review → publish with four-eyes; previous version retired; workflows reference the lineage key, so new sessions get the active version while running sessions keep theirs; regulated tools can never be `allow` (`validatePolicy`) |
| Provider abstraction (video transport, speech, identity, storage, notifications) | 🟡 | Identity: `IdentityProvider` interface (`lib/auth/identity.ts`) with a demo provider; Entra ID / Okta / Auth0 (OIDC) plug in behind it. Storage: `SessionStore` (memory / file) in `lib/server/store/`. Notifications: `NotificationProvider` (Twilio SMS, Resend-style email, console outbox) in `lib/server/notifications/`. Voice is browser-native behind hooks; media transport is an interim preview relay |
| Multi-tenancy | 🟡 | All entities tenant-scoped; config per tenant (workflow, policy, agent, retention, branding, flags). Isolation enforced on every session/workflow API route, the console and every management-platform module (`lib/auth/rbac.ts`, `lib/auth/scope.ts`, `platformScope()`): client admins see only their own client (other clients' detail pages are 404), with a scope chip in the header. Database-level row security planned |
| Durable data platform | 🟡 | File store under `DATA_DIR` (atomic JSON snapshots + frame files, debounced write-through, restore on boot). Postgres adapter shape documented in `lib/server/store/types.ts` — Phase 3. See `PRODUCTION-READINESS.md` |
| Observability (logs/metrics/traces) | 🟡 | `/api/health` (liveness/readiness), `/api/metrics` (Prometheus), structured JSON logs with request/session ids (`lib/server/log.ts`). OpenTelemetry traces not yet |

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
| QR / SMS / website / authenticated entry | 🟡 | SMS and email link delivery built (`deliverTo` on session create, audited, masked); QR and authenticated entry not built |

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
| Agent authentication | 🟡 Signed-in user is the actor (demo sign-in at `/sign-in`, signed HttpOnly cookie); body-supplied agent ids are ignored. SSO pending |
| Agent presence / routing by skill | ⬜ |

### 2.4 AIUK Management Platform (docs/01 §9, docs/03 §4)

| Module | Status |
|---|---|
| Dashboard | ✅ |
| Live Sessions, Session History, Session Detail (audit reconstruction) | ✅ |
| Clients, AI Agents, Visual Workflows (builder view + publish checks + funnel), Policies, Human Teams, Integrations | ✅ read-only views over tenant configuration |
| QA, Analytics, Costs, Audit Logs, System Health, Settings | ✅ computed from session records; unmeasurable metrics labelled as such. Client admins get a tenant-scoped view (Health: service status only; Settings: own retention) |
| Enterprise audit export | ✅ `GET /api/audit/export?format=csv\|json&from=&to=&tenantId=&category=` (`audit.view`, tenant-scoped): session, config and security events; streamed RFC 4180 CSV with formula-injection guard; each export audited (`audit.exported`). "Export" on Audit Logs (server edition) |
| Editing/publishing workflows | ✅ Wording, thresholds, step structure and branching rules editable on a draft with live publish checks; four-eyes publish |
| Editing/publishing policies | ✅ Tool mode/risk/idempotency, limits and return-to-AI on a versioned draft; four-eyes publish; read-only in the static demo |

### 2.5 Security, privacy, NFRs (docs/06, 07)

| Requirement | Status |
|---|---|
| Selected evidence only; no video retention; preview relay keeps only the latest frame for ≤10 s | ✅ |
| Customer projection excludes internal data (audit, confidence, notes, costs) | ✅ (tested) |
| Command allow-lists per role; input validation; frame size limits | ✅ |
| RBAC + tenant isolation | ✅ 5 roles × 16 permissions (`lib/auth/rbac.ts`), enforced on API routes (401/403 JSON) and console/platform pages; static demo enforces the same rules in the browser runtime. Matrix shown in Settings |
| Sign-in / SSO | 🟡 Demo identity provider + HMAC-signed session cookie (`AUTH_SECRET`); OIDC provider still to build. Customers stay token-based |
| Security audit | ✅ `security.signed_in/signed_out/sign_in_failed/permission_denied` and `audit.exported` in Audit Logs |
| Transcript PII redaction | ✅ `lib/privacy/redact.ts` — cards (Luhn), emails, phones, UK postcodes, account numbers/sort codes removed from customer and agent text before storage; `privacy.redacted` audit. Image blur ⬜ |
| Retention job | ✅ `lib/privacy/retention.ts` — per-tenant evidence/transcript expiry from session end, run from the server runtime every 10 min; `privacy.retention_purged` audit; status in Settings › Retention. Audit-log expiry needs the durable store |
| MFA, encryption at rest, key rotation, subject-request deletion | ⬜ 🔮 Phases 4–6 |
| DPIA, data-residency records | ⬜ (residency fields exist per tenant) |
| Horizontal scale, durable store, DR | 🟡 Durable on one instance (`DATA_DIR`); multi-instance and DR need Postgres + shared event bus 🔮 |

### 2.6 QA (docs/08)

| Requirement | Status |
|---|---|
| Unit tests: workflow logic, policy checks, frame-selection rules, validation, state transitions | ✅ `tests/` (Vitest) |
| End-to-end workflow tests through the orchestrator for every scenario (clear, glare, never-clear, wrong object, loose cable, model outage, customer asks for human, return to AI, max duration) | ✅ |
| Browser E2E (Playwright) | ✅ `e2e/` — the demo walkthrough drives the real customer page and agent console for an AI-resolved and a human-resolved session; runs in CI |
| Security tests | ✅ RBAC matrix, tenant isolation, platform scoping (`tests/scope.test.ts`, page-level `tests/platform-scope.test.ts`), audit export CSV escaping/injection and scoping (`tests/audit-export.test.ts`), cookie signing/tampering, redaction (incl. false-positive guards), retention (`tests/`); role check in `e2e/access.spec.ts` |
| Network simulation | ⬜ |
| Human review queue | ✅ `lib/qa/` + `/platform/qa/review`: deterministic sampling (all unclear-evidence / model-failure / human-rejected sessions + `QA_AI_RESOLVED_SAMPLE_RATE` of AI-resolved, seeded by session id); queued → in review → completed; per-observation verdicts with corrected values from the workflow vocabulary, outcome correctness, 1–5 rubric, notes; no self-review; `qa.review_*` audit on the session; `qa.review` permission; `DATA_DIR/qa.json` |
| AI evaluation sets | 🟡 `/platform/qa/evaluations`: seeded 20-case router set from synthetic scenes (+ frames added from completed reviews); runner reports accuracy per type, confusion counts, hallucination rate and ECE; simulated scene reader by default, Claude on an explicit Run when `ANTHROPIC_API_KEY` is set (`qa.evaluate`). Remaining: photographed real-device images |
| Calibration report | ✅ QA page: reported confidence vs human-confirmed accuracy per band, with ECE (QA verdicts + console checks) |

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
1. ✅ **Real multimodal reasoning provider** behind `ReasoningProvider` — structured JSON output (docs/05 §2) validated against the workflow vocabulary; refusals/invalid output escalate. ✅ Per-token cost capture from `usage` (measured vs estimated, fallback-aware). Remaining: prompt-version registry, evaluation set with real photographed images (synthetic set and runner ✅).
2. **Real voice layer** — streaming ASR/TTS with barge-in/turn-taking, behind the existing hooks.
3. **WebRTC media layer** — SFU rooms with customer, AI and human participants; replaces the preview relay; human join uses the same room.
4. **Media gateway service** — server-side frame selection on the video track (scene change, scheduled low-rate sample), alongside the client stability gate.
5. Latency and cost measurement against NFR targets; DoD §2 checklist.

### Phase 3 — Internal alpha
- Durable event store + session store (Postgres), orchestrator as a service, outbox for effects.
- ✅ Workflow versioning (draft → review → publish, pinning, audit), structural builder, four-eyes approval and policy versioning. Remaining: durable storage of configuration versions; approver identity from SSO/RBAC instead of the POC "Acting as" picker.
- ✅ Health/metrics endpoints and JSON logs with correlation ids. Remaining: OpenTelemetry traces, alerting.
- ✅ QA tooling: human review queue, evaluation sets with labelled images, calibration reports. Remaining: real-photo evaluation set; QA events in the audit explorer's category filter.

### Phase 4 — Client pilot (Northline)
- SSO for agents/admins (OIDC behind `IdentityProvider`), ✅ tenant-enforced RBAC, real CRM/line-test/engineer-booking integrations, privacy controls and DPIA. (✅ SMS/email link delivery adapters — needs pilot credentials.)

### Phase 5 — Production pilot
- ✅ Retention job and transcript redaction (in-memory); durable deletion, image redaction, incident process, resilience (provider failover, retries), cost attribution per tenant, production monitoring.

### Phase 6–7 — Enterprise and scale
- Regional deployment, ✅ enterprise audit export, ✅ tenant-scoped management platform for client admins (self-service user management still to do), workflow templates per sector (boiler, insurance evidence), AI copilot after takeover, partner integrations.

---

## 4. How to run

Live static demo: https://bishal-paul-git.github.io/aiuk-visual-assist/ (rebuilt on every push to `main`).

Deploying the server edition (Docker, Render, Railway/Fly, Hostinger): see [DEPLOYMENT.md](DEPLOYMENT.md).


```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit + orchestrator E2E tests
npm run build:static && npm run test:e2e   # browser E2E (Playwright) against the static demo
npm run typecheck
npm run lint
```

Server edition sign-in: open `/sign-in` and pick a demo user (agents/supervisors land on the console, platform roles on the platform). Set `AUTH_SECRET` (32+ characters) in any deployed environment; without it a random per-process secret is used and sessions end on restart. The static demo needs no sign-in: switch demo identity from the header.

Optional: set `ANTHROPIC_API_KEY` (and optionally `VISUAL_ASSIST_MODEL`, default `claude-opus-5-5`) to enable **Live AI** sessions. Without it, every session uses the simulated provider.

- `/demo` — demo stage. **Play walkthrough** scripts the customer and the agent through a whole session with captions (`lib/demo/walkthrough.ts`); **Start session** lets you drive both sides yourself.
- `/` — entry point; **Start test session** creates a live router session and gives you the customer link.
- `/assist/<token>` — customer experience (use a phone on the same network over HTTPS for the real camera, or the demo camera).
- `/console` — Human Agent Console (acts as the signed-in user; the static demo has an identity switcher top right).
- `/platform` — AIUK Management Platform.
- Seeded in-flight sessions: `/assist/demo-escalated`, `/assist/demo-glare`, `/assist/demo-power-cycle`, `/assist/demo-human`.

By default the runtime is in-memory: restarting resets live sessions and regenerates seed history. For durable runs use `npm run build && DATA_DIR=./data npm start` — see `PRODUCTION-READINESS.md` for all environment variables, `/api/health` and `/api/metrics`.

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
4. **Costs** use placeholder unit rates in `lib/domain/pricing.ts` until provider contracts exist, except live model calls, which are priced from provider-reported tokens at list price (labelled *measured*).
5. **Repeat-contact rate, field-visit avoidance and CSAT** need CRM integration and are shown as not yet measurable rather than estimated.
6. **Policy status naming** — the published state of a policy is stored as `active` (as for agents) rather than `published`; the lifecycle is otherwise identical to workflows. A session restored from another tab in the static demo re-resolves the active policy version.
7. **Customer-facing brand** (e.g. "Northline") is per-tenant configuration; the reference image's third-party router branding is not used.
8. **Platform admins do not operate sessions** (least privilege): they view sessions and configure every tenant; joining/taking over is for agents and supervisors. Client admins configure their own tenant and use the management platform confined to their own client (`lib/auth/scope.ts`); any non-platform role given `platform.access` later (e.g. client supervisors) gets the same scoping. The static demo has no server identity and always shows the all-clients view.
9. **Redaction happens before storage and before the model sees the text.** The AI therefore never receives a customer's postcode or account number; workflows that need such values must collect them through a dedicated, policy-controlled capture step. Agent notes are not redacted (agents may need to record references).
10. **Retention clock starts at session end**; live sessions are never purged. Removed frames/transcripts leave structured metadata and an audit event.
