### Desktop runtime without mobile bootstrap

#### Feature/Change Name
Desktop development and CLI startup run without Android/Termux detection, platform-specific installation, keep-alive hints, or phone QR output.

#### Prerequisites/Setup
1. Use the current checkout on Linux, macOS, or Windows with project dependencies available.
2. Use a temporary `CODEX_HOME` for any server startup; keep existing account and skills state untouched.
3. Build the CLI with `npm run build:cli`.

#### Steps
1. Run `npm run dev -- --help` and confirm Vite help appears.
2. On Linux/macOS, run `TERMUX_VERSION=retired-test PREFIX=/retired/com.termux/files/usr npm run dev -- --help` and confirm it still prints Vite help without launching a packaged server.
3. Run `node -e "process.argv = ['node', 'dist-cli/index.js', '--help']; require('./dist-cli/index.js')"` on a Node version that supports requiring ESM, or `node dist-cli/index.js --help` on Node 18.
4. Run `node_modules/.bin/vitest run src/server/skillsRoutes.startup.test.ts src/server/terminalManager.test.ts src/server/appServerRuntimeConfig.test.ts` (use `.cmd` on Windows).
5. Follow the [tunnel URL check](cloudflare-tunnel-url-omits-password-auto-login-path.md) if tunnel testing is available.

#### Expected Results
- Desktop dev arguments are forwarded to Vite without probing `uname` or switching into an Android CLI path.
- CLI help loads successfully and retains authentication, local/network access, and tunnel options.
- Unauthenticated skills startup preserves local instructions without fetching public skills or invoking Git; manual shared-skills Pull remains available.
- Native PTY absence still reports the integrated terminal as unavailable without preventing the rest of the app from loading.
- Startup prints tunnel URLs without passwords or phone QR codes.

#### Rollback/Cleanup
- Stop only temporary test processes, delete the temporary `CODEX_HOME`, and unset shell overrides.
