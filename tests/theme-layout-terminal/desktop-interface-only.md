# Desktop interface only

## Feature/Change Name
Remove Telegram configuration and the separate phone layout, file drawers, viewport detection, and virtual keyboard workarounds. Narrow and tablet viewports use the same desktop components.

## Prerequisites/Setup
1. Run the current build on a verified local test port with an isolated Codex data directory; retain existing server authentication.
2. Use a desktop browser with a disposable project containing a thread, a completed file-change message, reviewable Git changes, and a working terminal.
3. Open DevTools Network and Console; perform the checks in both light and dark themes.

## Steps
1. At 1440x900, open the app, show the sidebar, open Settings, and inspect startup requests.
2. Resize the sidebar, navigate between threads, Skills, and Automations, then collapse/reopen it and confirm its width and scroll position persist.
3. Send a message and confirm the composer remains focused. Scroll up in a long thread while a reply streams and confirm the view does not jump to the latest message.
4. Open a completed file-change diff and select another file from the adjacent file list. Open the Review pane, resize its file list, and select another changed file.
5. Open the terminal and type `echo desktop-terminal-ok`. Change focus between the composer and terminal, then hide/reopen it.
6. Resize to 768x1024 and then 375x812. Confirm the app keeps the desktop sidebar and review/diff file lists, with no phone drawer, file sheet, or device-specific controls.
7. Return to 1440x900, refresh, and repeat the changed controls in dark theme.

## Expected Results
- Settings contain no Telegram token, allowlist, status, or save controls; startup makes no `/api/telegram/*` requests.
- Desktop navigation, mouse resizing, collapse persistence, message entry, diff selection, review, and terminal input work in both themes without console errors.
- Focusing the terminal does not activate keyboard spacers, viewport transforms, focus timers, or a fullscreen terminal layout.
- Narrow-screen checks establish that the removed mobile components do not return; phone usability is no longer a supported acceptance target.
- Theme surfaces remain consistent across the sidebar, settings, composer, review, diff viewer, and terminal.

## Rollback/Cleanup
Close the test terminal, delete only the disposable project/data created for this check, and restore preferred appearance/sidebar settings. Leave existing service processes unchanged.
