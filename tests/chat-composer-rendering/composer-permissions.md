### Feature: Composer review mode and access permissions

#### Prerequisites

- Build this checkout and use Codex CLI/app-server 0.153.4 (the verified protocol version).
- Open a disposable thread in an isolated test CODEX_HOME.
- Unselected “Permissions” keeps the session settings; selection applies to the next turn.

#### Steps

1. Open the permission menu beside Model, Skills and Thinking on both new-chat and existing-thread screens.
2. Select each of Read only, Default permissions, Auto-review and Full access.
3. Send a turn; inspect its `turn/start` request. Switch back from Full access to Default permissions, and from Auto-review to Read only.
4. Switch threads and reload. Verify choices stay with their original thread; a new thread receives the choice made on the new-chat screen.
5. Queue a message, reload, and let the backend drain it. Verify the stored `permissionMode` is used. Exercise a model fallback retry.
6. While a turn runs, confirm the permission control is disabled. After completion it becomes available.
7. Check light and dark themes at 1440×1000, keyboard Tab/Enter/Escape, outside-click dismissal and menu bounds.

#### Expected Results

- Read only: `readOnly`, network disabled, `on-request`, reviewer `user`.
- Default permissions: `workspaceWrite`, network disabled, `on-request`, reviewer `user`.
- Auto-review: same workspace boundary, reviewer `auto_review`.
- Full access: `dangerFullAccess`, `never`, reviewer `user`.
- Every explicit choice resets all three fields, including when leaving full access or auto-review. Read-only can request approval to exceed its sandbox.
- Existing sessions without a choice send no permission overrides. Server errors (including managed-policy restrictions) remain visible; there is no retry with broader access.
- Queued sends and model retries retain the captured choice. Selection itself makes no network request and does not write global config.
- Labels and menu surfaces remain readable in both themes.

#### Verification

- `pnpm exec vitest run src/api/codexGateway.test.ts src/composables/useDesktopState.test.ts src/server/codexAppServerBridge.inlinePayload.test.ts`
- `pnpm run build`
- Browser assertions at `http://127.0.0.1:4173/#/thread/permission-ui-thread` use intercepted RPCs, so they verify UI/payload behavior rather than model-side authorization decisions.
- Browser artifacts: `output/playwright/permissions-light.png`, `permissions-dark.png`, `permissions-results.json`.
- Performance: dropdown selection makes zero mutation RPCs; four static options, one local state write per selection, no new polling, no extra request on turn submission. Auto-review model latency/usage was not measured.

#### Rollback/Cleanup

- Revert this feature commit and rebuild to remove the control.
- Clear `composer-permission-modes` from test browser localStorage to remove saved choices.
- A permission already sent to Codex remains a session setting; explicitly choose the desired mode before rollback or start a fresh disposable thread.
- Remove only test containers/data created for verification; do not restart live services.

#### Packaged runtime audit (2026-09-15)

- WebUI 0.1.87 candidate / Codex 0.153.4; built with `pnpm run build`, packed with `pnpm pack --pack-destination /tmp/codex-permissions-package`, and installed by `npm install -g --offline /tmp/codexapp.tgz` in an isolated image based on the existing Codex 0.153.4 test image.
- `node dist-cli/index.js --help` exited 0 (the public CLI entry is ESM, so a CJS `require` is not its supported entry).
- Local-only containers: 4196 no auth → OpenCode Zen; 4198 malformed auth → OpenCode Zen; 4199 Zen → OpenRouter with a synthetic invalid key. Permission menus remained available in each case. No real account credentials were copied.
- The real app-server accepted and echoed all four sandbox/approval/reviewer combinations through `thread/start`; direct-turn payloads were checked separately by unit tests and browser interception.
- Invalid synthetic ChatGPT auth on 4197: **not verified**. The submitted read-only turn stayed `inProgress` beyond the 45-second error assertion, including after configuring a local 401 endpoint. Error persistence after reload and duplicate live-overlay count for this case are unverified. Do not report the complete auth matrix as passed.
- Runtime screenshots: `output/playwright/permissions-docker-4196.png`, `permissions-docker-4197.png`, `permissions-docker-4198.png`, `permissions-docker-4199.png`; summary `permissions-docker-results.json`.
- Final keyboard changes were checked on the current Vite checkout; the packaged runtime audit used the preceding build of the same permission payload implementation.
- No production service/domain change or live model-side auto-review decision was tested.
