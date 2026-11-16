# Visual Assist — the whole system and product in one place

**Start here.** This is the master reference for Absolute Intelligence Visual Assist: what the product is, how it works end to end, where everything lives, what it costs, how to run it, and what's done and still to do. The other files in `docs/` go deeper on single topics (listed at the end).

Last updated: 16 Nov 2026.

---

## 1. The product in one minute

**What it is.** A customer with a problem at home (internet down, a new router, a boiler fault, storm damage) opens a link on their phone. They talk to an AI assistant and **point the camera at the problem**. The AI reads what it sees (router lights, cables, a boiler code), guides them through **steps the client company approved**, and fixes it. If it can't, or the customer asks, **a person joins the same session**, already seeing everything that's been done.

**Who buys it.** Companies with a lot of support calls about physical equipment:
- broadband and telecom (first market);
- energy and utilities;
- appliance makers and home insurers.

**Why they buy it.**
- **Fewer calls:** each support call costs about £5–6.
- **Fewer engineer visits:** each costs about £60–£120, and 17–25% find no fault.
- **Faster fixes.**
- **Evidence:** every case has photos and a record of every step.

See `MARKET-RESEARCH.md`.

**Business model.** A managed SaaS: one platform, and each client company gets its own space (brand, flows, rules, staff). Revenue is a setup fee plus a monthly fee. It starts with paid pilots. See `LAUNCH-PLAN.md` and `11-COMMERCIAL-AND-PACKAGING.md`.

**Current focus (16 Nov 2026).** Build a fully working product cheaply, using demo clients and demo data. Home Telecom and pricing come after.

---

## 2. Who uses it

| Person | Where | What they do |
|---|---|---|
| **Customer** (the client's end customer) | Secure link on their phone: `/assist/<token>` | Agrees to the privacy notice, turns on the camera (or voice only), follows the AI, asks for a person, rates the help |
| **Support agent** (client staff) | Agent console: `/console` | Sends customer links, watches the live queue, joins or takes over a session, sees the photos and the AI's reading, runs approved actions, hands back to the AI |
| **Supervisor** (client staff) | Console and client portal | The same as an agent, plus QA review |
| **Client admin** (client's manager) | Client portal: `/client` | Results and pilot report (with CSV), conversations, their flows and rules, brand, settings. They can't start sessions. |
| **Platform admin** (Absolute Intelligence) | Platform: `/platform` | Every client: **Add a client**, brands, workflows and policies (with a second-person approval), integrations, costs, health, audit, QA |
| **QA reviewer** (Absolute Intelligence) | Platform → QA | Reviews sampled sessions and runs AI accuracy checks |

Roles and permissions are in `lib/auth/rbac.ts`.
- Client roles only ever see their own client's data.
- A private (real) client's staff are hidden from the demo sign-in. They sign in with their work email and the client password.

---

## 3. End-to-end flow

```
Agent clicks "Send a customer link" (picks: internet down / new router setup)
  → session created, secure link (text message, email, QR or copy)
Customer opens link → privacy notice → camera + mic (or voice only)
  → AI greets (client's brand) → asks for a view (e.g. "show me the router lights")
  → still frame sent → AI reads it (lights, cables) with a confidence score
      unclear?  → asks for a closer view (never guesses); 3 tries then a person
  → workflow engine picks the next approved step (guidance / question / action)
  → business action if needed (line test, update case; risky ones need a person)
  → resolved by AI  ─────────────────────────────┐
  → or handover: agent alerted, joins with full context, live video ─┤
                                                                      ↓
Session ends → customer rates (thumbs up/down + comment) → audit trail, photos kept for
the client's retention period → shows in Results, pilot report, CSV, QA sampling
```

**The rule the system is built on:** the AI only **perceives and talks**. The approved **workflow and policy engine decides** what happens next. The AI can't invent steps. It can't run risky actions; those need a person. It must say "can't read it" rather than guess.

---

## 4. Architecture

One Next.js 16 app (React 19, TypeScript) serves everything: customer pages, console, client portal, platform and the API. It runs as one Docker container.

| Layer | What | Where in the code |
|---|---|---|
| Customer app | Consent, camera, voice, live guidance, rating, privacy notice | `app/assist/`, `components/assist/` |
| Agent console | Queue, live session, takeover, notes, actions | `app/console/`, `components/console/` |
| Client portal | Results, report, conversations, settings | `app/client/`, `lib/server/client-data.ts`, `lib/analytics/` |
| Platform | Clients (incl. **Add a client**), workflows, policies, agents, teams, integrations, costs, health, audit, QA | `app/platform/`, `components/platform/` |
| API | Sessions, customer commands, events (server-sent events), auth, client and platform admin | `app/api/` |
| Session runtime | Creates sessions, holds live state, runs the orchestrator, keeps state between restarts | `lib/runtime/`, `lib/session/` |
| Orchestrator | Applies each command or event to the session; enforces consent, ownership and rules | `lib/session/orchestrator.ts` |
| Workflow engine | Steps, conditions, confidence thresholds, retries, escalation; versioning with second-person approval | `lib/workflow/` |
| Policy engine | Which tools the AI may run (allow / human only / deny), sensitive data, limits | `lib/policy/` |
| AI providers | Claude for vision and language (live); a simulated provider for demos and tests | `lib/providers/claude/`, `lib/providers/mock/` |
| Voice | ElevenLabs voice output; speech-to-text via ElevenLabs or Deepgram; browser voice as a fallback | `lib/server/voice/`, `app/api/tts/` |
| Live video | WebRTC customer ↔ agent; TURN relay via Twilio when set | `lib/media/`, `lib/server/turn.ts`, `lib/server/signal-relay.ts` |
| Integrations | Line test, case update, ticket, text message summary, engineer booking: a signed HTTP contract per client, secrets sealed | `lib/integrations/`, `docs/INTEGRATION-CONTRACT.md` |
| Notifications | Customer links by text message (Twilio) and email (Resend); console fallback | `lib/server/notifications/` |
| Storage | Postgres (Supabase, schema `visual_assist`) or a file or memory store; configuration in one row | `lib/server/store/` |
| Sign-in | Demo picker (with staff password), trial login, client-staff password, company sign-in (OIDC) ready | `lib/auth/`, `app/api/auth/` |
| Observability | JSON logs, `/api/health` (with recent failure alerts), metrics, audit trail | `lib/server/log.ts`, `lib/server/metrics.ts`, `lib/audit/` |
| Catalog (seed config) | Clients, AI agents, policies, workflows, teams, users | `lib/config/catalog.ts`, `lib/config/workflows/` |
| Clients added without code | Saved with the configuration | `lib/config/clients.ts` |

**Static demo edition.** The same code built with `STATIC_EXPORT=1` runs entirely in the visitor's browser, with the simulated AI and no server. It is published free to GitHub Pages on every push to `main` (`.github/workflows/deploy-pages.yml`). This is the **separate demo address** for sales: it never touches client data.

---

## 5. AI flows (workflows) available

| Flow | Key | Clients | Status |
|---|---|---|---|
| Router troubleshooting (internet down) | `router-troubleshooting` | X Telecom (demo), Home Telecom, new broadband clients | Published, trained (photo accuracy tests) |
| **New router setup** | `router-setup` | X Telecom (demo), Home Telecom, new broadband clients | Published v1 (16 Nov) |
| Boiler fault code | `boiler-fault-code` | Brightwater Energy (demo), new energy clients | In review |
| Home damage evidence | `home-damage-evidence` | Harbour Mutual (demo), new insurance clients | Draft |

**What each flow defines:**
- steps;
- what the camera must show at each step;
- the readings it can record (vocabulary with reading guides);
- confidence thresholds and retries;
- approved answers to common questions;
- the client's training notes for the AI;
- what the AI must never suggest;
- what happens with no camera.

**Changing a flow:** Platform → Workflows. Edit a draft, submit it, then a second admin publishes it. Running sessions keep the version they started on.

**New router setup steps:**
1. Check it's the router.
2. Connect the cables (unplug the old router first).
3. Check the cables on camera.
4. Wait for the first connection.
5. Read the lights.
6. Join the Wi-Fi.
7. Confirm the internet works and close the case.

If it's still not connected, it runs a line test and hands over to the network team. Every step works without a camera too.

---

## 6. Clients and demo data

| Client | ID | Type | Sign-in |
|---|---|---|---|
| X Telecom | `tnt_northline` | Demo, broadband | Demo picker and trial login |
| Brightwater Energy | `tnt_brightwater` | Demo, energy | Demo picker |
| Harbour Mutual Insurance | `tnt_harbour` | Demo, insurance | Demo picker |
| Home Telecom | `tnt_hometelecom` | Private pilot client (placeholder staff) | Work email + client password (`CLIENT_SIGNIN_PASSWORDS`) |
| Anything added on the platform | `tnt_<name>` | Demo or private | Demo picker, or email + client password |

**Add a client** (Platform → Clients → Add a client, platform admins only):
- **Fields:** name, industry template, brand colour, support line, how long to keep photos and transcripts, staff (the first is the manager, the rest are agents), and "Real client".
- **What it creates:** the client space, copies of the template's flows and safety rules (owned by that client), a support team, an AI assistant and the logins.
- **Persistence:** saved with the configuration, so it survives restarts.
- **Private clients:** their staff also need an entry in `CLIENT_SIGNIN_PASSWORDS`. Sign-in fails closed without one.

---

## 7. Hosting, services and costs

| Service | Used for | Plan now | Cost |
|---|---|---|---|
| Render | The server (Docker) | Starter, Oregon. **Suspended for billing on 13 Nov.** | $7/month, or **free plan** (see below) |
| Supabase | Postgres database, Frankfurt | Free | £0 (Pro $25/month later, for daily backups) |
| GitHub | Code, tests, uptime check every 15 min, daily AI check, nightly backup, static demo on Pages | Free | £0 |
| Anthropic (Claude) | AI vision and language | Pay as you go | About 3–5p per session including voice |
| ElevenLabs | Assistant voice, speech to text | Pay as you go or subscription | Small; browser voice is the free fallback |
| Twilio | Text message links; TURN relay for live video | Pay as you go | Pence per message; only needed for real customers |
| Resend | Email links | Free tier | £0 |

**Cheapest way to run it while building:**
- **Server:** Render's free plan, created in Frankfurt (next to the database). It sleeps after 15 minutes idle, and the first visit after that takes about a minute.
- **Sales demo:** the static demo on GitHub Pages (free).

**Why Frankfurt.** The database is in Frankfurt. A server in the US adds a round trip across the Atlantic to every click, and buyers prefer data kept in Europe. Moving costs nothing, but it isn't needed to build.

**Settings (server environment variables).** These are names only; values live in the Render dashboard and are never in the repo.
- **Required:**
  - `AUTH_SECRET`
  - `DATABASE_URL` (plus `DATABASE_SSL` as needed)
  - `PUBLIC_BASE_URL`
- **AI:**
  - `ANTHROPIC_API_KEY`
  - `VISUAL_ASSIST_MODEL` (optional)
- **Voice:**
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID`
  - `STT_PROVIDER`
  - `DEEPGRAM_API_KEY`
- **Texts and email:**
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM`
  - `RESEND_API_KEY`
- **Live video relay:**
  - `TURN_PROVIDER`
  - `ICE_SERVERS`
- **Sign-in:**
  - `STAFF_SIGNIN_PASSWORD` (demo picker)
  - `TRIAL_LOGIN_ENABLED`, `TRIAL_LOGIN_EMAIL`, `TRIAL_LOGIN_PASSWORD`
  - `CLIENT_SIGNIN_PASSWORDS` (JSON: client ID to password, minimum 12 characters)
  - `OIDC_*` (company sign-in, later)
- **Integrations:** `INTEGRATIONS_CONFIG`
- **Operations:**
  - `METRICS_TOKEN`
  - `LOG_LEVEL`
  - `SEED_SAMPLE_SESSIONS`

`DEPLOYMENT.md` has the full list and what each does.

---

## 8. Running and operating it

- **Locally:** `npm ci && npm run dev`, then open http://localhost:3000. It uses the simulated AI unless `ANTHROPIC_API_KEY` is set.
- **Deploy:** push to `main`. Render rebuilds the Docker image automatically, and GitHub Pages rebuilds the static demo.
- **Health:** `/api/health` shows status, store, sessions and `alerts` (customer-facing failures in the last 15 minutes).
- **Uptime:** `.github/workflows/uptime.yml` runs every 15 minutes. It fails, and GitHub emails you, if the site is down or degraded, or if there are 3 or more customer-facing failures in 15 minutes.
- **Daily AI check:** `.github/workflows/production-check.yml`.
- **Backups:** `.github/workflows/backup.yml` runs nightly. It takes an encrypted database dump and keeps it 30 days as a GitHub artifact. It needs repository secrets `BACKUP_DATABASE_URL` and `BACKUP_PASSPHRASE`. Restore steps are in the file.
- **Clear test data:** Admin → Settings → Reset test data.
- **Runbooks:** `10-OPERATIONS-AND-SUPPORT.md`, `GO-LIVE.md`, `PRODUCTION-READINESS.md`.

---

## 9. Testing

- **Unit:** `npm test` (Vitest, about 500 tests). Covers workflows end to end through the orchestrator, policies, auth, stores (Postgres via PGlite), reports, alerts, clients and router setup.
- **Server browser tests:** `npx playwright test -c playwright.server.config.ts`. Covers sign-in, handover, cross-device, pilot client, add a client, and black-camera and voice-only cases.
- **Static demo browser tests:** `npx playwright test`.
- **AI photo accuracy:** `photo-eval.yml` runs labelled real photos against the live model. See `AI-TRAINING.md`.
- **Tip in cloud containers:** set `NO_PROXY=127.0.0.1,localhost` so Playwright can reach the local test server.

---

## 10. Privacy and legal

- **Customer privacy notice:** shown on the first screen (the "Privacy notice" link expands it). It includes the client's retention days and support line. The master text is `legal/PRIVACY-NOTICE.md`. The notice version is recorded with each consent (`privacy-notice@3`).
- **Data protection impact assessment template:** `legal/DPIA.md`, for each client to adapt.
- **Sub-processors:** `legal/SUB-PROCESSORS.md`.
- **Roles:** the client is the controller; Absolute Intelligence UK Ltd is the processor. The company is ICO registered.
- **Security, privacy and retention design:** `06-SECURITY-PRIVACY-COMPLIANCE.md`.

---

## 11. Status

**Built and tested:**
- **Customer side:** camera-first customer app; voice in and out; voice-only and no-camera paths; never acting on unreadable pictures.
- **Flows and AI:** router troubleshooting (trained) and new router setup; workflow and policy engine with versioning and second-person approval.
- **People:** human handover with live video; agent console.
- **Clients:** client portal with results, pilot report and CSV; platform admin; **Add a client**; private-client staff sign-in.
- **Feedback and privacy:** customer rating; privacy notice in the product.
- **Integrations:** signed integration contract, plus a stand-in line test.
- **Operations:** text message and email links; Postgres storage; uptime, alerts, daily AI check and nightly backup; static demo site.

**Needs you (no code):**
1. Fix Render billing, or move to the free plan.
2. Add the 2 backup secrets on GitHub.
3. A UK text message number (Twilio) when real customers start.
4. Real router details for the client to train the AI.

**Next to build (in order):**
1. Boiler and home-damage flows to "published" quality, with photo tests.
2. A flow editor for steps without code (wording is already editable).
3. A monthly usage report per client for invoicing.
4. Company sign-in (Microsoft/Google) before a second real client.
5. Move to Frankfurt or the free plan when the server is back.

The full checklist is in `LAUNCH-PLAN.md`. The Google Sheet worksheet is regenerated from `worksheet/build_worksheet.py`.

---

## 12. Decisions log

| Date | Decision |
|---|---|
| 13 Nov 2026 | Managed SaaS with paid pilots; markets: telecom first, then energy, then appliances and insurers |
| 13 Nov 2026 | Stay on cheap hosting; free nightly backup instead of Supabase Pro until paying clients |
| 14 Nov 2026 | Home Telecom set up as the first pilot client (placeholder staff); company sign-in skipped for now |
| 14 Nov 2026 | Focus on building the full product first with demo data; Home Telecom and pricing later |
| 16 Nov 2026 | Frankfurt move not needed while building; free alternative is Render's free plan in Frankfurt |
| 16 Nov 2026 | Sales demo = the free static GitHub Pages site (separate from client data) |

---

## 13. Document map

| File | Topic |
|---|---|
| `01-PRD.md` … `12-DEFINITION-OF-DONE.md` | Original product, architecture, UX, data, AI, security, NFR, QA, roadmap, operations, commercial and release-gate specs |
| `LAUNCH-PLAN.md` | Phased launch checklist |
| `MARKET-RESEARCH.md` | Problem, numbers, competitors, market size, industries |
| `DEPLOYMENT.md`, `GO-LIVE.md`, `LAUNCH.md`, `PRODUCTION-READINESS.md` | Running it in production |
| `AI-TRAINING.md` | Training the AI on a client's equipment, photo tests |
| `INTEGRATION-CONTRACT.md` | How a client's systems connect (line test, cases, bookings) |
| `TEAM-TESTING.md`, `TESTER-GUIDE.md` | Guides for people testing it |
| `POSITIONING.md` | Messaging |
| `PROGRESS.md`, `IMPLEMENTATION-PLAN.md` | Build history |
| `legal/` | Privacy notice, data protection impact assessment, sub-processors |
| `worksheet/` | Generator for the Google Sheet worksheet |
