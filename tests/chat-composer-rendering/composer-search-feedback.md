# Composer skill layout and file search feedback

## Setup

Run the candidate release with `CODEXUI_RG_COMMAND` pointing to an executable ripgrep. Select a project containing `README.md`; use 375x812 and 768x1024, light and dark themes.

## Checks

1. Type `/` and filter an installed skill with a long name/description. The full name wraps above a separate truncated description; selecting it produces the correct skill chip.
2. Type `@README`. Confirm the search HTTP response contains files and selecting the result creates an attachment.
3. Type a nonexistent name. Only a successful empty response shows “No matching files”.
4. Simulate a 500 search response. The actual failure must be visible. With no selected project, show a choose-folder instruction.
5. Close the menu or change queries while a search is pending. Older results must not replace the current results.

## Cleanup and rollback

Remove the test draft. Restore the previous release symlink and previous service drop-in if rolling back deployment. No conversation or database migration is required.
