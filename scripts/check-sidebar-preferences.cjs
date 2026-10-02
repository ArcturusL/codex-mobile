const { chromium, expect } = require('@playwright/test');
(async () => {
 require('node:fs').mkdirSync('output/playwright', {recursive:true});
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:4173');
 const skills = page.locator('.sidebar-skills-link').filter({hasText:'Skills'});
 const automations = page.locator('.sidebar-skills-link').filter({hasText:'Automations'});
 await expect(skills).toBeVisible(); await expect(automations).toBeVisible();
 await page.locator('.sidebar-settings-button').click();
 await page.getByRole('switch',{name:'Show Skills tab',exact:true}).click();
 await expect(skills).toHaveCount(0); await expect(automations).toBeVisible();
 await page.getByRole('switch',{name:'Show Automations tab',exact:true}).click();
 await expect(automations).toHaveCount(0);
 await page.reload();
 await expect(skills).toHaveCount(0); await expect(automations).toHaveCount(0);
 await page.locator('.sidebar-settings-button').click();
 for(const name of ['Show Skills tab','Show Automations tab']) {
   await expect(page.getByRole('switch',{name,exact:true})).toHaveAttribute('aria-checked','false');
   await page.getByRole('switch',{name,exact:true}).click();
 }
 await expect(skills).toBeVisible(); await expect(automations).toBeVisible();
 const gap = await page.locator('.chats-section').evaluate(el=>getComputedStyle(el).marginTop);
 expect(gap).toBe('60px');
 for(const theme of ['light','dark']) {
   await page.emulateMedia({colorScheme:theme});
   await page.waitForTimeout(2200);
   await page.screenshot({path:`output/playwright/sidebar-${theme}.png`});
 }
 console.log('PASS: independent switches, reload persistence, restore tabs, 60px spacing, light/dark (1440x1000). Preview has no backend; chat loading was not tested.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
