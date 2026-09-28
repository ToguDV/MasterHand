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

Development runs opencode, the BFF and a front end directly on your machine from source, using its **own** environment file — not the Docker one under `deploy/`. Each command below is self-contained: it starts everything the front end needs.

```bash
npm install
cp apps/server/.env.example apps/server/.env.local   # development secrets (git-ignored)

npm run dev:web       # opencode + BFF (:8787) + web (:5173)
npm run dev:desktop   # opencode + BFF + Electron shell
npm run dev:mobile    # opencode + BFF + Expo dev server
npm run dev:server    # opencode + BFF only

npm test              # tests (vitest: BFF + client-core)
npm run test:e2e      # E2E (Playwright + mocked opencode); run `npm run e2e:browsers` once
```

`scripts/dev.mjs` orchestrates the dev stack:

- loads `apps/server/.env.local` (shipped with `COOKIE_SECURE=false` and `OPENCODE_URL=http://127.0.0.1:4096`);
- starts `opencode serve` on the `OPENCODE_URL` host/port, **unless** it is already listening — so it will not fight a running instance; set `MASTERHAND_SKIP_OPENCODE=1` to always reuse an external one;
- starts the BFF (`:8787`) and the requested front end, and stops the whole group when any process exits or on `Ctrl+C`.

If `opencode` is not on your `PATH`, install it first (`npm install -g opencode-ai`, or see https://opencode.ai/docs/).

`apps/server/.env.local` is also loaded by `npm run dev:server`'s own `tsx --env-file-if-exists`; it is **not** used by Docker.

To try the web app from a phone on the same network: `npm run dev:web -- --host` and open `http://<your-PC-IP>:5173`. Extra arguments after `--` are forwarded to the front end.

## Deployment

Production runs the BFF and opencode as Docker Compose services and uses `deploy/.env`:

```bash
cp deploy/.env.example deploy/.env   # production secrets
docker compose -f deploy/docker-compose.yml up -d --build
```

Docker Compose reads `deploy/.env` and injects it into the containers; inside the network the BFF reaches opencode at `http://opencode:4096`, a hostname that does not exist in development. Then put your own reverse proxy / TLS in front of the published BFF port. See `docs/runbooks/deployment.md`.

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
