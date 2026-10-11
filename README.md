# Absolute Intelligence Visual Assist

Enterprise Human + AI visual assistance platform by Absolute Intelligence UK. Customers open a secure browser session, talk to an AI and show the problem through their phone camera; the AI follows approved workflows, records confidence-rated observations, triggers controlled business actions and escalates to a human who joins the **same** interaction with full context.

- Product specification: [`docs/`](docs/00-README.md) (source of truth)
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

This is a POC environment: reasoning and business actions use **simulated providers** (clearly labelled in the UI) behind production interfaces, and the session runtime is in-memory. See the implementation plan for what is real, what is simulated and what comes next.

## Code map

- `lib/domain` — data model, labels, pricing
- `lib/session` — orchestrator (pure, deterministic), handover, role-scoped projections
- `lib/workflow`, `lib/policy` — workflow engine and deterministic policy checks
- `lib/config` — tenant configuration catalog and versioned workflows
- `lib/providers` — provider interfaces + simulated implementations
- `lib/server` — session runtime, SSE, seed history
- `components/assist`, `components/console`, `components/platform` — the three experiences
