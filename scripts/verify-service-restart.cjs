// Isolated candidate only: VERIFY_BASE_URL=http://127.0.0.1:4200 node scripts/verify-service-restart.cjs
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:4200';
(async () => {
 fs.mkdirSync('output/playwright', { recursive: true });
 const browser = await chromium.launch();
 const results = [];
 try {
  for (const theme of ['light', 'dark']) {
   const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
   await page.addInitScript(theme => {
    localStorage.setItem('codex-web-local.ui-language.v1', 'zh-CN');
    localStorage.setItem('codex-web-local.dark-mode.v1', theme);
   }, theme);
   let posts = [], phase = 'idle', instanceId = 'before', activeThreads = 2, networkFailure = false;
   await page.route('**/codex-api/service-restart', async route => {
    if (route.request().method() === 'POST') {
     const body = route.request().postDataJSON(); posts.push(body); assert.equal(body.confirmed, true);
     phase = body.action === 'wait' ? 'waiting' : body.action === 'force' ? 'restarting' : 'idle';
    }
    if (networkFailure) { await route.abort(); return; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available: true, instanceId, phase, activeThreads, busyRequests: 0, error: null }) });
   });
   await page.goto(base);
   const draft = page.locator('.thread-composer-input');
   await draft.fill('UNSENT_RESTART_DRAFT');
   await page.locator('.sidebar-settings-button').click();
   const restart = page.locator('.service-restart-button');
   await expect(restart).toBeEnabled();
   await restart.click();
   const dialog = page.getByRole('dialog', { name: '重启服务', exact: true });
   await expect(dialog).toBeVisible();
   await expect(dialog).toContainText('正在进行的对话: 2');
   assert.equal(posts.length, 0);
   await dialog.getByRole('button', { name: 'Close', exact: true }).or(dialog.getByRole('button', { name: '关闭', exact: true })).click();
   assert.equal(posts.length, 0);
   await restart.click();
   await dialog.getByRole('button', { name: '等待完成后重启', exact: true }).click();
   await expect(dialog).toContainText('正在等待对话完成');
   await page.waitForTimeout(2300);
   await dialog.screenshot({ path: `output/playwright/service-restart-wait-${theme}.png` });
   await dialog.getByRole('button', { name: '取消重启', exact: true }).click();
   await expect(dialog.getByRole('button', { name: '等待完成后重启', exact: true })).toBeEnabled();
   await dialog.getByRole('button', { name: '立即重启…', exact: true }).click();
   await expect(dialog).toContainText('当前任务会被中断');
   assert.equal(posts.length, 2);
   await page.waitForTimeout(2300);
   await dialog.screenshot({ path: `output/playwright/service-restart-confirm-${theme}.png` });
   await dialog.getByRole('button', { name: '确认立即重启', exact: true }).click();
   await expect(dialog).toContainText('正在保存对话并重启');
   networkFailure = true;
   await expect(page.locator('.service-restart-message')).toContainText('等待服务恢复连接');
   networkFailure = false; instanceId = 'after'; phase = 'idle'; activeThreads = 0;
   await expect(page.locator('.service-restart-message')).toContainText('服务已重启');
   await expect(draft).toHaveValue('UNSENT_RESTART_DRAFT');
   assert.deepEqual(posts.map(p => p.action), ['wait', 'cancel', 'force']);
   results.push({ theme, confirmations: true, wait: true, cancel: true, force: true, reconnect: true, draftRetained: true });
   await page.close();
  }
  console.log(JSON.stringify({ passed: true, base, viewport: '1440x1000', results }, null, 2));
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
