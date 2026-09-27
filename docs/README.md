# MasterHand documentation

Index of specific documentation (APIs, runbooks, decisions). High-level documentation lives at the repository root: `SPEC.md`, `ARCHITECTURE.md`, `PROGRESS.md`.

## Rules

1. Every new document in this folder is indexed here.
2. APIs are documented **verified** (against the server OpenAPI at `/doc` or `types.generated.ts`), never from memory.
3. Include a verification date in every API document.

## Index

| Document | Content | Status |
|---|---|---|
| [`opencode/events.md`](opencode/events.md) | opencode SSE event types (verified) and which ones MasterHand consumes | ✅ 2026-09-27 |
| [`opencode/http-api.md`](opencode/http-api.md) | opencode HTTP endpoints relevant to MasterHand | ✅ 2026-09-27 |
| [`bff/api.md`](bff/api.md) | MasterHand BFF API (auth, proxy, SSE relay) | ✅ 2026-09-27 |
| [`runbooks/deployment.md`](runbooks/deployment.md) | Deployment with Docker Compose and TLS options for the deployer | ✅ 2026-09-27 |
| `runbooks/host-setup.md` | Host preparation: Docker, DNS, user and firewall | ⬜ Phase 0 |
| `runbooks/backups.md` | Volume backups (sessions, config, devices) and restore | ⬜ Phase 5 |
