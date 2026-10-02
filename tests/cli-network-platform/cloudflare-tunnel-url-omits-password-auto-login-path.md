### Feature: Cloudflare tunnel URL omits password auto-login path

#### Prerequisites
- App is running from this repository with password enabled.
- Cloudflare tunnel startup is enabled (`--tunnel` or auto-enabled path).

#### Steps
1. Start CLI and wait for tunnel output.
2. Verify the printed `Tunnel:` URL does not include a `/password=` suffix.
3. Open the printed tunnel URL in a desktop browser.
4. Confirm first page load shows the password form when no trusted bypass applies.
5. Use the generated password file path from startup output to retrieve the password and sign in.

#### Expected Results
- Tunnel URL shown in startup output does not expose the password.
- Startup prints the base tunnel URL; it does not print a phone QR code.
- The generated password remains available from the local password file.
- Base tunnel URL requires login when no trusted bypass applies.

#### Rollback/Cleanup
- Stop the CLI process.
- Clear cookies for the tunnel origin if needed.
