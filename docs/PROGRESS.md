# Build progress log
## Absolute Intelligence Visual Assist

This is the single place for build status. Update it with every change that alters what works, and add a dated entry to the log at the bottom. The newest entry goes first.

**Last updated:** 2026-10-28

---

## 1. Where things are

| What | Where | Status |
|---|---|---|
| Code | github.com/bishal-paul-git/aiuk-visual-assist (`main`) | Every push runs lint, typecheck, unit tests, both builds and browser tests |
| Public demo | https://bishal-paul-git.github.io/aiuk-visual-assist/ | Live. Simulated AI and sample data, for walkthroughs |
| Team testing guide | https://bishal-paul-git.github.io/aiuk-visual-assist/test/ | Live |
| Real-testing server | https://visual-assist-7viw.onrender.com | Deployed on Render (Docker, `render.yaml`) |
| Database | Supabase, schema `visual_assist` | Connected (`DATABASE_URL`). Tables sessions, frames, config and qa, with RLS on |
| n8n receiver | n8n.automationworkflows.io, workflow "Visual Assist · Business Actions (Northline)" | Published. Rejects a wrong secret; a correctly signed call has not yet reached it from the server |

## 2. What is switched on in the real-testing server

The table comes from `/api/capabilities` (reported by the owner, 2026-10-23) and from the Render service settings and logs (read by Claude through the Render connector, 2026-10-24).

| Capability | State | Provider |
|---|---|---|
| Real AI (reasoning and photo reading) | On | Claude (Anthropic) |
| Speech to text (iPhone voice input) | On | ElevenLabs Scribe |
| AI voice | On | ElevenLabs |
| SMS customer links | On | Twilio |
| Live video relay (4G/5G) | On | Twilio TURN |
| Database | On | Supabase Postgres |
| Business actions (Northline) | On for 5 tools: create_ticket, update_case, book_engineer, order_replacement_router, issue_account_credit, all Built-in (set by `INTEGRATIONS_CONFIG` on Render, so locked on the Integrations page) | Built-in |
| Line test | Sandbox, until the n8n secret is entered on Platform → Integrations (Client API or n8n) | n8n (ready) |
| Email links | Off (optional) | Resend |
| Company sign-in (SSO) | Built, not connected | Entra ID or Okta |

## 3. Verified vs. not yet verified

**Verified by automated tests on every change:**
- Session flow, workflow engine, policy checks, handover and role access.
- Postgres store (PGlite) and the HTTP connector contract.
- n8n Code node against the real connector.
- Built-in actions, encrypted secret storage and the connector editor API.
- Browser tests: the static demo (10) and the server edition (5). The server tests cover a phone and a laptop in one session, and a client admin connecting business actions.

**Verified by hand:**
- Render deploy, the Supabase tables, the capabilities list above, and the n8n rejection of a wrong secret.

**Not yet verified, and needed before showing Keith:**
- One full real session: an SMS link to a real phone, the camera, Claude reading a real router, Human help, and an agent joining and taking over with live video. To be done on an iPhone and an Android phone, each on Wi-Fi and 4G/5G.
- Claude's accuracy on real router photos (the `npm run eval:photos` harness is ready; it needs 30–50 photos).
- A business action from a live session landing as a built-in record or in n8n.
- The deployment check from outside. This build environment cannot reach `onrender.com`; it needs `onrender.com` allowed under Network access.

## 4. What the product does today

- **Customer (phone browser, no app):** consent, camera, voice or text, the AI guides them through the approved router workflow, photos are read by Claude with confidence gating, and a Human help button.
- **Agent console:** live queue, join, take over, live video, messages, notes, business actions under policy, return to AI, and end.
- **Client portal (`/client`):** a simpler portal for clients to try the product and see results for their own organisation only.
- **Management platform (admin portal, `/platform`):**
  - Clients, AI agents and visual workflows, with versioning and four-eyes publish.
  - Policies.
  - Teams.
  - Integrations: connect business actions per client.
  - QA review and evaluations.
  - Analytics, costs, audit logs, system health and settings.
- **Business actions:** each tool runs in one of three modes, set on Platform → Integrations:
  - *Built-in*: Visual Assist creates and keeps the record, such as a ticket, case, engineer booking, replacement router order, credit or claim evidence.
  - *Client API or n8n*: a signed HTTPS call to the client's system.
  - *Sandbox*: pretend results.
- **Security:**
  - Role-based access with 5 roles and client isolation.
  - Signed session cookies; OIDC SSO is ready.
  - PII redaction and an audit trail.
  - Connector secrets are encrypted at rest and never shown.

## 5. Known limits (honest)

- `line_test` has no built-in option, because it needs a real network diagnostics API. Until a client API or n8n is connected, it stays on the sandbox in real sessions, and the console labels its result accordingly. The n8n workflow's line test is also a stand-in that reports "no fault".
- Voice is turn-based: the customer cannot interrupt the AI. Streaming voice is the next large piece of work.
- Only the Router v3 workflow is fully runnable. The others are defined but not tuned.
- The server is a single Render instance, which is right for testing but not for customer volumes.
- The platform pages contain catalogue figures (integration latency and error rates, some health values). They are labelled, but they are not live monitoring.

## 6. Open items

| # | Item | Owner | Blocked on |
|---|---|---|---|
| 1 | Line test to n8n: on Platform → Integrations select line_test, choose Client API or n8n, paste the URL and secret, then Save and Test | Owner | The secret file (Claude cannot copy secrets) |
| 2 | Full real-device session, then fill in the device results | Owner + Claude | A phone and a laptop |
| 3 | 30–50 router photos plus `labels.csv`, then run the photo accuracy report | Owner (photos), Claude (report) | Photos |
| 4 | Render logs, deploys and settings are readable by Claude (Render connector). A direct HTTP check still needs `onrender.com` allowed in this environment's network settings | Owner | Optional |
| 5 | One-page results report for Keith | Claude | Items 2 and 3 |
| 6 | Real line-test API from a client, or decide that n8n stays as the stand-in | Owner | Client |
| 7 | Streaming voice with barge-in | Claude | After the device tests |

## 7. Test counts (latest run)

| Suite | Result |
|---|---|
| Unit tests | 425 (424 passed, 1 skipped, needs a live Postgres) |
| Static demo browser tests | 10 |
| Server edition browser tests | 5 |
| Builds | Server and static both build |

---

## Log

### 2026-10-29 — Testing guided inside the product

- The trial page now guides the test itself, so testers need no document:
  - a **QR code** next to the customer link: scan it with the phone to open the customer view;
  - a live **test checklist** (8 things to try), ticked off from the real conversation as it happens, with the next thing to try spelled out;
  - **How did it go?** at the end: "It worked well" or "I found a problem" plus a note, saved on that conversation's record (shown under "Notes and tester feedback" in Sessions).
- Removed the static "Things worth trying" box; the checklist replaces it.

### 2026-10-29 — Walk-through review: clearer screens

- Walked the whole trial as a first-time tester, with screenshots, and fixed what was unclear:
  - the customer now sees what the AI read in each picture ("I saw: Internet light: off"), instead of the next instruction replacing it silently;
  - **Capture now** is readable over the camera picture;
  - the agent screen says "The customer asked for a person, so a person finishes this conversation" instead of a system code;
  - the portal's conversation list updates by itself.
- New: `docs/TESTER-GUIDE.md`, a one-page, 10-minute guide to send to testers.

### 2026-10-29 — Human handover fixed, agent alert, one voice, avatar, no-camera help

- Fixed: when a customer asks for a person, the agent who presses **Join session** is put in charge straight away and greets the customer by name. Before, joining only watched, so the customer heard nothing until **Take over** was pressed.
- New: agents are alerted. The console and the client portal play a chime (repeated every 15 s while someone waits), show a **Join now** banner, flash the tab title and send a desktop notification. Press **Turn on alerts** once, because browsers block sound until a click.
- Changed: one British voice (Georgia K) speaks every line, the AI's and the agents' typed messages. If the plan refuses it, Alice is used from then on, never switching back. The phone's own voice is no longer used on the real server; if the voice service fails, the line stays as text.
- New: an assistant avatar on the customer screen, which moves its mouth while speaking. When the camera is off it fills the screen; a person shows as their initials.
- New: help without a camera. If the camera is off, turned off, or the customer says they can't show it, the AI asks them to describe the lights and guides the cable check by touch, then the restart. Training notes cover how customers describe the lights.
- Test text: the sender is `+447863750600`. The first test was sent to the same number, which Twilio refuses; it must go to a different mobile.

### 2026-10-28 — The assistant talks; better British voices; AI training

- Fixed: the assistant and agent now speak aloud. Phones refuse sound until the person taps, so the app unlocks audio on the first tap (agree, camera, anything) and uses one audio player for the whole session. If a phone still blocks it, a **Tap to hear the assistant** button appears and repeats the last line.
- Changed: on the real server every line is spoken live by the voice service (new British voices: Georgia K for the assistant, Ali and Craig for agents). If the service refuses a voice for plan reasons, stock British voices (Alice, George) are tried. The recorded clips are used only on the public demo.
- Changed: the voice provider's real error now appears in the Render logs and in `GET /api/tts`; `npm run check:deployment` speaks a test line and fails if it cannot.
- New: AI training notes per workflow (`aiNotes`), added to the AI's instructions and shown to admins. The AI is also told to use British English and never to report what it cannot see. `docs/AI-TRAINING.md` explains the full training loop.
- Not done: the session record does not yet say whether the customer heard the voice; real-phone check still needed.

### 2026-10-27 — A real client experience: landing page, login, two-sided trial

- New: the server's front page (`/`) is now a short marketing page for the product, with a **Try it now** button. The GitHub Pages demo keeps its walk-through home page.
- New: a trial login. The email and password are already filled in on `/client/sign-in`; the tester clicks **Log in**. It signs in as a supervisor of Northline (`Demo Tester`), so one login can play the customer and the agent, and it cannot change settings. Wrong passwords are throttled, and the account may start 40 conversations a day (`TRIAL_*` settings in `docs/TEAM-TESTING.md`).
- New: the portal's first page is a guided two-sided trial. The tester starts a conversation (real AI with a real camera, or a guided example), then gets two clearly labelled cards, **Be the customer** and **Be the human agent**, and a live banner that says whose turn it is and what to do, taken from the real session. The latest messages from both sides show underneath.
- Checked end to end in a real browser: landing page, login, start, customer on a phone (consent, camera, typing), Human help, agent joins, live video reaches the agent with real frames, take over, chat both ways, End, and the record shows everything. Also an agent who steps in on their own handing back to the AI. When a customer asks for a person, policy keeps a person on the call, and Return to AI shows why it is unavailable.
- New: optional `STAFF_SIGNIN_PASSWORD`. Without it anyone with the address can pick any staff account on `/sign-in` (the existing demo sign-in). **Recommended to set it before sharing the address widely.**

### 2026-10-26 — Client portal

- New: a separate portal for clients at `/client`, with its own sign-in (`/client/sign-in`, client staff only). The admin portal at `/platform` is unchanged.
- Pages:
  - Home: a four-step guide, what is switched on in plain words, what the signed-in role can do, and the client's latest sessions.
  - Sessions and session detail: conversation, what the AI saw, business actions with references.
  - Results: live AI compared with scripted scenarios, as measured.
  - Systems: how each business action runs.
- Each client sees only its own data. Another client's session is reported as not found. Absolute Intelligence staff can preview any client with `?org=`.
- After sign-in, client staff now land in the client portal and platform staff in the admin portal.
- Brightwater and Harbour have no published workflow yet (in review, draft), so only Northline can start sessions.
- Tests: 9 unit tests, 4 server browser tests and 3 static browser tests added.

### 2026-10-24 — Business actions switched on in the real server

- Through the Render connector: set `INTEGRATIONS_CONFIG` so Northline's create_ticket, update_case, book_engineer, order_replacement_router and issue_account_credit run as Built-in. The deploy went live, the Postgres store is ready, and there were no errors or warnings at start.
- Line test stays on the sandbox until the n8n secret is entered on the Integrations page.

### 2026-10-23 — Direct integrations, built in

- New: Platform → Integrations lets a platform or client admin connect each business action without editing server settings:
  - choose Built-in, Client API or n8n, or Sandbox for any set of tools;
  - paste the endpoint and secret once;
  - press Test to send one real call and see the result in plain English.
- New: built-in actions. Visual Assist itself records tickets, case updates, engineer bookings (next weekday, 08:00–13:00), router orders, credits and claim evidence, each with a reference, and lists them under "Recent real business actions" with a link to the session.
- New: secrets entered on the page are stored encrypted (AES-256-GCM, key from `AUTH_SECRET`) with the configuration in Supabase. The `INTEGRATION_SECRET_*` env vars still win. Every change is audited as `security.connector_changed`.
- Changed: the header now says "Testing environment" on a server started without sample data, instead of "Demo environment · sample data".
- Changed: `/api/capabilities` lists built-in connectors with their mode, and `npm run check:deployment` reports them.
- Tests: 7 unit tests and 2 server browser tests added.

### 2026-10-18 — n8n receiver

- The n8n workflow for Northline is built and published. It checks a hashed secret, rejects other clients, de-duplicates retries and answers six tools. Its Code node is in `integrations/n8n/`, with a contract test.

### 2026-10-13 to 2026-10-17 — Go-live readiness

- Supabase Postgres store, Claude timeouts and retry, Twilio TURN, the deployment check, the router photo evaluation harness, server browser tests and the empty start for the real server (`SEED_SAMPLE_SESSIONS=0`).
- The Render server was deployed with Claude, ElevenLabs, Twilio and Supabase connected.

### Before 2026-10-13

- Full visual product and domain foundation:
  - customer app, agent console and management platform;
  - workflow and policy engines, RBAC, OIDC, the signed client API contract and live video;
  - server speech to text, team testing guide and the public demo.
