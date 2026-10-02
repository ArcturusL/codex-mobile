# User questions, custom answers, and automatic defaults

## Scope and protocol

- Tested against Codex CLI / app-server **0.153.4** and Codex Mobile **0.1.87**.
- Use the official `item/tool/requestUserInput` server request and reply with `{ answers: { [questionId]: { answers: string[] } } }` using the original request ID. `serverRequest/resolved` clears the pending question, including cancellation from another client.
- The installed schema contains `isBlocking` and deprecated `autoResolutionMs`. Current nonblocking requests get the CLI's 120-second total wait (60-second grace plus 60-second countdown); blocking requests have no timer. User interaction snoozes auto-resolution for that request, including after reconnect. Mobile displays the remaining time throughout the wait.
- Compatibility for older requests: use a valid `autoResolutionMs`; explicit `null` disables automatic resolution; if both fields are absent, use 60 seconds. Invalid timeouts disable automatic resolution.
- **Requested Mobile extension:** on timeout, return the first option's exact label for each choice question. Official CLI returns an empty answer map instead. Free-text and secret questions have no fabricated default and are omitted from automatic answers. Users can always supply custom answers; custom text replaces the selected option.
- Command/file/permission approvals and MCP elicitation keep their existing explicit response flow. They do not get this timer.
- Reference: [official app-server documentation](https://developers.openai.com/codex/app-server#toolrequestuserinput). The installed schema was verified with `codex app-server generate-ts --out /tmp/codex-user-input-schema`; the local official source snapshot `1715e55` implements the CLI timing in `codex-rs/tui/src/bottom_pane/request_user_input/mod.rs`.

## Setup

Use an isolated worktree with compatible shared dependencies, a temporary `CODEX_HOME`, and a free loopback port. Never connect these test fixtures to production sessions.

```sh
CODEX_HOME=/tmp/codex-user-input-home node scripts/dev.cjs --host 127.0.0.1 --port 4173
npm run test:unit -- src/server/codexAppServerBridge.userInput.test.ts src/composables/useDesktopState.test.ts
BASE_URL=http://127.0.0.1:4173 node scripts/verify-user-input.cjs
```

The browser script intercepts all app API and WebSocket traffic. It exercises the actual app and panel without external model inference. Backend tests exercise the real bridge lifecycle with fake time and captured JSON-RPC writes.

## Actions and expected results

1. Show a request with two choice questions. Both first options are selected and marked Default; descriptions and custom-answer fields are visible, including when `isOther` is false. Check light/dark themes and keyboard radio navigation.
2. Select an alternative, then type custom text. Only the custom answer is submitted for that question. Select an option again: custom text clears. All question IDs are preserved in one reply.
3. Show a text-only question. A text field appears even when `options` is null; empty answers cannot be sent. `isSecret` uses a password field.
4. Leave a nonblocking request untouched. The server submits first-option answers once after 120 seconds, even with no page open. Reload before the deadline: the original deadline remains unchanged. An explicit legacy 35,000 ms timeout fires at 35 seconds; a missing legacy timeout uses 60 seconds.
5. Begin answering: the countdown pauses on the server, and only one pause request is sent. Reload or open another tab: the request remains paused. Send to continue; drafts are kept in the current panel only and are not persisted across page reloads.
6. Fail the pause endpoint: show a visible error and keep the countdown visible. Retry using Pause countdown. Fail the answer endpoint: retain the answer for retry.
7. Resolve from another tab or cancel the turn. The panel disappears and pending bridge state clears. A late response returns HTTP 409 and closes the stale panel without submitting a second answer.
8. Show a blocking question, command approval, or MCP elicitation; advance time by five minutes. No automatic approval or answer is sent.
9. Confirm shutdown cancels all timers. Reusing an RPC ID for an incoming question must not resolve an unrelated outgoing RPC.

## Performance and evidence

- One server `setTimeout` per eligible pending request; cleared on answer, snooze, resolution, turn cleanup, or process shutdown. No backend polling, new dependency, persistent-data format, or model request is introduced.
- One 1 Hz display timer only while the visible panel has an active deadline. It stops on snooze/unmount. No HTTP request per countdown tick; typing after a successful pause sends no further pause requests. A pause failure requires an explicit retry rather than per-keystroke retries.
- Browser assertions record request counts, zero page errors, preserved deadlines after refresh, exact submitted answers, and both theme colors in `output/playwright/user-input/report.json`. Screenshots: `light.png`, `dark.png`, at 1440 x 1080.
- Full unit suite: 28 files / 242 tests passed. Frontend typecheck/build and CLI build passed. Main frontend JS: 522,287 bytes (161,331 gzip bytes); the existing 500 kB build warning remains.
- Public runtime smoke: `node -e "const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['dist-cli/index.js','--help'],{encoding:'utf8'});if(r.status!==0||!r.stdout.includes('Web interface for Codex app-server'))throw Error(r.stderr)"` passed. The public CLI is ESM and is launched from CJS using the installed runtime boundary.
- Packaged checks: `pnpm pack --pack-destination /tmp/user-input-package`, install the tarball in the isolated Docker image with the existing matching dependencies, mount Codex CLI 0.153.4 read-only at `/opt/codex`, and launch `codexapp --port 4190 --no-password --no-open --no-tunnel --no-login`. Publish only to loopback: 4192 no auth, 4193 malformed auth, 4194 local invalid-auth fixture, 4195 Zen-to-OpenRouter switch. Each uses its own temporary `CODEX_HOME`; no production credentials are used.
- Packaged UI: `BASE_URL=http://127.0.0.1:4192 OUTPUT_DIR=output/playwright/user-input/package-ui node scripts/verify-user-input.cjs` passed both themes. The four provider/auth cases passed; the local 401 error persisted after refresh, with zero duplicate live overlays (`invalid-auth-report.json`, `invalid-auth-reload.png`). The 401 fixture uses a synthetic access token and **empty refresh token** to avoid unrelated token refresh before the local request.
- Production/domain/login behavior is outside this development verification; deployment is a separate action.

## Rollback and cleanup

Revert the feature commit and rebuild to restore the previous panel. No database or config migration is needed. Stop only this task's isolated test containers; leave the verified development server running unless it is no longer needed. Do not remove or modify production `CODEX_HOME`.
