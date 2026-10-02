# Per-turn text file differences

Prerequisites: an isolated candidate with its own `CODEX_HOME`, and a disposable TestChat workspace. Use a desktop browser in light and dark themes. The feature consumes Codex file-change records and turn diffs; shell edits without a recorded patch are not automatically snapshotted.

1. Ask Codex to edit a Markdown file twice, add a text file, and delete another text file in one turn. Include a unique marker and a Markdown file link in its response.
2. After completion, click **View diff** under that response. Check the file list, operation badges, red removed lines, green added lines, and old/new line numbers. Switch files, close with Escape, and check keyboard focus returns to the trigger.
3. Confirm the turn's latest aggregate replaces earlier patch records instead of counting them twice. A later empty aggregate (all changes reverted) must remove the entry.
4. Start another turn modifying the same file. Each response must open its own changes. Reload and reopen an older conversation, including loading earlier turns; diff data should remain available when recorded in history.
5. Test paths containing spaces and Chinese characters, renames, lines starting with `++`/`--`, and files with no textual diff. The latter must show an honest empty state. Failed/declined file changes must not appear as completed edits.
6. Inspect light/dark surfaces, keyboard navigation, and the response's file link (`hrefOk`, `titleOk`, `textOk`). Opening/switching diffs must make no extra API requests or alter workspace files.

Validation (2026-09-20): WebUI 0.1.87; local Codex CLI 0.153.4 schema and recorded FileChange events inspected. Focused automated tests cover normalization, history recovery, replacing/clearing snapshots, stale reads, and turn isolation. Browser verification uses mocked RPC and WebSocket data through the real app at `http://127.0.0.1:4173/#/thread/TestChat-diff`, viewport 1440x1000; this is not a live model or production test.

Performance: no added startup/history requests, filesystem scanning, or Git invocation. Recovery shares the existing session-log read and size/mtime-invalidated cache (64 sessions); it adds one linear JSONL pass on a cache miss. Each turn's live aggregate replaces its previous entry. Browser verification recorded zero additional requests for opening/switching the viewer. Only the selected file's diff rows are built; large files still render all rows and have not been load-tested. Production build retains the existing >500 kB main-chunk warning.

Cleanup: delete only disposable TestChat files and the temporary candidate home after stopping the candidate. No production data or workspace files are changed by viewing a diff.
