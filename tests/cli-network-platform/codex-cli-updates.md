# Codex CLI version and updates

Setup: use an isolated `CODEX_HOME`, a free localhost port, Node/npm in PATH, and an installed Codex CLI. Use the packaged server with a password for authentication checks. Do not test installation against production data.

1. Open Settings in Chinese and English, in light and dark themes. The Codex CLI section shows the installed version separately from the WebUI version, latest stable version, last successful check, and the six-hour schedule.
2. Click Check for updates. Network checks are shared and throttled for one minute; background checks run every six hours even while Settings is closed. A registry failure must remain visible without losing the installed version or the last successful check time.
3. With a newer stable release available, click Update now. The button disables, progress appears, and the request returns immediately while npm installs in the background. Close and reopen Settings or refresh: the same job remains visible. Simultaneous requests must not start multiple npm processes. A newer installed/prerelease version must never be downgraded to an older stable version.
4. The downloaded version must pass `--version` verification before `CODEX_HOME/codexui-runtime/current.json` changes. Successful installation shows the new installed version and a service-restart notice; running conversations stay alive. After restarting the isolated WebUI, its CLI/app-server resolver selects the managed installation and the notice disappears. This updater controls the Codex used by the WebUI; it does not replace a system-wide terminal command.
5. Simulate unavailable npm/network, insufficient permissions, or a mismatched downloaded version. Show a useful error, preserve the old selection, remove the failed staging directory, and allow retry. No automatic upgrade is performed by scheduled checks.
6. Through a public-host request, verify unauthenticated access is rejected by existing authentication. POST without `X-Codex-CLI-Action: update`, or with `Sec-Fetch-Site: cross-site`, returns 403. Unsupported methods return 405.

Automated regression: `npm exec vitest run src/server/codexUpdate.test.ts` covers numeric version comparison, six-hour scheduling, concurrent check caching, authorization placement, CSRF, failed install, version mismatch, retry, duplicate clicks and restart persistence using a disposable executable. No production package is installed by that test.

Cleanup/rollback: stop only the isolated candidate. Old installation directories are retained. While the WebUI service is stopped, restore the previous `current.json` (or remove it to return to the original CLI), then restart. Remove only the temporary candidate `CODEX_HOME`. Never delete a selected runtime or production conversation data during testing.

Verified locally (2026-09-16): WebUI 0.1.87 with Codex 0.153.4, then a real npm update to 0.154.0 in a temporary home (15.6 s). Packaged restart launched the managed 0.154.0 app-server. Chinese light/dark UI, close/reopen, refresh, failed-status display, public-host login gate and CSRF checks passed at `http://127.0.0.1:4173/`, desktop 1440×1000. Cached status: 20 requests, 188 bytes per response, average 0.88 ms and maximum 1.58 ms. Initial CLI lookup reuses the existing synchronous resolver (bounded probe timeout); npm execution and registry access are asynchronous, with one in-flight check/install. Closed Settings has no browser polling; open Settings polls every minute, or every 1.5 seconds only while installing. This is isolated candidate evidence, not a production deployment; Windows and macOS were not exercised.

Runtime smoke command after `npm run build:frontend && npm run build:cli`:

```sh
node -e "const {spawnSync}=require('node:child_process'); const r=spawnSync(process.execPath,['dist-cli/index.js','--help'],{encoding:'utf8'}); if(r.status!==0 || !r.stdout.includes('Usage:')) process.exit(1); console.log('Packaged CLI --help: PASS')"
```
