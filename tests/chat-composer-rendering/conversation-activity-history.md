# Thinking and command history remains available after completion

## Setup

- Use an isolated development checkout with compatible dependencies.
- Open a conversation containing multiple completed turns with reasoning summaries and command executions. Include one failed command and one reasoning-only turn without duration metadata.
- Protocol reference: [Codex App Server items and deltas](https://learn.chatgpt.com/docs/app-server). The implementation reads the supplied reasoning summary/content and command execution fields; it does not reconstruct missing server records.
- Automated reproduction uses synthetic HTTP/WebSocket responses through `scripts/verify-activity-history.cjs`; no account, real conversation or model request is needed. The local CLI version checked during this change is `codex-cli 0.153.4`; fixtures exercise the app-server v2 protocol with WebUI `0.1.87`.

## Actions and expected results

1. Open the conversation with default display settings. Each completed turn with thinking or commands has a collapsed `Worked` / `Worked for …` entry before its final answer.
2. Expand each entry. Its thinking summaries and commands appear in the original order, belong only to that turn, and do not appear again as separate rows. The reasoning-only turn also opens without timing metadata.
3. Expand a command. Check its complete command text, working directory, stdout/stderr and exit code. Check a failed command retains its error output and nonzero code. Collapse and reopen it using the keyboard as well as the pointer.
4. Start another turn. Observe reasoning and streamed command output, then complete it. The activity remains available during the final history reload, including when that read is delayed or fails.
5. Refresh the page, then navigate away and back. Expand the earlier and latest turns again; all persisted thinking and command output remains readable without duplicate items or repeated summaries.
6. Repeat with a turn containing more than 50 activity items and load earlier messages. Grouped activity does not consume the message display window or lose its first entries.
7. Check 375×812 and 768×1024 viewports in both light and dark themes. Long commands/outputs wrap or scroll within their containers, all controls remain usable, and the page does not overflow horizontally.
8. Monitor network activity while repeatedly expanding/collapsing existing entries. It causes no additional thread reads or API requests. Collapsed command outputs and completed activity details are not mounted until opened.

## Automated check

Start the development server on a verified free loopback port with an isolated `CODEX_HOME`, then run:

```sh
BASE_URL=http://127.0.0.1:4174 node scripts/verify-activity-history.cjs
npm run test:unit -- src/api/normalizers/v2.test.ts src/composables/useDesktopState.test.ts
npm run build:frontend
```

The temporary port differs from the usual 4173 because 4173 is in use by another active development task. Evidence is saved under `output/playwright/`.

## Performance audit

- The isolated browser fixture passed at both viewports in both themes, including post-refresh data checks and a turn with 62 activities. Twenty open/close operations per case added zero RPC/API calls and produced no recorded long tasks. The measured time includes two animation frames; it is a browser rendering check, not production server latency.
- Completed activity is indexed in linear passes over loaded messages, then removed from the outer render window. Opening a group reads this index; command output is mounted only when expanded. Existing bounded Markdown caches remain in use.
- Completion reuses the existing debounced, serialized event synchronization and invalidates the recent-message cache only for a dirty turn. A request already in flight is allowed to finish before a fresh read. It does not add parallel request fanout or a new API endpoint.
- Production network latency and a real model round trip were not measured; HTTP and WebSocket fixtures cover the client lifecycle without accessing deployed conversation data.

## Cleanup / rollback

Close the test browser context and discard synthetic fixtures; they never write to production history. Stop only this checkout's temporary test server when it is no longer needed. Reverting the feature commit restores the previous UI and normalizer without migrating or rewriting stored conversations.
