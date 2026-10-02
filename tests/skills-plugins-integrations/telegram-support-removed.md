### Feature: Telegram support removed

**Prerequisites / setup**

- Use the current build in an isolated verification environment with a disposable `CODEX_HOME`.
- Optionally place a `telegram-bridge.json` file containing only a fake bot token, fake chat IDs, and fake allowed user IDs in that directory. Record its checksum.
- Do not use a real bot token or modify an existing user's data directory.

**Exact actions**

1. Restart the verification server, then open the desktop app and expand Settings in both light and dark themes.
2. Verify that no Telegram row, bot token form, or allowlist editor is present. Inspect the browser Network panel and confirm startup makes no requests to `/codex-api/telegram/*`.
3. From the authenticated session, request `GET /codex-api/telegram/config`, `GET /codex-api/telegram/status`, and `POST /codex-api/telegram/configure-bot` with a JSON body containing a fake token and user ID.
4. Confirm these requests no longer return a Telegram configuration, status, or successful configuration result. The server may return its standard missing-route response or frontend fallback.
5. Compare the test configuration checksum and restart the server again. Confirm the file is unchanged and there are no Telegram polling requests or bot notifications.
6. Open the Plugins and Apps directory on desktop and inspect a detail modal in both themes. Confirm the directory retains its desktop grid and the modal remains centered.

**Expected results**

- Telegram settings, configuration APIs, background polling, and message forwarding are unavailable.
- The app does not read, update, or delete legacy Telegram configuration. Existing user files can remain in place for rollback.
- Other Settings controls and the Plugins and Apps directory continue to work on desktop.

**Rollback / cleanup**

- Stop only the disposable verification server and remove its temporary data directory.
- Reverting the code restores the previous integration; no Telegram data migration is performed.
