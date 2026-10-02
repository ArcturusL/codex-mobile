# Browse file options

Setup: use an isolated local server and a disposable directory containing a text file, a binary file, a nested folder, and a file named `中文 #?%20.txt`.

1. Open `/codex-local-browse<absolute-directory-path>`. Each item has an aligned rightmost `…` button. Open it: text files offer Edit, Download, Remove; binary files offer Download, Remove; folders offer Download ZIP, Remove.
2. Click outside or press Escape: the menu closes. Use Tab and Enter to open it and reach actions. Check with light and dark browser preferences (the listing intentionally uses its existing fixed dark palette).
3. Download a file and compare its bytes; browsers may sanitize filename characters such as `?`. Edit/open the special-character filename and confirm the correct file loads.
4. Folder ZIP reuses project export: existing ignored-file/symlink exclusions and project chat metadata rules apply; it is not a complete filesystem backup.
5. Cancel Remove: filesystem and row remain. Confirm Remove: the item and nested contents disappear, the row is removed, focus moves to another control, and refresh does not restore it.
6. Try removing a missing file: show an error and retain the row. DELETE `/codex-local-file?path=...` without `X-Codex-File-Action: remove`, or with `Sec-Fetch-Site: cross-site`, must return 403. Root and relative paths return 400. Removing a symlink preserves its target.

Automated check: `npx vitest run src/server/localBrowseUi.test.ts`.

Performance audit: opening menus issues no requests; removal uses one async filesystem request and removes one DOM row, with no listing reload or added metadata probes. File downloads stream via the existing route, without browser-side Blob buffering. Large-directory deletion and ZIP throughput were not benchmarked.

Cleanup: delete only the disposable test directory and stop its isolated server. Rollback: revert the feature commit and rebuild.
