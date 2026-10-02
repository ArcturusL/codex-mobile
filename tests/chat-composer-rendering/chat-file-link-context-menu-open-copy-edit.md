### Feature: Chat file-link context menu (open/copy link/copy file text/edit)

#### Prerequisites
- App server is running from this repository.
- Open a thread that contains rendered `.message-file-link` anchors (for example Markdown file links).
- Prepare UTF-8 text/Markdown files (including Chinese, spaces, parentheses, `#`, `?`, and `%` in filenames), an empty file, a binary file, a directory, a missing path, and a file larger than 10 MB.

#### Steps
1. In a message with a file link, right-click the file link text.
2. Verify the custom context menu appears near the pointer.
3. Click `Open link` and confirm the link opens in a new tab.
4. Right-click the same file link again and click `Copy link`, then paste into a text input to verify copied value.
5. For links under `/codex-local-browse...`, right-click and click `Edit file`.
6. Click outside the menu and press `Escape` while the menu is open.
7. Right-click a local text file link, choose `Copy file text`, and paste into a plain text editor. Repeat with a `:12` line suffix, special filenames, and the empty file.
8. Change the file on disk, then copy again. Verify the new content appears.
9. Try copying the binary file, directory, missing file, and file larger than 10 MB. Deny clipboard access (including the selection fallback) and retry a text file.
10. Repeat in light and dark themes. Inspect network traffic before opening the menu and after one copy action.

#### Expected Results
- Right-clicking any `.message-file-link` opens the custom context menu.
- Menu includes `Open link` and `Copy link` for all links.
- Menu includes `Edit file` only for browseable local file links.
- Menu includes `Copy file text` for same-origin local browse links. It copies the full original UTF-8 text, including whitespace and Markdown source, without copying a file object, URL, or rendered HTML. A line suffix does not limit copied content.
- The button shows `Copying…` and is disabled while copying, then shows `File text copied.` on success. Empty files successfully copy an empty string.
- Invalid files and denied clipboard access show a visible error and preserve the previous clipboard. Files over 10 MB are rejected without downloading the full file; contents are never truncated.
- Rendering and opening the menu make no file-content requests. Each copy click makes one uncached request and reads the latest disk contents.
- The menu and feedback are readable in both themes; external links have no copy-file-text action.
- Pointer-down outside, blur, and `Escape` close the menu.

#### Automated Verification
- `node_modules/.bin/vitest run src/server/localBrowseUi.test.ts`
- Start the current worktree on `127.0.0.1:4173` with a temporary `CODEX_HOME`, then run `PLAYWRIGHT_BROWSERS_PATH=/home/ubuntu/.cache/ms-playwright node scripts/verify-copy-file-text.cjs`.
- The browser check uses isolated TestChat RPC/WebSocket fixtures and real local file reads, asserts `hrefOk`, `titleOk`, `textOk`, and actual clipboard values, and saves screenshots/reports under `output/playwright/`.

#### Rollback/Cleanup
- Close any tabs opened during the test.
- Remove manual fixture files. The automated check removes its temporary files and browser context automatically.
