# Codex CLI version and updates

Setup: use an isolated `CODEX_HOME`, a free localhost port, Node/npm in PATH, and an installed Codex CLI. Use the packaged server with a password for authentication checks. Do not test installation against production data.

1. Open Settings in Chinese and English, in light and dark themes. The Codex CLI section shows the installed version separately from the WebUI version, latest stable version, last successful check, and the six-hour schedule.
2. Click Check for updates. Network checks are shared and throttled for one minute; background checks run every six hours even while Settings is closed. A registry failure must remain visible without losing the installed version or the last successful check time.
3. With a newer stable release available, click Update now. The button disables, progress appears, and the request returns immediately while npm installs in the background. Close and reopen Settings or refresh: the same job remains visible. Simultaneous requests must not start multiple npm processes. A newer installed/prerelease version must never be downgraded to an older stable version.
4. The downloaded version must pass `--version` verification before `CODEX_HOME/codexui-runtime/current.json` changes. Successful installation shows the new installed version and a service-restart notice; running conversations stay alive. After restarting the isolated WebUI, its CLI/app-server resolver selects the managed installation and the notice disappears. This updater controls the Codex used by the WebUI; it does not replace a system-wide terminal command.
5. Simulate unavailable npm/network, insufficient permissions, or a mismatched downloaded version. Show a useful error, preserve the old selection, remove the failed staging directory, and allow retry. No automatic upgrade is performed by scheduled checks.
6. Through a public-host request, verify unauthenticated access is rejected by existing authentication. POST without `X-Codex-CLI-Action: update`, or with `Sec-Fetch-Site: cross-site`, returns 403. Unsupported methods return 405.

Automated regression: `npm exec vitest run src/server/codexUpdate.test.ts` covers numeric version comparison, six-hour scheduling, concurrent check caching, authorization placement, CSRF, failed install, version mismatch, retry, duplicate clicks and restart persistence using a disposable executable. No production package is installed by that test.

Cleanup/rollback: stop only the isolated candidate. The selected installation, one rollback installation, and installations referenced by running processes are retained; other updater-owned installations are removed on Linux before and after an update. While the WebUI service is stopped, restore the previous `current.json` (or remove it to return to the original CLI), then restart. Remove only the temporary candidate `CODEX_HOME`. Never delete a selected runtime or production conversation data during testing.

Verified locally (2026-09-16): WebUI 0.1.87 with Codex 0.153.4, then a real npm update to 0.154.0 in a temporary home (15.6 s). Packaged restart launched the managed 0.154.0 app-server. Chinese light/dark UI, close/reopen, refresh, failed-status display, public-host login gate and CSRF checks passed at `http://127.0.0.1:4173/`, desktop 1440×1000. Cached status: 20 requests, 188 bytes per response, average 0.88 ms and maximum 1.58 ms. Initial CLI lookup reuses the existing synchronous resolver (bounded probe timeout); npm execution and registry access are asynchronous, with one in-flight check/install. Closed Settings has no browser polling; open Settings polls every minute, or every 1.5 seconds only while installing. This is isolated candidate evidence, not a production deployment; Windows and macOS were not exercised.

Runtime smoke command after `npm run build:frontend && npm run build:cli`:

```sh
node -e "const {spawnSync}=require('node:child_process'); const r=spawnSync(process.execPath,['dist-cli/index.js','--help'],{encoding:'utf8'}); if(r.status!==0 || !r.stdout.includes('Usage:')) process.exit(1); console.log('Packaged CLI --help: PASS')"
```


## Update failure diagnostics and copying

Setup: isolated candidate with a simulated failed updater response in each theme; do not fill the real disk or start a production update for testing.

- Simulate npm exiting zero with `TAR_ENTRY_ERROR ENOSPC` on stderr. The updater must report disk-full, retain diagnostic details and leave the old selection unchanged. A later periodic version check must preserve this installation failure until the next installation attempt.
- Open Settings after a failed update. The error is selectable despite the sidebar's `select-none`; long details wrap and scroll inside the error block. A previous restart notice must not label the failed attempt successful.
- Click Copy error: clipboard must contain the translated summary and complete displayed diagnostic details, including line breaks. Deny clipboard access and the fallback: show manual-copy guidance while keeping the original error selectable. Validate both light and dark themes.
- Cleanup: remove browser response stubs. No new background requests are introduced; error formatting happens only on failure and details are bounded to 16,000 characters plus a truncation marker.


## Latest install target and stable update progress

Setup: an isolated candidate server on a free localhost port. Run `npm exec vitest run src/server/codexUpdate.test.ts` for the backend and `VERIFY_BASE_URL=http://127.0.0.1:4198 node scripts/verify-codex-update-settings.cjs` for the browser. The browser check stubs only the updater endpoint and never installs a production package.

- The installer must request `@openai/codex@latest` with `--prefer-online`. Let the cached version check return 0.154.0 while npm resolves latest to 0.155.0: activation must succeed and both installed/latest labels must become 0.155.0. Compare the executable's version against its downloaded package metadata, not the cached version check. Reject mismatched binaries and downgrades before changing `current.json`.
- Delay the update POST and several progress GETs. From the initial click through completion, keep Update now labelled Updating and disabled. Keep the separate Check for updates button labelled Check for updates and disabled. Silent progress polls must never change it to Checking; an explicit manual check still must.
- Fail one progress GET, then recover. Keep the ongoing update indicator while showing the request error. Close/reopen Settings to recover the job, then verify successful completion and failed-install retry states. Run in light and dark themes.
- Performance: retain the existing sequential poll schedule (1.5 seconds while updating, 60 seconds otherwise), one in-flight request per mounted panel, and the backend's single-install guard. No extra registry lookup is added to the install path; only one asynchronous package-manifest read is added. Cleanup: remove stubs/close the test pages; stop only the isolated candidate when finished.


## Bounded installation storage and disk-space preflight

Setup: an isolated `CODEX_HOME` on Linux with Node/npm available. Run `node_modules/.bin/vitest run src/server/codexUpdate.test.ts src/server/codexUpdateStorage.test.ts`. Never fill the real filesystem to test low-space handling.

- Create several `install-*` directories with `current.json` naming the selected and `previousDirectory` rollback installations. Start a process from an older installation (also test a symlinked script path), then update. Keep the selected, rollback and running installations; remove unused older copies. After that process exits, the next cleanup may remove its copy. Ignore unrelated names and directory symlinks. Legacy manifests retain the newest old copy as their initial rollback.
- Mock filesystem availability below 1 GiB. After cleanup, refuse to start npm, leave the selected version unchanged and show the required/available MiB in the selectable, copyable error details. The 1 GiB threshold budgets a roughly 430 MiB runtime, its download/extraction and headroom; it is not a reservation against other writers. ENOSPC during installation must still fail safely.
- Verify npm uses a cache inside its staging directory, never the user's shared npm cache. Successful activation removes that cache and records the prior selected directory for rollback. Failure removes the entire staging directory, including downloads. Repeated upgrades must not accumulate unused installs or download caches. Periodic version checks do not install or scan processes.
- Process inventory is Linux `/proc` based; an unreadable argv inventory skips automatic removal. Platforms without this inventory retain old copies conservatively but still get disk-space preflight and disposable caches. Linux process paths are checked through argv, executable/cwd links where accessible, and canonical symlink targets. Non-dumpable processes with unresolved relative Codex paths also prevent deletion. This remains a single-updater-per-home mechanism; independent installers must not run concurrently against the same home.
- Cleanup/rollback: stop the isolated server, restore `current.json` to the retained `previousDirectory`, restart and confirm `--version`; remove only the isolated test home afterward. Manifest extension is backward compatible with earlier resolvers.

Performance audit: cleanup runs only twice per explicit update, before downloading and after activation, with sequential asynchronous filesystem calls and a bounded process inventory. Status GETs and the six-hour registry timer do not scan processes or delete files. No new dependencies, frontend requests or polling intervals are introduced; regression tests retain concurrent-click coalescing and stable updating labels.

Verified locally (2026-10-08): all 240 unit tests, frontend typecheck/build, CLI build and packaged `--help` passed. A real `@openai/codex@latest` install selected 0.161.0 in 39 s, removed its download cache, retained 0.160.1 for rollback and kept the running 0.157.1 process intact. Cleanup over the real process inventory took 118 ms. An isolated packaged candidate on `http://127.0.0.1:4199` passed login, WebSocket, real send/stream completion, refresh recovery and light/dark checks at 1440×1000; delayed/failing updater polling kept stable labels with at most one active request. These measurements describe the candidate and CLI update, not a WebUI production deployment.
