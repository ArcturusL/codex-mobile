### LaTeX math in conversation messages

#### Feature/Change Name
Render inline and display LaTeX formulas while preserving normal Markdown, code, currency, and file links.

#### Prerequisites/Setup
1. Run the current checkout at `http://127.0.0.1:4173` with an isolated Codex data directory. Inspect the port owner before starting; do not restart an active stable/latest service.
2. Install the repository dependencies and Playwright Chromium with its operating-system dependencies.
3. Run `node scripts/verify-chat-math.cjs` from the repository root. The CJS script intercepts API calls and app WebSocket notifications, so it exercises the real TestChat composer and `ThreadConversation` without a Codex login, real conversation, or external request.
4. For a manual check, open a disposable `TestChat` thread in light theme. Repeat in dark theme at 375×812 and 768×1024.

#### Steps
1. Send a unique marker such as `TESTCHAT_MATH_<timestamp>` with `$x^2$`, `\(\frac{a}{b}\)`, and a file link `[formula.md](/tmp/TestChat/formula.md)`. Add `**Result $u^2$** *sum $v^2$* ~~$w^2$~~` to verify emphasis containing math.
2. Include each of the following on its own lines:
   ```text
   $$
   \int_0^1 x^2\,dx=\frac{1}{3}
   $$

   \[
   \begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}
   \]
   ```
3. Include `**Result $u^2$**`, `*sum $v^2$*`, `~~$w^2$~~`, `- List $a_i^2+b_i^2=c_i^2$` and Markdown table cells containing `$\sqrt{2}$` and `$|x|$`. Also test a list item starting with `- $$`, followed by indented `x^3` and `$$` on their own lines; repeat with `1. \[`, indented `y^3`, and `\]`.
4. Include escaped currency `\$5`, ordinary `$10 and $20`, inline code containing `$x^2$`, and fenced shell code containing `echo "$HOME $x^2$"`.
5. Stream an assistant reply in separate chunks: first `$\frac{a`, then `}{b}$`. Append 20 distinct formulas to the same reply to exercise repeated updates; finish the turn.
6. Include a display formula with at least 20 summed terms; scroll it horizontally at both viewport sizes.
7. Reload and inspect the same rendered message. Switch themes and repeat. Check the browser console and Network panel.

#### Expected Results
- Closed formulas display typeset superscripts, fractions, integrals, and matrices. Bold, italic, and strikethrough spans containing math retain their formatting without literal emphasis markers. Lists and table cells retain their structure, including a math expression with `|` inside a table cell.
- Incomplete streamed formulas remain readable source text until the closing delimiter arrives. The completed response renders identically after reload.
- Inline and fenced code preserve dollar signs and LaTeX source. Currency remains normal text.
- In the rendered TestChat row, `hrefOk`, `titleOk`, and `textOk` all pass: the file link has href `/codex-local-browse/tmp/TestChat/formula.md`, title `/tmp/TestChat/formula.md`, and visible text `formula.md`.
- The page never overflows horizontally. A long display formula scrolls inside its own container. Math remains legible in both themes.
- KaTeX font resources load from the local application, with no remote CDN request. Streaming rendering creates no duplicate `turn/start` calls; inspect the JSON report for other RPC counts and measured update-to-DOM timings/long tasks.
- The script writes `output/playwright/testchat-math-cjs.json`, `output/playwright/testchat-math-cjs.png`, and light/dark viewport and conversation screenshots for both sizes.

#### Rollback/Cleanup
- Automated checks retain no real Codex data or files under `/tmp/TestChat`; the directory and file link are mock values. Browser contexts close after verification, and the report/screenshots remain under `output/playwright/`.
- Delete any disposable manual test thread after inspection. Leave the isolated 4173 verification server running unless asked to stop it.
- To undo the feature, revert the associated math renderer, conversation integration, stylesheet, dependency, and test changes together.

#### Verification Record (2026-09-12)
- Node 24.21.0, WebUI 0.1.87 source, KaTeX 0.18.7. Browser API/WebSocket responses are stubbed; this verifies rendering, not live Codex compatibility.
- `pnpm_config_verify_deps_before_run=false pnpm run test:unit`: 17 files / 162 tests passed. The local pnpm 11 setting avoids an unrelated automatic reinstall triggered by the repository's older build-script configuration.
- `pnpm_config_verify_deps_before_run=false pnpm run build`: frontend typecheck, Vite production build, and CLI build passed. The existing main-chunk size warning remains.
- CJS smoke: `node -e 'console.log(typeof require("katex").renderToString)'` prints `function`; `node dist-cli/index.js --help` succeeds.
- `node scripts/verify-chat-math.cjs`: all four theme/viewport combinations pass. The 20-update browser measurement reported 6.52 ms average / 9.62 ms maximum update-to-DOM time, no long tasks, and no additional API/RPC calls during those updates.
- Build comparison using identical dependencies: conversation chunk grows by about 80 KB gzip and its CSS by 8 KB gzip; the main JavaScript entry is unchanged in size. KaTeX stays in the existing lazy conversation chunk, and fonts are served locally.
- Node measurement: 960 KB of ordinary text parses in 0.79 ms; 32 KB of mixed math/text in 4.49 ms. A cold formula render takes 7.63 ms; 1,000 cached renders together take 1.27 ms. Timings are local observations, not performance thresholds. Cache entries are bounded to 250 and keyed by formula plus display mode; no cache invalidation on theme changes is needed because the output inherits color.
- Evidence: `output/playwright/testchat-math-cjs.json`, `output/playwright/math-performance-audit.json`, and `output/playwright/math-build.log`.
