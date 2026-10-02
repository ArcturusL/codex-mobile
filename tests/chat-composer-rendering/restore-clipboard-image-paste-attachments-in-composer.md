### Feature: Restore clipboard image paste attachments in composer

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open any thread where the composer is enabled.
- Have an image copied to system clipboard (for example screenshot copy).

#### Steps
1. Focus the composer textarea.
2. Paste clipboard content that contains only an image file payload.
3. Confirm an image chip/preview is added to composer attachments.
4. Copy plain text only and paste into composer.
5. Copy mixed content (plain text + image, if source provides both) and paste once.
6. Copy long plain text (at least 2000 characters) and paste into composer.
7. Confirm the long text is attached as a `.txt` file instead of being inserted into the textarea.
8. Send the message with the pasted image/text attachment.

#### Expected Results
- Image-only clipboard paste adds an image attachment to composer.
- Plain-text paste still inserts text into the composer and does not create an attachment.
- Mixed payload paste attaches the image while preserving text paste behavior.
- Long plain-text paste (>= 2000 chars) creates a `.txt` attachment and does not insert raw text into the textarea.
- Sending proceeds with the attached pasted image.

#### Rollback/Cleanup
- Remove the attached image chip from composer if not needed.

### Feature: Long-text upload fallback and plain-text shortcut

#### Prerequisites
- Open an enabled composer; prepare at least 2000 characters of plain text.
- Use network request blocking for `/codex-api/upload-file` to simulate failure.

#### Steps and expected results
1. With uploads allowed, paste normally: one `.txt` attachment is created.
2. Block uploads, select part of an existing draft and paste normally: after failure, the full clipboard text replaces that selection; no attachment is added.
3. Repeat while typing during the pending upload: the new draft is preserved and clipboard text is appended.
4. Switch threads before failure: the destination draft receives no fallback text.
5. Paste using Ctrl+Shift+V (Cmd+Shift+V on macOS): plain text is inserted immediately at the selection, with no upload, including for long or mixed text/image clipboard content.
6. Release the shortcut, then paste normally: long-text attachment behavior resumes. Repeat after blurring and refocusing the composer.
7. Repeat in light and dark themes; existing short-text and image-only paste behavior remains available.

#### Verification and performance
- Automated regression: `pnpm exec vitest run src/components/content/composerPaste.test.ts`.
- Code-path audit: normal long paste makes one upload attempt; failure recovery makes no retry; the plain-text shortcut makes zero upload requests. Fallback copies the draft and clipboard text once. No new dependency or background task is introduced.

#### Rollback/Cleanup
- Unblock the upload endpoint and clear test drafts/attachments.
