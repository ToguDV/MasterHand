# MasterHand

Self-hosted server to use your [opencode](https://opencode.ai) agents from any device — web, desktop and mobile. Open source, single-user across multiple devices.

> Status: Phase 3 completed (BFF + web + Electron + React Native). Next: public release polish and real-device testing. See `PROGRESS.md`.

## How it works

```
Web / Desktop (Electron) / Mobile (React Native)
        → your reverse proxy + TLS (Caddy, Nginx, Traefik, tunnel, ...)
        → MasterHand BFF
        → opencode serve
        → your agents
```

The BFF is the only bridge: clients never talk to opencode directly. TLS is left to whoever deploys the instance.

## Quick start (development)

```bash
npm install
npm run dev:server    # BFF on :8787
npm run dev:web       # web app on :5173 (proxies /api)
npm run dev:desktop   # Electron shell pointing at MASTERHAND_URL (:8787 by default)
npm run dev:mobile    # Expo dev server for iOS/Android
npm test              # tests (vitest: BFF + client-core)
npm run test:e2e      # E2E (Playwright + mocked opencode); run `npm run e2e:browsers` once
```

To try the web app from a phone on the same network: `npm run dev:web -- --host` and open `http://<your-PC-IP>:5173`. Locally, start the BFF with `COOKIE_SECURE=false` and point `OPENCODE_URL` at your `opencode serve` (default `http://127.0.0.1:4096`).

## Deployment

The stack runs with Docker Compose:

```bash
cp deploy/.env.example deploy/.env   # fill in secrets
docker compose -f deploy/docker-compose.yml up -d --build
```

Then put your own reverse proxy / TLS in front of the published BFF port. See `docs/runbooks/deployment.md`.

## Stack

- **Web:** React 19 + Vite + TypeScript + Tailwind
- **Desktop:** Electron (loads the BFF-served web app; `MASTERHAND_URL`)
- **Mobile:** React Native + Expo
- **Shared:** `packages/client-core` (API client, query hooks, SSE, auth adapters)
- **BFF:** Node 22 + Hono (auth, proxy, SSE relay)
- **Engine:** `opencode serve` (pinned version)
- **Deploy:** Docker Compose (TLS provided by the deployer)

## Documentation

| Document | Content |
|---|---|
| `SPEC.md` | Vision, scope and requirements |
| `ARCHITECTURE.md` | Architecture, flows and decisions |
| `PROGRESS.md` | Status and changelog |
| `WORKFLOW.md` | Branch, test and PR workflow |
| `docs/` | Verified APIs and runbooks |
| `CONTRIBUTING.md` | Conventions and contribution guide |
| `AGENTS.md` | Guide for AI agents |

## License

MIT — see `LICENSE`.
