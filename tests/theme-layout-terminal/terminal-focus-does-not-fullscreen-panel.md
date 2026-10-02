### Terminal focus does not fullscreen panel

#### Feature/Change Name
Terminal focus on desktop keeps the terminal as a bottom panel instead of expanding it to full screen.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A thread or new-chat project with the terminal toggle available
3. Desktop browser at 1440x900; repeat in light and dark themes

#### Steps
1. Open a thread or new chat with a valid project path
2. Click the terminal toggle
3. Click inside the terminal area
4. Type `echo terminal-focus-ok` and confirm the output appears without changing panel height
5. Hide and reopen the terminal

#### Expected Results
- Terminal remains a bottom panel and does not take over the full viewport
- Conversation/new-chat content is not forcibly hidden by terminal focus
- Composer keeps its normal compact placement instead of stretching above the terminal
- Terminal focus does not activate a viewport transform, keyboard spacer, or delayed height adjustment

#### Rollback/Cleanup
- Close the terminal panel

---
