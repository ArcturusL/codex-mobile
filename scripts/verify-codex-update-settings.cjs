// Run against an isolated candidate: VERIFY_BASE_URL=http://127.0.0.1:4198 node scripts/verify-codex-update-settings.cjs
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const baseURL = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:4173';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  mkdirSync('output/playwright', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.addInitScript(theme => {
        localStorage.setItem('codex-web-local.ui-language.v1', 'zh-CN');
        localStorage.setItem('codex-web-local.dark-mode.v1', theme);
      }, theme);
      let phase = 'idle';
      let posts = 0;
      let polls = 0;
      let activeRequests = 0;
      let maxActiveRequests = 0;
      let failPoll = false;
      let failUpdate = false;
      let completed = false;
      await page.route('**/codex-api/cli-update*', async route => {
        activeRequests++;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        try {
          if (route.request().method() === 'POST') {
            posts++;
            phase = 'updating';
            await delay(800);
            if (failUpdate) phase = 'failed';
          } else if (phase === 'updating') {
            polls++;
            await delay(500);
            if (failPoll) {
              failPoll = false;
              await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Temporary progress request failure'}) });
              return;
            }
            if (completed) phase = 'complete';
          } else if (route.request().url().includes('check=1')) {
            await delay(800);
          }
          await route.fulfill({
            contentType: 'application/json',
            status: route.request().method() === 'POST' ? 202 : 200,
            body: JSON.stringify({
              currentVersion: phase === 'complete' ? '0.155.0' : '0.153.4', latestVersion: phase === 'complete' ? '0.155.0' : '0.154.0',
              checkedAt: '2026-09-30T00:00:00.000Z', checking: false, updating: phase === 'updating',
              updateAvailable: phase !== 'complete', restartRequired: phase === 'complete',
              error: phase === 'failed' ? 'Codex update failed.' : null,
            }),
          });
        } finally { activeRequests--; }
      });
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await page.locator('.sidebar-settings-button').click();
      const section = page.locator('.codex-update-settings');
      const check = section.locator(':scope > .codex-update-actions button').nth(0);
      const update = section.locator(':scope > .codex-update-actions button').nth(1);
      await expect(update).toBeEnabled();
      await check.click();
      await expect(check).toHaveText('检查中…');
      await expect(check).toHaveText('检查更新');
      await expect(update).toBeEnabled();
      await update.click();
      await expect(update).toHaveText('更新中…');
      // Observe every text mutation, including the POST wait and slower progress requests.
      await section.evaluate(el => {
        window.updateButtonStates = [];
        const capture = () => window.updateButtonStates.push(Array.from(el.querySelectorAll(':scope > .codex-update-actions button'), button => button.textContent.trim()));
        window.updateButtonObserver = new MutationObserver(capture);
        window.updateButtonObserver.observe(el, { subtree: true, childList: true, characterData: true });
        capture();
      });
      await expect.poll(() => polls).toBeGreaterThanOrEqual(2);
      failPoll = true;
      await expect(section.getByRole('alert')).toContainText('Temporary progress request failure');
      await expect(update).toHaveText('更新中…');
      await expect(update).toBeDisabled();
      await expect(check).toBeDisabled();
      await expect(section.getByRole('alert')).toHaveCount(0);
      await page.locator('.sidebar-settings-panel').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(2500);
      await section.screenshot({ path: `output/playwright/codex-update-polling-${theme}.png` });
      const states = await page.evaluate(() => {
        window.updateButtonObserver.disconnect();
        return window.updateButtonStates;
      });
      assert(states.length > 0);
      assert(states.every(state => state[0] === '检查更新' && state[1] === '更新中…'), JSON.stringify(states));
      // Closing and reopening must recover the ongoing job; completion restores the controls.
      await page.locator('.sidebar-settings-button').click();
      await page.locator('.sidebar-settings-button').click();
      await expect(update).toHaveText('更新中…');
      completed = true;
      await expect(section.getByText('v0.155.0', { exact: true })).toBeVisible();
      await expect(update).toHaveText('一键更新');
      await expect(update).toBeDisabled();
      await expect(check).toBeEnabled();
      assert.equal(posts, 1);
      // A failed update must also clear the local submission state and permit retry.
      phase = 'idle';
      failUpdate = true;
      await check.click();
      await expect(update).toBeEnabled();
      await update.click();
      await expect(update).toHaveText('更新中…');
      await expect(section.getByRole('alert')).toContainText('Codex 更新失败。');
      await expect(update).toHaveText('一键更新');
      await expect(update).toBeEnabled();
      assert.equal(posts, 2);
      assert.equal(maxActiveRequests, 1);
      results.push({ theme, polls, posts, maxActiveRequests, stableButtonStates: states.length });
      await page.close();
    }
    console.log(JSON.stringify({ result: 'PASS', baseURL, viewport: '1440x1000', results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
