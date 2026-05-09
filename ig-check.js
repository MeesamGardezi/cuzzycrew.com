'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto('https://www.instagram.com/sharikh_naveed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const count = await page.evaluate(() => {
    // Try meta description
    const meta = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');
    if (meta) return meta.getAttribute('content');
    return document.title;
  });

  console.log('meta/title:', count);
  await browser.close();
})().catch(e => console.error(e.message));
