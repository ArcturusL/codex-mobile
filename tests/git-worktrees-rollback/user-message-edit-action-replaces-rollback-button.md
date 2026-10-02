### Edit message creates a switchable conversation branch

#### Feature/Change Name
Editing a user message forks its conversation before that turn. The original turn and all later responses remain accessible through the message's `‹ 1/2 ›` version controls. Branch links persist in `CODEX_HOME/message-branches.json`.

#### Prerequisites/Setup
1. Run the candidate with an isolated `CODEX_HOME` and Codex app-server; do not share the live service's data directory.
2. Open a test conversation with at least three completed user/assistant turns.
3. Repeat visible checks in light and dark themes.

#### Steps
1. Leave an unsent draft in the original conversation. Click `Edit message` under the second user message.
2. Confirm the new branch contains only the first turn; its composer contains exactly the selected message, including any images, files, and skills.
3. Modify and send it. Confirm only the edited message and its new response follow the first turn.
4. Click the previous-version arrow. Confirm all original turns and the original unsent draft are intact. Click next to return to the edited branch.
5. Reload and repeat switching. Edit the same message again; expect `3/3` and access to both earlier versions.
6. Edit an earlier message and then a later message in a descendant branch. Check that version controls follow the shared prefix and do not include unrelated later branches.
7. Edit the first message. Confirm an empty branch with a recoverable original version and the original text in the composer. Reload before sending; the saved branch and draft should remain usable.
8. In a conversation longer than the history page size, load an older message and edit it. Check the selected turn and all later turns are absent from the new branch, and earlier history can still be loaded.
9. Delay fork/start requests. Check that duplicate edit clicks and sends are disabled. Navigate to another conversation during the delay; it must remain selected.
10. Inject a fork/start or branch-save failure. Check the visible error, unchanged source conversation and draft, and absence of any appended turn. No `turn/start` should target the source as a consequence of the edit.
11. While a response is running, verify editing is disabled. Pending queued messages must also prevent editing with a visible explanation.

#### Expected Results
- Edits after the first turn use native `thread/fork` with the preceding `lastTurnId`; first-turn edits use `thread/start` with the original cwd/model/provider and persist a name before switching. Both save the branch link before entering the composer. No edit calls `thread/rollback`, which current paginated Codex threads reject.
- The source is neither rolled back nor overwritten. Editing/switching conversation versions does not undo workspace file changes; the existing file-change Undo action remains separate.
- Arrows are visible without hover, keyboard accessible, and disabled at the first/last version.
- Failed preparation does not populate or submit an edited draft into the original conversation.
- Refresh restores server-persisted branch relationships; draft storage remains scoped to each conversation.

#### Verification
- `npx vitest run src/shared/messageBranches.test.ts src/server/messageBranches.test.ts src/composables/useDesktopState.test.ts`
- Frontend typecheck/build and CLI build.
- Candidate browser checks: edits, sending, switching, reload, original-draft preservation, fork failure, and light/dark screenshots.
- Native paginated app-server check on CLI 0.153.4: fork through the preceding turn, first-turn edit to an empty named session, reload, and preservation of the original conversation.

#### Rollback/Cleanup
- Return to an original version with the previous arrow. Archive disposable test conversations when finished.
- Code rollback leaves native source/fork sessions readable; older WebUI versions ignore `message-branches.json` and show the sessions separately.
- Keep the metadata file when retaining the edited sessions. Do not overwrite live session data during candidate cleanup.
