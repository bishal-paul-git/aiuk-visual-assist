# Launch plan: managed SaaS, starting with paid pilots

Decided (13 Nov 2026):
- **Model:** managed SaaS. One platform; we onboard each client company (own space, brand, staff logins, rules). Setup fee + monthly fee. Self-serve sign-up comes later.
- **Route to market:** paid pilot (60–90 days) → yearly contract.
- **Markets:** broadband/telecom first (AI trained and tested), then energy (boiler flow exists) and home appliances / insurers (home-damage flow exists).
- **Company:** UK Ltd, ICO registered. First pilot: **Home Telecom** (TAL group, see `MARKET-RESEARCH.md`).
- **First use case:** "My internet is down", then "setting up a new router".
- **Hosting:** stay on Render Starter ($7) but move to Frankfurt; free nightly backup instead of paid Supabase Pro until there are paying clients.
- **Staff sign-in (Microsoft/Google):** skipped for now; pilot staff use the platform's own sign-in with the staff password.

Owner key: **You** = you do it · **Build** = Claude builds it · **Both** = you decide, Claude builds.

---

## Phase 0 — Discovery with Home Telecom (1–2 weeks, before building more)

- [ ] **You** — Meeting with Home Telecom's customer service lead. Ask the 7 questions in `MARKET-RESEARCH.md` §8 (contacts per month, call length and cost, engineer visits and no-fault rate, router models, top faults, systems, who approves).
- [ ] **You** — Ask to listen to 5–10 recorded "internet down" calls, or sit with an agent for an hour. This shows the real process.
- [ ] **Both** — Agree the success measures and the baseline (their numbers today) in writing.
- [ ] **Both** — Decide how customers get the link (agent texts it during the call, or it appears in their app/website). Only after seeing their process.
- [ ] **Build** — A one-page value calculator from their numbers (calls saved, visits saved, £ per month).
- [ ] **You** — Ask whether the other TAL group brands could join if the pilot works.

## Phase 1 — Ready for the first pilot (target: 2–3 weeks)

### Platform and hosting
- [ ] **You** — Choose the web address (e.g. `assist.yourcompany.co.uk`) and add one DNS record. **Build** sets it up on Render.
- [ ] **Both** — Move the server to Frankfurt on the same Starter plan ($7/month, no extra cost). **You** copy the secret settings; **Build** checks everything still works.
- [ ] **Build** — Free nightly database backup (GitHub job, encrypted). Supabase Pro ($25/month) later, once paid.
- [ ] Later — Standard server ($25/month) only if monitoring shows the pilot is busy.
- [x] Uptime check every 15 minutes, full AI check every morning (done).
- [ ] **Build** — Error alerts by email when the AI, voice or database fails for a real customer.

### Sign-in and access
- [ ] Skipped for now — Microsoft/Google staff sign-in (`LAUNCH.md` §1). Revisit before a second client.
- [ ] **Build** — Staff accounts for Home Telecom's pilot agents with the platform's own sign-in.
- [ ] **Both** — Switch off the trial login and demo accounts on the live server (`TRIAL_LOGIN_ENABLED=0`).
- [ ] **Build** — Keep the public demo separate (its own address with the trial login), so sales demos never touch client data.

### Client onboarding (the pilot company)
- [ ] **Build** — "Add a client" screen in the admin portal: name, brand, flows, retention, staff. Today clients are added in code.
- [ ] **You** — Get the pilot company's logo, colour, assistant name and support phone number. **Build** sets them up.
- [ ] **You** — Get Home Telecom's router models (per network: Openreach, CityFibre, Virgin Media), light patterns and top 10 faults. **Build** trains the AI on them and re-runs the photo test.
- [ ] **Both** — Line test: the pilot company's API details, or keep the "no fault" stand-in for the pilot.

### Legal and data (needed before real customers)
- [ ] **You** — Pilot agreement: scope, price, dates, success measures, either side can stop.
- [ ] **You** — Data Processing Agreement with the pilot company (they are the controller, we are the processor).
- [ ] **Build** drafts, **you** check — Privacy notice for end customers (shown before the camera starts).
- [ ] **Build** drafts, **you** check — DPIA (data protection impact assessment) template the client can reuse.
- [ ] **You** — Sub-processor list and their DPAs: Anthropic (AI), ElevenLabs (voice), Render (server), Supabase (database), Twilio (texts). Anthropic processes data in the US, so add the UK international data transfer addendum.
- [ ] **Both** — Retention for the pilot: e.g. photos 30 days, transcripts 90 days (already supported, just set it).

### Final checks
- [ ] **You** — Test on a real iPhone and Android phone, and send me the VA reference.
- [ ] **You** — Clear test data (Admin → Settings → Reset test data).
- [ ] **Both** — Run a 1-hour session with 2–3 of the pilot company's agents before customers see it.

---

## Phase 2 — Run the pilot (60–90 days)

- [ ] **Both** — Agree success measures up front, e.g. % of calls fixed without an engineer visit, average handling time, customer rating, engineer visits avoided.
- [ ] **Build** — Pilot report page: sessions, resolved by AI, handed to a person, outcomes, cost, exportable as PDF/CSV for the client.
- [ ] **Build** — Customer rating at the end (thumbs up/down + optional comment).
- [ ] **You** — Weekly 30-minute review with the pilot company. **Build** fixes what comes up.
- [ ] **Build** — Re-train the AI monthly using real (consented) pilot photos, and re-run the accuracy test.
- [ ] **You** — Support: a support email and agreed response times (e.g. same working day).

---

## Phase 3 — Sell to more companies (from month 2)

### Sales material
- [ ] **Build** — Website page: what it does, a 60-second demo video, "Book a demo".
- [ ] **Build** — Pitch deck and one-page pricing sheet.
- [ ] **You** — Case study from the pilot (numbers + a quote).
- [ ] **You** — Security pack buyers will ask for: Cyber Essentials certificate (about £300), security answers sheet, sub-processor list. A pen test (about £3–6k) when the first big client asks.

### New markets
- [ ] **Build** — Energy: finish the boiler flow, add smart meter and EV charger checks, photo-test each.
- [ ] **Build** — Appliances / insurers: finish the home-damage evidence flow (claims photos), add a washing machine / dishwasher fault flow.
- [ ] **Build** — Flow editor in the admin portal so new flows and AI notes don't need code.

### Billing and contracts
- [ ] **Build** — Monthly usage report per client (sessions, minutes, handovers) for invoicing.
- [ ] **You** — Standard contract set: Master Services Agreement, DPA, Service Level Agreement (e.g. 99.5% uptime).
- [ ] Later — Card billing (Stripe) only if we move to self-serve.

---

## Starting price (to test with the pilot, not fixed)

Running cost per session today: about 3–5p of AI and voice, plus hosting.

| | Pilot (90 days) | Standard (yearly) |
|---|---|---|
| Setup | £1,500 | £5,000–£10,000 (brand, flows, AI training, integration) |
| Platform | £750 / month | £1,500–£3,000 / month (includes a session allowance) |
| Usage | included up to 1,000 sessions | £0.75–£1.50 per session above the allowance |

The value case: one avoided engineer visit is worth £60–£120 to a telecom, so a few visits avoided a day pays for the platform.
