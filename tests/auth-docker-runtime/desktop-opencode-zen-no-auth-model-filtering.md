### Desktop OpenCode Zen no-auth model filtering

#### Feature/Change Name
Desktop no-auth OpenCode Zen model list is limited to usable free models.

#### Prerequisites/Setup
1. Build the web and CLI artifacts with `pnpm run build` on a desktop host with `@openai/codex` installed.
2. Use a temporary `CODEX_HOME` without `auth.json` or `webui-custom-providers.json`; keep existing account and provider state untouched.
3. Verify local port `18935` is unused.
4. Start `node dist-cli/index.js --port 18935 --no-tunnel --no-open --no-login` with the temporary `CODEX_HOME`.

#### Steps
1. In light theme, open `http://127.0.0.1:18935/#/` at a desktop viewport such as `1440x900`.
2. Confirm the composer starts on `big-pickle`.
3. Open the model menu and confirm it only contains `big-pickle` and `*-free` OpenCode Zen models.
4. Send `hi retest no auth default` and wait for a reply.
5. Switch the model to `deepseek-v4-flash-free`, send `hi retest no auth switched`, and wait for a reply or visible error.
6. Repeat the menu visibility check in dark theme.
7. Restore a valid `$CODEX_HOME/auth.json`, clear `$CODEX_HOME/webui-custom-providers.json`, start a fresh server on another port, and confirm the composer returns to Codex models such as `GPT-5.4-mini`.

#### Expected Results
- `/codex-api/provider-models` returns an exclusive no-auth Zen list containing only `big-pickle` and free models.
- No-auth desktop startup does not expose Codex/GPT, Claude, Gemini, or other paid Zen models unless a user Zen key is configured.
- The no-auth default and switched free model sends both produce a visible assistant reply or visible provider error.
- With valid Codex auth restored, community fallback state is suppressed and the model menu shows Codex models.
- Light and dark theme menus remain readable.

#### Rollback/Cleanup
- Stop only the temporary test CLI process.
- Remove the temporary `CODEX_HOME` directory and unset its shell override.

---
