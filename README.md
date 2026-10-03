# Absolute Intelligence Visual Assist — Visual MVP

Phase 1 visual prototype of the Human + AI visual assistance platform. **Mock data only**: no external APIs, no keys, no real auth, no WebRTC.

## Run

```bash
npm install
npm run dev      # http://localhost:3000  → /login → "Continue with demo account"
npm run build    # production build
npm run lint     # type-check
```

## Routes
`/login` `/dashboard` `/live` `/sessions` `/sessions/[id]` `/clients` `/clients/[id]` `/agents` `/agents/[id]` `/workflows` `/workflows/[id]` `/policies` `/integrations` `/qa` `/analytics` `/costs` `/audit` `/health` `/settings` `/assist/demo` `/agent-console/demo`

Primary demo session: `/sessions/VA-27413`.

## Structure
- `src/lib/types` — domain types mirroring the spec's data model
- `src/lib/data` — all mock data (replace with API responses later)
- `src/lib/services` — hooks that UI uses to read data (swap for REST/WebSocket)
- `src/lib/store.ts` — local external store for demo state (takeover, notes, QA states, flags, client switcher)
- `src/components/ui` — design-system primitives; `visual` — procedural camera scenes; `layout` — shell
- `src/app/(admin)` — pages inside sidebar/top-bar shell; `assist`, `agent-console`, `login` are standalone
