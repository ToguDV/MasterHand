# WORKFLOW — MasterHand

How we develop, test and merge. Commit format details live in `CONTRIBUTING.md`.

## Principles

1. **One feature per branch and per PR.** No unrelated changes mixed in.
2. **Tests are part of the feature**, not a follow-up: unit tests for logic, end-to-end tests for user flows.
3. **Nothing is committed or merged while a gate is red.** `main` is always green.
4. **Squash merge** into `main`: one clean commit per feature.

## Branch model

- `main` is protected: no direct pushes, only pull requests.
- Branch names use the same prefixes as Conventional Commits:
  - `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `refactor/<slug>`, `test/<slug>`, `chore/<slug>`.
- Keep branches short-lived: branch → tests green → PR → squash → delete.

## Local loop

```bash
git switch -c feat/my-feature
# implement the feature and its tests
npm test              # unit (fast feedback)
npm run test:e2e      # end-to-end
git add -A
git commit -m "feat(web): add my feature"   # pre-commit + commit-msg hooks run
git push                                    # pre-push hook runs the full gate
# open the PR using the template
```

## Gates

| Gate | Runs | Purpose |
|---|---|---|
| `pre-commit` (`.githooks/pre-commit`) | `npm run typecheck` + `npm test` | Fast: never commit broken types or failing unit tests |
| `commit-msg` (`.githooks/commit-msg`) | Conventional Commits check | Keep an English, standard history |
| `pre-push` (`.githooks/pre-push`) | typecheck + unit + E2E + builds | Full local mirror of CI before sharing the branch |
| GitHub Actions (`.github/workflows/ci.yml`) | typecheck + unit + E2E + build | Required check on every PR to `main` |

Emergency bypass (use sparingly, never for `main`): `MASTERHAND_SKIP_HOOKS=1 git commit ...`.

## Setup (once per clone)

```bash
npm install              # the `prepare` script runs `git config core.hooksPath .githooks`
npm run e2e:browsers     # downloads the Chromium used by Playwright
```

## Unit tests

- Locations: `apps/server/test` and `packages/client-core/test` (vitest).
- Run all: `npm test`. Watch a workspace: `npm run test:watch -w @masterhand/server`.

## End-to-end tests

- Workspace `e2e/`, built with [Playwright](https://playwright.dev).
- Harness: `e2e/mock-opencode.ts` (fake `opencode serve`) + the real BFF serving the built web app, driven in a browser.
- Ports: mock `4097`, BFF `8788` (no conflict with a local `npm run dev`).
- Run: `npm run test:e2e`. Debug interactively: `npm run test:e2e -w @masterhand/e2e -- --ui`.
- Coverage today: invalid login and the full flow login → new session → prompt → live stream → permission approval.
- Add one spec under `e2e/tests/` per user-facing flow.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`: install, typecheck, unit, E2E and build. E2E artifacts are uploaded on failure. A red check blocks the merge.

## Pull requests

- Use the title for the final commit; it must follow Conventional Commits (squash merge reuses it).
- Fill `.github/pull_request_template.md`:
  - **What & why** — the single feature and its motivation.
  - **Changelog** — bullet list of changes.
  - **How to review** — exact steps the developer follows to approve.
  - **Checklist** — the gates above plus docs/PROGRESS updates.
- Merge with **Squash and merge** and delete the branch.

## Definition of done

- [ ] One feature, no unrelated changes.
- [ ] Unit tests cover the new logic; E2E covers the user flow.
- [ ] `npm run typecheck`, `npm test`, `npm run test:e2e` and `npm run build` pass.
- [ ] `PROGRESS.md` and the affected docs are updated.
- [ ] PR approved and squash-merged into `main`.
