# Go live for real testing
## Absolute Intelligence Visual Assist: server edition

This is the step-by-step guide to turning the public prototype into a real, testable product: real AI reading real photos, a phone and a laptop in the same session, live video, SMS links and one real business action. Each step says what to set up, where to put the settings, and how to check it worked.

**Rule for every key and password:** put it in the hosting provider's settings screen (Render → your service → *Environment*). Never put it in chat, email, documents or the code.

---

## Step 1 — Put the server on Render (about 30 minutes)

1. Create an account at render.com and connect your GitHub account.
2. **New → Blueprint**, pick the `aiuk-visual-assist` repository. Render reads `render.yaml`. It creates one web service (Docker) with a 1 GB disk at `/data` for saved sessions, and generates `AUTH_SECRET` and `METRICS_TOKEN` itself. It also starts without the generated sample sessions (`SEED_SAMPLE_SESSIONS=0`), so everything you see there is real.
3. When Render asks for the values marked *sync: false*, you can leave them empty for now. Steps 1b to 6 fill them in.
4. Wait for the first deploy, then open the service's address, for example `https://visual-assist.onrender.com`.
5. In *Environment*, set `PUBLIC_BASE_URL` to that exact `https://` address and save; Render redeploys.

**Check it:** on any computer with the repository, run

```bash
npm run check:deployment -- https://visual-assist.onrender.com
```

It prints one line per area: OK, TODO (not switched on yet) or FAIL. After this step, Server, Health, Storage, Pages and Access control should be OK.

> A company address such as `assist.absoluteintelligence.co.uk` is optional. Add it in Render → *Settings → Custom domains*, follow the DNS instructions, then change `PUBLIC_BASE_URL` to it.

---

## Step 1b — Database: Supabase (15 minutes)

Saves sessions, photos, workflow changes and QA reviews to a managed database instead of the Render disk. Supabase is only the database; the app stays on Render.

1. Create a project at supabase.com. **Region: London (`eu-west-2`)**, so the data stays in the UK. Choose a strong database password and keep it in your password manager.
2. In the project, click **Connect** and copy the **Session pooler** connection string. Use this one: it works over IPv4, and Render has no IPv6 by default. Replace `[YOUR-PASSWORD]` in it with the database password (if the password contains characters such as `@`, `#`, `/` or `%`, URL-encode them, or pick a password of letters and digits).
3. In Render → your service → *Environment*, add `DATABASE_URL` with that string and save. Render redeploys. The server creates its tables on first start, in a separate `visual_assist` schema that Supabase's public API cannot reach.
4. **Check it:** open `https://<your address>/api/health`. It should show `"kind": "postgres"` and `"durable": true` under `store`, and the location shows only the host and database name, never the password. `npm run check:deployment -- <address>` reports Storage as "saved to the database (postgres)".

With `DATABASE_URL` set, the Render disk (`DATA_DIR=/data`) is no longer used. `render.yaml` keeps the disk for now, so you can switch back by removing `DATABASE_URL`. Sessions already on the disk are not copied to the database.

---

## Step 2 — Real AI: Claude (10 minutes)

1. Create an API key at console.anthropic.com (Settings → API keys). Add billing and a monthly spend limit.
2. In Render: `ANTHROPIC_API_KEY` = the key.
3. Optional:
   - `VISUAL_ASSIST_MODEL`: defaults to `claude-opus-5-5`.
   - `VISUAL_ASSIST_MODEL_TIMEOUT_MS`: default 20000.
   - `VISUAL_ASSIST_MODEL_MAX_RETRIES`: default 1.

   A call that still fails escalates the customer to a human.

**Check it:** the check shows `AI (Claude)` OK. In the Agent Console press **Start test session** and choose **Live AI** (not a scenario).

**Measure accuracy before showing anyone:** take 30–50 photos of a real router and run them through Claude. See `eval/router-photos/README.md`.

---

## Step 3 — Voice and speech recognition: ElevenLabs (10 minutes)

1. Create an account at elevenlabs.io and copy an API key with Text to Speech and Speech to Text access.
2. In Render: `ELEVENLABS_API_KEY` = the key. `STT_PROVIDER` is already `elevenlabs`.

   To use Deepgram for speech recognition instead, set `STT_PROVIDER=deepgram` and `DEEPGRAM_API_KEY`.

**Check it:** the check shows `Voice` and `Speech recognition` OK. On an iPhone, the customer can now speak instead of typing.

---

## Step 4 — SMS links and live video: Twilio (30 minutes, plus sender approval)

One Twilio account covers both.

1. Create an account at twilio.com and upgrade it from trial, so messages reach any number.
2. Get a UK sender:
   - a UK mobile number, or
   - an alphanumeric sender ID such as `AIUK`. This one-way sender may need registration, which can take a few days, so start early.
3. In Render:
   - `TWILIO_ACCOUNT_SID` = Account SID
   - `TWILIO_AUTH_TOKEN` = Auth Token
   - `TWILIO_FROM` = the number in `+44…` format, or the sender ID / Messaging Service SID (`MG…`)
   - `TURN_PROVIDER` is already `twilio`. The server fetches fresh live-video relay credentials from the same account (Network Traversal Service) and renews them before they expire.

**Check it:** the check shows `SMS links` and `Live video` OK. Start a test session, enter your mobile number, and the link should arrive by text.

> Instead of Twilio's relay you can run your own coturn server and put it in `ICE_SERVERS` (see `docs/PRODUCTION-READINESS.md`). Remove `TURN_PROVIDER` in that case.

---

## Step 5 — Business actions (5 minutes, in the platform)

No Render settings are needed. Sign in as a platform administrator (James Carter) or the client's administrator (Priya Shah for Northline), open **Platform → Integrations** and choose one option for each tool:

- **Built-in.** Recommended to start with. Visual Assist keeps the record itself and creates a real reference: ticket `TK-…`, case `CS-…`, engineer job `JOB-…` and so on. Nothing outside the platform is needed. Select the tools, choose *Built-in* and press **Save**.
- **Client API or n8n.** The action goes to an HTTPS endpoint. Paste the URL and the shared secret once, tick *Send the secret as X-VA-Secret* for n8n, and press **Save**. The n8n workflow for Northline already exists: URL `https://n8n.automationworkflows.io/webhook/visual-assist/actions`, with its secret in the settings file you were given (see `integrations/n8n/README.md`).
- **Sandbox.** Pretend results, for demos.

Then press **Test** on each tool, or **Test all**. Each test makes one real call and shows the result, the time it took and the reference, or a plain-English reason if it fails.

`line_test` has no built-in option, because it needs the client's network diagnostics. Until a client API or n8n is connected, it stays on the sandbox and the console labels its result accordingly.

**Check it:** `/api/capabilities` lists the connected tools with their mode. After a Live AI session, **Platform → Integrations → Recent real business actions** shows each record with its reference and a link to the session.

`INTEGRATIONS_CONFIG` still works and overrides the page. Tools set that way appear as locked.

---

## Step 6 — Real-device test (half a day)

Use one iPhone (Safari), one Android phone (Chrome) and a laptop. Test each phone on Wi-Fi and again on 4G/5G with Wi-Fi off.

1. Laptop: sign in as an agent (Sarah Jennings), open the Agent Console, **Start test session**, choose **Live AI**, and enter the phone's number.
2. Phone: open the SMS link → **Agree and continue** → **Turn on camera** → speak: "My broadband isn't working".
3. Show the real router when asked, try a blurry or far-away photo once, and check the AI asks again.
4. Follow the steps until the line test runs (check n8n), or press **Human help**.
5. Laptop: press **Turn on alerts** first; when the alert sounds, **Join session** (you are in charge at once). Check you can see and hear the customer live, then talk, run an action and **End**.

Write down for each run: phone, network, whether each step worked, and how long the AI took to answer.

---

## Step 7 — Before showing Keith

- Run 20–50 sessions, then open **Platform → Costs** and **Platform → Analytics**. `render.yaml` sets `SEED_SAMPLE_SESSIONS=0`, so this server starts empty and its reports contain only your real sessions.
- Put the accuracy result from Step 2 and the device results from Step 6 on one page.
- Keep the public GitHub Pages demo for walkthroughs; use the Render address for real tests.

---

## Settings summary

| Setting | From | Needed for |
|---|---|---|
| `PUBLIC_BASE_URL` | Your Render (or custom) address | Links in SMS |
| `DATABASE_URL` | Supabase → Connect → Session pooler | Saving to the database (Step 1b) |
| `ANTHROPIC_API_KEY` | Anthropic console | Real AI |
| `ELEVENLABS_API_KEY` (+ `STT_PROVIDER=elevenlabs`) | ElevenLabs | Voice and iPhone speech |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (+ `TURN_PROVIDER=twilio`) | Twilio | SMS links and live video on mobile data |
| `TRIAL_LOGIN_EMAIL`, `TRIAL_LOGIN_PASSWORD`, `TRIAL_PREFILL`, `TRIAL_MAX_SESSIONS_PER_DAY` | You choose | The client trial login and its daily limit (all optional, see `docs/TEAM-TESTING.md`) |
| `STAFF_SIGNIN_PASSWORD` | You choose (8+ characters) | Password for the staff person-picker, recommended before sharing the address widely |
| *(none: Platform → Integrations)* | Built-in, n8n or a client API | Real business actions (`INTEGRATIONS_CONFIG` is optional and overrides the page) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | Email links (optional) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Microsoft Entra ID / Okta | Company sign-in (before a client pilot) |

Full reference: `docs/PRODUCTION-READINESS.md` §2. Every switch can be checked at any time with `npm run check:deployment -- <address>`.

## What this still is not

One server, saved to one disk or one database, with turn-based voice. That's right for internal and pilot testing, but not for real customer volumes. Production needs more than one server, streaming voice and the hardening in the checklist in `docs/PRODUCTION-READINESS.md` §6.
