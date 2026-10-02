### Desktop CLI loads Codex app-server models through local proxy

#### Feature/Change Name
Desktop CLI startup passes the bound server port to app-server free-mode config.

#### Prerequisites/Setup
1. Build the current branch with `pnpm run build` on a desktop host with `@openai/codex` installed.
2. Use a temporary `CODEX_HOME` for all commands; keep existing account and provider state untouched.
3. Verify local port `17923` is unused before starting the test server.
4. For the custom-provider case, prepare `$CODEX_HOME/config.toml` with a top-level `model_provider = "azure"` and matching `[model_providers.azure]` entry, and remove only the temporary `$CODEX_HOME/webui-custom-providers.json`.

#### Steps
1. Start the built CLI with the temporary `CODEX_HOME`:
   `node dist-cli/index.js --port 17923 --no-open --no-tunnel --no-login`
2. Open `http://127.0.0.1:17923/#/` in the browser.
3. Call `POST /codex-api/rpc` with `{"method":"config/read","params":{}}`.
4. Call `POST /codex-api/rpc` with `{"method":"model/list","params":{}}`.
5. Confirm `/codex-api/provider-models` still returns OpenCode Zen model ids.
6. Verify the model selector is enabled in light theme and dark theme.
7. Send `hi` from the home composer and wait for the first assistant reply.
8. Confirm browser/network logs do not show a `502` for `generate-thread-title` or an empty-rollout `thread/read` during startup.
9. Restart with the explicit custom-provider `config.toml`, no usable Codex OAuth token, and no provider-state file.
10. Call `POST /codex-api/rpc` with `{"method":"config/read","params":{}}`.

#### Expected Results
- `config/read` returns `200` and includes `model_providers.opencode-zen.base_url` pointing at `http://127.0.0.1:17923/codex-api/zen-proxy/v1`.
- `config/read` includes `model_providers.opencode-zen.wire_api` as `responses`, not `chat`.
- Fresh no-auth startup uses OpenCode Zen as a runtime fallback without creating `$CODEX_HOME/webui-custom-providers.json`.
- Fresh no-auth startup with a top-level `model_provider` in `config.toml` does not force `model_provider="opencode_zen"`; the configured provider remains active.
- After a usable Codex `auth.json` is added and the server restarts with no saved free-mode state, startup does not keep forcing `model_provider="opencode-zen"`.
- Existing `$CODEX_HOME/webui-free-mode.json` files are ignored and not migrated to `$CODEX_HOME/webui-custom-providers.json`.
- `model/list` returns `200` with model data instead of `502 codex app-server exited unexpectedly`.
- The model selector is usable in both light theme and dark theme.
- A first home-composer message creates a thread and receives a response without visible startup RPC errors.

#### Rollback/Cleanup
- Stop only the temporary test CLI process.
- Remove the temporary `CODEX_HOME` directory and unset its shell override.

---
