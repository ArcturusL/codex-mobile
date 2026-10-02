# Automatic conversation titles

## Feature: Generate a title after a successful reply

### Prerequisites
- Run this branch in an isolated development environment with a configured, usable Codex model/provider.
- Keep the browser connected through the first successful reply. Title generation is triggered by the browser's `turn/completed` notification.
- Open the browser Network panel and filter RPC requests by `generate-thread-title`.

### Steps
1. Start a new chat with a specific Chinese request, such as `解释 Vue computed 和 watch 的区别`.
2. While the reply streams, confirm there is no title-generation request.
3. Wait for the successful reply and the subsequent title request. Confirm its model/provider match the completed conversation.
4. Check that the sidebar/header display a short Chinese title and that no helper conversation or title-generation messages appear in the chat.
5. Reload the page. Confirm the generated title persists. Send another message; confirm the title stays unchanged and no additional model request is made for it.
6. Repeat with an English request and with a second configured provider, if available. Switch to another conversation before completion; confirm the original conversation receives the title.
7. Rename an untitled conversation before completion, and separately while title generation is pending. Confirm the manual title wins and remains after reload.
8. Interrupt a reply or produce a failed turn. Confirm no title model request runs. Complete a later turn successfully and confirm generation then runs.
9. Temporarily make title generation fail (for example, block the title RPC in the development browser). Confirm the reply remains usable and its preview title remains. Restore connectivity and complete another turn; confirm generation can retry.
10. Inspect the same title in light and dark themes and on the mobile layout; existing title controls must remain usable.

### Expected results
- One best-effort title request after a successful completion for a conversation without a saved name; duplicate completion events do not create concurrent requests for the same conversation.
- The prompt contains bounded conversation excerpts. The main reply never waits for the title model.
- Manual names are preserved. Successful generated names are written through `thread/name/set` and the existing title cache.
- A helper uses an ephemeral Codex session, reuses existing authentication/provider configuration, and is disposed after completion or timeout.
- A disconnected browser before completion does not trigger generation until a later successful turn is observed; there is no background scan of older chats.

### Rollback/cleanup
- Archive test conversations and restore any temporary request blocking/provider configuration.
- Stop only the isolated verification service. Revert the feature commit to restore the previous preview-title behavior; saved names remain compatible with existing versions.

### Compatibility and performance checks
- Protocol verified against locally generated Codex CLI `0.153.4` schemas and the [official app-server documentation](https://learn.chatgpt.com/docs/app-server).
- The frontend adds no startup/history requests. Title generation uses at most 2,000 characters each from user/assistant text, runs outside the reply path, and skips cached names and duplicate in-flight requests.
- Unit tests cover event timing, failures/retries, name protection, context selection, and backend lifecycle limits. Live model latency must be measured separately from mocked tests.
- Verification on this branch: 190 unit tests passed; frontend build, CLI build, and server TypeScript check passed. The public CLI also passed a CommonJS launcher smoke (`node -e` using `require('node:child_process').execFileSync` to run `dist-cli/index.js --help`).
- A real `gpt-6-astra` call with Codex CLI `0.153.4` and a private temporary `CODEX_HOME` generated `Vue计算属性与侦听区别` in 7,887 ms, with zero persisted rollout files. Temporary authentication/state was removed afterward. This is one latency sample, not a provider-wide benchmark.
- The backend caps simultaneous helper processes at two and disposes each after completion or 60 seconds. Each uncached request adds one source-thread metadata read plus helper `config/read`, `thread/start`, and `turn/start` calls; only the latter invokes the model. No dependencies or UI assets were added.
- Packaged runtime check: `pnpm pack --pack-destination /tmp`, then install the tarball and `@openai/codex@0.153.4` in a Node 22 Debian container. On localhost ports 4195–4197, startup, no-auth/malformed-auth Zen fallback, invalid-token auth selection, switching from Zen to OpenRouter, and title request validation passed. All three disposable containers were removed. This API-level check did not exercise invalid-token failed-turn persistence or browser light/dark screenshots.
