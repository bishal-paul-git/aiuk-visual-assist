# Absolute Intelligence Visual Assist

Enterprise Human + AI visual assistance platform by Absolute Intelligence UK. Customers open a secure browser session, talk to an AI and show the problem through their phone camera; the AI follows approved workflows, records confidence-rated observations, triggers controlled business actions and escalates to a human who joins the **same** interaction with full context.

**Live demo:** https://bishal-paul-git.github.io/aiuk-visual-assist/ (runs in the browser with simulated AI and sample data; works on phones; the assistant speaks with a British ElevenLabs voice). Start with **Watch a 2-minute session**, or open `/demo/` to pick a scenario.

- Product specification: [`docs/`](docs/00-README.md) (source of truth)
- Deploying the full server edition: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Connecting business actions to a client's systems: [`docs/INTEGRATION-CONTRACT.md`](docs/INTEGRATION-CONTRACT.md) (reference client API: `scripts/reference-client-api.mjs`)
- Gap analysis, status and phased plan: [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md)

## Experiences

| Route | Experience |
|---|---|
| `/assist/<token>` | Customer Visual Assistance (mobile-first) |
| `/console` | Human Agent Console — live queue and session workspace |
| `/platform` | AIUK Management Platform — 16 modules |

## Run

```bash
npm install
npm run dev      # http://localhost:3000 → "Start test session"
npm test         # domain, policy, workflow and end-to-end orchestrator tests
npm run typecheck && npm run lint
```

## Two editions

| Edition | Build | Where | Notes |
|---|---|---|---|
| **Server** | `npm run build` | Any Node host | Full product: API routes, SSE, cross-device sessions (phone ↔ console), optional live AI with `ANTHROPIC_API_KEY`. |
| **Static demo** | `npm run build:static` | **GitHub Pages** (`.github/workflows/deploy-pages.yml`) | The session runtime runs in the browser. Tabs on one device stay in sync; separate devices can't share a session. Platform reports are a build-time snapshot; workflow editing is read-only. Start at `/demo` for the phone + console side by side. |

To publish the static demo: **Settings → Pages → Build and deployment → Source: GitHub Actions**, then merge to `main` (or run the "Deploy static demo to GitHub Pages" workflow). It is served at `https://<owner>.github.io/<repo>/`.

This is a POC environment: reasoning and business actions use **simulated providers** (clearly labelled in the UI) behind production interfaces, and the session runtime is in-memory. See the implementation plan for what is real, what is simulated and what comes next.

## Code map

- `lib/domain` — data model, labels, pricing
- `lib/session` — orchestrator (pure, deterministic), handover, role-scoped projections
- `lib/workflow`, `lib/policy` — workflow engine and deterministic policy checks
- `lib/config` — tenant configuration catalog and versioned workflows
- `lib/providers` — provider interfaces + simulated implementations
- `lib/server` — session runtime, SSE, seed history
- `components/assist`, `components/console`, `components/platform` — the three experiences
