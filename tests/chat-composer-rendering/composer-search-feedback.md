# Composer skill layout and file search feedback

## Setup

Run the candidate release with `CODEXUI_RG_COMMAND` pointing to an executable ripgrep. Select a project containing `README.md`; use 375x812 and 768x1024, light and dark themes.

## Checks

1. Type `/` and filter an installed skill with a long name/description. The full name wraps above a separate truncated description; selecting it produces the correct skill chip.
2. Type `@README`. Confirm the search HTTP response contains files and selecting the result creates an attachment.
3. Type a nonexistent name. Only a successful empty response shows “No matching files”.
4. Simulate a 500 search response. The actual failure must be visible. With no selected project, show a choose-folder instruction.
5. Close the menu or change queries while a search is pending. Older results must not replace the current results.

## Slash search title priority

Setup: Load skills named `docx` and `ponytail`, with `po` appearing in the docx description (for example, “polished”). Use a desktop viewport in both light and dark themes.

1. Type `/po`. Confirm `/ponytail` appears before `/docx`; description-only matches remain available after title matches.
2. Press Enter or Tab with the first result highlighted. Confirm the ponytail skill chip is selected.
3. Remove the chip and type `/PO`. Confirm the same ordering. Type `/` alone and confirm the original unfiltered order is preserved.
4. Check a query shared by several titles and descriptions. Within each match group, the original order is preserved and no item is duplicated. A query with no matches still shows “No results”.

Cleanup: Remove the test draft and selected skill chip. No persisted data changes are required.

## Cleanup and rollback

Remove the test draft. Restore the previous release symlink and previous service drop-in if rolling back deployment. No conversation or database migration is required.
