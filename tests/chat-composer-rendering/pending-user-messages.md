# Immediate user messages and failed-send recovery

## Setup

Build the frontend and run an isolated candidate. Use
`BASE_URL=http://127.0.0.1:4204 node scripts/verify-pending-user-messages.cjs`
for intercepted slow/offline requests. Use a private CODEX_HOME for real sends.

## Actions and expected results

1. In an existing conversation, delay `turn/start`. Send a message: a dated user row appears immediately with “Sending…”, before any acknowledgement or assistant reply. Repeated clicks cannot send it twice.
2. Disconnect the request or let it time out. The original text, images, files and skills remain recoverable. A failed row shows “Send not confirmed”, the error, Copy message and Restore to composer. Copy excludes dates/status. No mutation is retried automatically.
3. Refresh while offline, then reconnect. The pending row and composer draft survive. Older identical text must not swallow a new send. Restore the original, then send: reuse its pending row and replace it with the confirmed history item, without a duplicate bubble.
4. Have the server accept the send but drop its HTTP acknowledgement. After history arrives, show the confirmed user message once; issue no automatic second turn.
5. While a send is pending, type a different next draft. A late acknowledgement must not erase the newer draft. Switch conversations during a request: its callback must not clear another conversation's draft.
6. Fail `thread/start`, project/worktree preparation, or a queued-message PUT. Keep the original composer draft, including after refresh. A queue submission is accepted only after its save succeeds. Queue and turn requests time out after 60 seconds.
7. Check both themes and Chinese/English labels. Sending an existing-thread steer uses the same immediate/recoverable row. A failed steer must not stop the previously active turn.
8. When an unsupported model triggers the existing model fallback, retain one recovery row through rollback and a failed retry.
9. If browser storage is full, stop the send before issuing the mutation and retain the draft with an actionable error. Recovery data is browser-local; clearing site data removes it.

## Performance and cleanup

No dependencies or polling were added. Pending messages reuse existing history requests and reconcile one-to-one; they are saved only when their content/status changes, not on streaming deltas. Confirmed entries are removed from local storage. The deterministic browser check sends exactly four turn mutations for four explicit attempts, with no automatic replay after a lost acknowledgement.

Close the test browsers and remove only their temporary homes/containers. Test the packaged CLI in isolated Docker homes for absent/malformed auth, invalid-auth error persistence, and Zen to OpenRouter switching. Production sessions must not be used by parallel candidates.
