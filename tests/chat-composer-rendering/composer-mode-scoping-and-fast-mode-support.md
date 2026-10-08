### Composer mode scoping and Fast mode support

#### Feature/Change Name

Plan mode remains scoped to the current chat. Fast mode is directly to the right of Thinking, before Permissions, and supports GPT 5.4, GPT 5.5, GPT 5.6, GPT-6 Astra, GPT-6 Sol, GPT-6.1 Sol, and GPT-6 Luna model IDs. The selected speed is saved in Codex config and applied to the next turn in existing chats and backend-drained queues.

#### Prerequisites/Setup

1. Dev server running (`pnpm run dev`)
2. At least two existing threads are available
3. Model list includes `gpt-5.4`, `gpt-5.5`, `gpt-5.6-sol`, `gpt-6-astra`, and an unsupported family such as `gpt-5.3-codex`; availability depends on the account/provider.
4. Light theme and dark theme both available from the appearance switcher.
5. Use an isolated `CODEX_HOME` for writes and simulated failures. The verified CLI/app-server version is `0.153.4`.

#### Steps

1. In light theme, open thread A, open the composer add menu, and enable Plan mode.
2. Open thread B and confirm Plan mode is off by default.
3. Return to thread A and confirm Plan mode remains on for that thread.
4. Open Start new thread, enable Plan mode, send a first message, and confirm the created thread starts in Plan mode.
5. Return to Start new thread again and confirm Plan mode is off for the next new chat.
6. Select `gpt-5.4` or a `gpt-5.4-*` model and confirm the Fast mode switch is visible immediately after Thinking and before Permissions without opening the add menu. Open the add menu and confirm it does not contain a duplicate Fast switch.
7. Repeat with `gpt-5.5`, a dashed GPT 5.5 variant, `gpt-5.6-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6-luna`, and a dashed variant of each GPT-6 model.
8. Select an unsupported model family and confirm the Fast mode switch is hidden.
9. Focus Fast mode with the keyboard and press Space. Confirm one `config/batchWrite` request saves `features.fast_mode = true` and `service_tier = "fast"`. While saving, the switch and Send button are disabled; the switch exposes its checked/busy state.
10. Refresh and confirm Fast remains on. Turn it off, confirm `service_tier` is cleared, refresh again, and confirm it remains off. A saved `service_tier = "priority"` must also render as Fast on.
11. Simulate one failed config write with request interception. Confirm an error is shown, the previous switch state is restored, and the switch becomes usable again.
12. In one existing chat, send a turn with Fast off, then on, then off. With a local Responses SSE fixture, confirm outgoing tiers are absent/standard, `priority`, absent/standard. Confirm a backend-drained queued turn uses the current saved setting. Explicit `serviceTier` / `serviceTierForTurn` RPC overrides must remain intact. A turn already running is not restarted by toggling.
13. Switch to dark theme and repeat steps 1-12. Verify the actual composer at 1440×1000 and 1024×768; Thinking, Fast, Permissions, and Send must not overlap.

#### Expected Results

- Enabling Plan mode in one existing thread does not enable it in other existing threads.
- A new-chat Plan mode selection applies to the created chat but does not persist as the default for later new chats.
- Fast mode is visible next to Thinking for the supported model families, including dashed variants; model selection and reasoning effort are unchanged when toggling.
- Saving, refresh, keyboard input, busy state, and failure rollback work. Standard/Fast requests follow the current saved setting even in previously loaded threads and backend queues.
- Fast mode remains hidden for unsupported model families.
- Composer controls and menus remain readable in light and dark themes.

#### Rollback/Cleanup

- Turn Plan and Fast off in test threads; remove only the temporary test containers/homes when finished. Revert the feature commit to restore the previous UI and request behavior. No production configuration is needed for these checks.

#### Verification and performance (2026-09-20)

- WebUI `0.1.87` with Codex CLI/app-server `0.153.4`; frontend/typecheck and CLI build passed. `node dist-cli/index.js --help` passed (the package entry is ESM).
- Focused Vitest: 108 tests passed across state, gateway, bridge tier handling, and archive/retry handling.
- Browser component check: `http://127.0.0.1:4186/output/playwright/fast-mode-harness.html`, 1440×1000 and 1024×768. Port 4173 was retained for the other worktree. Saves used real isolated app-server config; only the failure and delayed write were intercepted.
- Screenshots: `output/playwright/composer-fast-light.png` and `output/playwright/composer-fast-dark.png`. Runnable checks/results are under `output/playwright/` (ignored test artifacts).
- Packaged Docker checks used localhost ports 4192–4196 with isolated homes: no-auth Zen fallback, malformed-auth fallback, invalid-auth detection, Zen → OpenRouter selection, and the local Responses fixture. The same existing thread emitted standard → priority → standard; backend queue emitted priority. No external inference was used.
- Packaged full UI check: `http://127.0.0.1:4196/#/thread/<fixture-thread>`, 1440×1000; light/dark screenshots `output/playwright/packaged-composer-fast-light.png` and `output/playwright/packaged-composer-fast-dark.png`. On port 4194, the local 401 error remained visible after refresh with zero duplicate live overlays (`output/playwright/invalid-fast-after-reload.png`).
- Commands: `pnpm_config_verify_deps_before_run=false pnpm run build`; `node_modules/.bin/vitest run src/server/codexAppServerBridge.speed.test.ts src/server/codexAppServerBridge.archive.test.ts src/api/codexGateway.test.ts src/composables/useDesktopState.test.ts`; `pnpm_config_verify_deps_before_run=false pnpm pack --pack-destination /tmp/composer-fast-package`; `docker build -t codexapp-fast-toggle-test:20260920 /tmp/composer-fast-package`; `node output/playwright/verify-fast-mode.cjs`; `python3 output/playwright/verify-fast-requests.py`; `node output/playwright/verify-packaged-ui.cjs`. The pnpm flag preserves the compatible shared worktree dependencies.
- One config write per click; refresh does not rewrite the setting. Each turn adds one internal `config/read` (no additional browser call, polling, fanout, or dependency). Ten packaged config-read HTTP round trips measured median 7.21 ms, max 100.71 ms including HTTP/bridge overhead; this is not a model latency benchmark.
- Official behavior reference: [Codex speed](https://learn.chatgpt.com/docs/agent-configuration/speed). Model availability and usage rates are account/model dependent; the UI does not promise a fixed multiplier.

#### Verification and performance (2026-10-08)

- WebUI `0.1.89` with Codex CLI/app-server `0.161.0`: frontend typecheck/build, CLI build and packaged CLI help passed; 79 focused state, gateway and bridge tests passed.
- The live CLI `model/list` advertises Fast service tiers for `gpt-6.1-sol`, `gpt-6-sol` and `gpt-6-luna`. The isolated candidate at `http://127.0.0.1:4203/` showed the switch for all three and retained Fast after refresh. One click saved `service_tier = "fast"` in one config write; an actual GPT-6.1 Sol turn completed and persisted. Switching back cleared the tier.
- Chinese light and dark UI at 1440×1000: `output/playwright/fast-gpt6-light.png` and `output/playwright/fast-gpt6-dark.png` in the candidate report. No page errors. The change adds only a regex match, 23 bytes of JavaScript to the existing bundle; model-list requests, polling and config writes are unchanged.
- Official API references: [Fast mode](https://developers.openai.com/api/docs/guides/fast-mode), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Fast availability can still depend on account and region.

---
