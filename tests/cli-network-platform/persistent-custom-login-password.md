# Persistent custom login password

## Setup
- Use an isolated CODEX_HOME and loopback test port; keep production untouched.
- Follow README's hidden-input setup to create codexui-custom-password (0600).
- Start with default random password protection; send Host: remote.example in HTTP tests so local trust does not bypass authentication.

## Actions and expected results
1. POST /auth/login with the generated password, then with the custom password: both return 200 and a session cookie.
2. Use each cookie on a protected route and WebSocket authorization: access succeeds.
3. Submit an incorrect or empty password: 401 and no session cookie.
4. Restart with another generated password: the custom password still works.
5. Set CODEX_WEB_CUSTOM_PASSWORD_FILE to a separate persistent file and restart: that password works; upgrades must preserve this path/configuration.
6. Configure a nonexistent, unreadable, empty or multiline file: startup fails without printing the credential. Absence of the optional default file retains primary-only login.
7. Change the file and restart: new custom password works; old custom password fails (existing sessions retain their lifetime).

## Automated check
`pnpm exec vitest run src/server/authMiddleware.test.ts`

## Cleanup / rollback
Stop the test service and delete its isolated data. To disable the feature, remove the custom file, unset the override and restart. Old versions ignore the extra file; random-password login remains available. No session format migration is introduced.

## Performance audit
One synchronous file read at auth initialization; no extra filesystem reads per request. Password submissions add at most one constant-time comparison. Normal HTTP and WebSocket session checks are unchanged. No new dependencies or frontend assets.
