# Runbook — Mobile E2E (Maestro)

How to drive the Expo app (`apps/mobile`) end to end on an Android emulator or an
iOS simulator with [Maestro](https://maestro.mobile.dev), and how it runs in CI.

The flows live in `apps/mobile/.maestro/` and talk to the **mock opencode + real
BFF** harness (the same two processes the web Playwright suite uses,
`e2e/mock-opencode.ts` and `apps/server/src/index.ts`). The app is loaded in
**Expo Go** — the project is managed, so no native build (`expo prebuild`/Gradle)
is required.

> [Maestro](https://maestro.mobile.dev) is an external CLI (Java-based). Install
> it once with `curl -Ls "https://get.maestro.mobile.dev" | bash` and make sure
> `~/.maestro/bin` is on `PATH`.

## 1. What it covers

`apps/mobile/.maestro/chat.yaml` exercises the parts a browser E2E cannot reach:

- the app mounts after login without the native-only crash fixed on 2026-10-01;
- the native modals (`Modal`) and the keyboard-aware `Screen` shell;
- login through the BFF device flow and SSE streaming;
- a permission request and its approval.

## 2. Local run (Android emulator)

Prerequisites: JDK 17+, the Android SDK (`adb`, `emulator`) and an AVD. You can
launch one with `emulator -avd <name>`.

From the repository root:

```bash
# 1. Mock opencode (port 4097) and the BFF (port 8788) on a clean data dir.
MOCK_PORT=4097 npx tsx e2e/mock-opencode.ts &
PORT=8788 OPENCODE_URL=http://127.0.0.1:4097 \
  MASTERHAND_PASSWORD=e2e-password SESSION_SECRET=e2e-secret COOKIE_SECURE=false \
  DATA_DIR=/tmp/masterhand-e2e WORKSPACES_ROOT=/tmp/masterhand-e2e-workspace \
  PREVIEW_ENABLED=false npx tsx apps/server/src/index.ts &

# 2. Metro, bound to localhost so `adb reverse` can reach it.
(cd apps/mobile && npx expo start --port 8081 --localhost) &

# 3. Bridge the emulator's loopback to the host, then install/launch Expo Go
#    (the flow's `openLink` loads the app). Grab the current Expo Go APK from
#    https://expo.dev/go or install it from the Play Store once.
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8788 tcp:8788

# 4. Run the flow.
maestro test apps/mobile/.maestro/chat.yaml \
  -e MAESTRO_APP_URL=exp://127.0.0.1:8081 \
  -e MASTERHAND_URL=http://127.0.0.1:8788 \
  -e MASTERHAND_PASSWORD=e2e-password
```

Use a **clean `DATA_DIR`** so the harness starts without workspaces: the flow
creates one through the UI. Reusing a populated `DATA_DIR` leaves an existing
workspace selected and the `Add a workspace` step will not find its target.

Iterate on selectors with `maestro studio` (a live inspector against the running
emulator): the flows target `testID`s (`server-url-input`, `password-input`,
`new-session-button`, `workspace-name-input`, `composer-input`) and visible text
(`Sign in`, `Sessions`, `Add workspace`, `Send`, `Permission required`, `Done!`).
When you add an assertion, prefer a `testID` over text.

## 3. iOS (macOS only)

Same steps, but instead of `adb reverse` use the Metro URL the simulator can
reach directly (`exp://127.0.0.1:8081`), and install Expo Go on the simulator
(`xcrun simctl` or the Expo CLI). Maestro drives the iOS simulator natively — no
extra config.

## 4. CI

`.github/workflows/mobile-e2e.yml` runs the same flow on the GitHub
`ubuntu-latest` runner with `reactivecircus/android-emulator-runner@v2`
(hardware acceleration / KVM is available there). It starts the mock + BFF and
Metro, bridges the ports with `adb reverse`, installs the Expo Go APK from
`https://api.expo.dev/v2/versions/latest` and runs Maestro. Logs and Maestro
screenshots are uploaded on failure.

It is **manual-only (`workflow_dispatch`)** on purpose: it boots an emulator and
downloads a system image / Expo Go, which is slow and can be flaky. Trigger it
with:

```bash
gh workflow run mobile-e2e.yml
```

Once a green run is confirmed, wire the job to `pull_request` (optionally caching
the Expo Go APK) so it becomes part of the normal gate.

## 5. Failure triage

| Symptom | Likely cause |
|---|---|
| `openLink` opens Expo Go's home | Metro is not reachable from the device — check `adb reverse tcp:8081 tcp:8081` and that Metro bound to `localhost` |
| Stuck on the login screen | Wrong `MASTERHAND_URL`/`MASTERHAND_PASSWORD`, or the BFF is not healthy (`curl http://127.0.0.1:8788/api/health`) |
| `Add a workspace` not found | The `DATA_DIR` already has a workspace selected; use a clean `DATA_DIR` |
| Element not found | A selector drifted — reopen with `maestro studio` and update the flow |
