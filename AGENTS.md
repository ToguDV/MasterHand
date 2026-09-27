# MasterHand — Project guide for agents

**What it is:** a self-hosted server that exposes your [opencode](https://opencode.ai) agents across web, desktop (Electron) and mobile (React Native). Open source, single-user across multiple devices — not multi-user. TLS is provided by whoever deploys it.

**Current status:** Phase 3 completed (`client-core` + web/desktop/mobile clients, device tokens). Next: Phase 4 (public release polish) and real-device verification. See `PROGRESS.md`.

## Documentation map

| Document | Content | When to update |
|---|---|---|
| `SPEC.md` | High-level spec: vision, scope, functional and non-functional requirements | When scope or requirements change |
| `ARCHITECTURE.md` | Architecture: components, flows, stack, security, decisions | When design or stack changes |
| `PROGRESS.md` | Status: done, in progress, pending, changelog | **When each task finishes** |
| `WORKFLOW.md` | Branch/test gates, PR and merge workflow | When the workflow changes |
| `CONTRIBUTING.md` | Commit/message conventions and contribution flow | When conventions change |
| `docs/README.md` | Index of specific documentation | When adding a new document |
| `docs/opencode/` | Verified reference for opencode's API (SSE events, HTTP endpoints) | When integrating/verifying APIs |
| `docs/bff/` | MasterHand backend API (endpoints, auth, proxy) | When the BFF changes |
| `docs/runbooks/` | Operational procedures: host, deploy, TLS, backups | When operating or deploying |

### Maintenance rules

1. Every finished task is reflected in `PROGRESS.md` (status + dated changelog entry).
2. Every new document is indexed in `docs/README.md` and in the table above.
3. Relevant technical decisions are recorded in `ARCHITECTURE.md` (Decisions section).
4. Do not document APIs "from memory": verify against the server OpenAPI (`/doc`) or `types.generated.ts`.
5. Before finishing a task, run the gates (`npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`) and follow `WORKFLOW.md`.

## Repository layout (target)

```
MasterHand/
├── apps/
│   ├── server/       # BFF: Node 22 + Hono (auth, proxy, SSE relay)
│   ├── web/          # Web: React 19 + Vite + TypeScript + Tailwind
│   ├── desktop/      # Desktop: Electron (wraps the web build)
│   └── mobile/       # Mobile: React Native + Expo
├── packages/
│   └── client-core/  # Shared API client, query hooks, SSE, auth adapters, types
├── deploy/           # docker-compose.yml, Dockerfiles, .env.example
├── docs/             # Specific documentation (APIs, runbooks, decisions)
├── README.md
├── AGENTS.md
├── CONTRIBUTING.md
├── LICENSE
├── SPEC.md
├── ARCHITECTURE.md
└── PROGRESS.md
```

## Commands

```bash
npm install            # install the whole monorepo (npm workspaces)

npm run dev:server     # BFF in development (:8787, tsx watch)
npm run dev:web        # web app in development (:5173, proxies /api → :8787)
npm run dev:desktop    # Electron shell (MASTERHAND_URL, default http://localhost:8787)
npm run dev:mobile     # Expo dev server for iOS/Android

npm run typecheck      # tsc across all workspaces
npm test               # vitest (server + client-core)
npm run test:e2e       # Playwright E2E (mocked opencode + BFF); npm run e2e:browsers once
npm run build          # production build (server + web + desktop)

# Deployment (host with Docker):
cp deploy/.env.example deploy/.env   # fill in secrets
docker compose -f deploy/docker-compose.yml up -d --build
```

## Conventions

- Strict TypeScript across the monorepo.
- **Everything in English**: documentation, code comments, commit messages, identifiers.
- **Conventional Commits** in English (e.g. `feat(web): add model selector`, `fix(server): handle expired token`). See `CONTRIBUTING.md`.
- **Mobile-first**: every UI is tested in a mobile viewport first.
- Clients **never** talk to `opencode serve` directly: everything goes through the BFF (see `ARCHITECTURE.md`).
- Never commit secrets or API keys; use `.env` (git-ignored).
- The opencode password (`OPENCODE_SERVER_PASSWORD`) lives only in the deploy host's `.env`, never in client code.

## External references

- opencode server: https://opencode.ai/docs/server/
- opencode SDK: https://opencode.ai/docs/sdk/
- opencode web: https://opencode.ai/docs/web/
- Types/events (source of truth): https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts
- OpenChamber (functional reference, MIT): https://github.com/openchamber/openchamber
