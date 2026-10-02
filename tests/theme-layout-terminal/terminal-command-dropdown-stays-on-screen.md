# Terminal command dropdown stays on screen

## Feature/Change Name
Composer dropdown menus are viewport-clamped so the terminal command dropdown remains visible when resizing a desktop window.

## Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 127.0.0.1 --port 4173`.
2. Open the app on a desktop browser with a thread whose project exposes terminal quick commands.

## Steps
1. In light theme, open a thread at 1440x900.
2. Click the terminal command dropdown in the content header.
3. Confirm the menu is fully visible within the left and right viewport edges.
4. Confirm long command labels truncate inside the menu instead of pushing the menu off-screen.
5. Scroll or resize the viewport while the menu is open and confirm it remains clamped to the visible viewport.
6. Repeat the dropdown check in dark theme.

## Expected Results
- The terminal command dropdown does not render off the left or right edge after resizing the desktop window to 1024x768.
- Command rows remain clickable and readable.
- Resize and scroll repositioning only runs while the dropdown is open.
- Light and dark theme dropdown surfaces remain readable.

## Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
