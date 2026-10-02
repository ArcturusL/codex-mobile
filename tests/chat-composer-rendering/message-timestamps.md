# Message timestamps

## Setup

Use an isolated candidate with a temporary `CODEX_HOME`, or the intercepted browser check
`BASE_URL=http://127.0.0.1:4173 node scripts/verify-message-timestamps.cjs`.
Include dated user/assistant messages, an image-only message and an old message without a timestamp.

## Actions and expected results

1. Open the conversation in both light and dark themes. Each message has a readable date and time below it, aligned right for users and left for replies. Missing or invalid timestamps show `Time unknown`.
2. Check the browser's local timezone against the ISO value in the `<time datetime>` attribute. Hover to see the full time including timezone.
3. Send a message and stream multiple reply chunks. The timestamp appears immediately and stays fixed during streaming.
4. Finish the reply, refresh, then load earlier messages. Recorded timestamps return from history, including the earlier page. Native session item start times take precedence over response-record write times.
5. Copy a response. Only its original text is copied; the timestamp is not appended.
6. Watch network traffic: displaying timestamps makes no extra requests. History recovery shares the existing size/mtime-invalidated session cache.

## Cleanup

Close the isolated browser and remove only the temporary test data. No production session is changed.
