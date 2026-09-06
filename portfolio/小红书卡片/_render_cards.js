const path = require('path');
const { chromium } = require('D:/求职/简历/工具/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1800 }, deviceScaleFactor: 1 });
  await page.goto('file:///D:/求职/项目/wenmai-workbench/portfolio/小红书卡片/_cards.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500); // 等字体与图片
  for (const id of ['card1', 'card4', 'card5']) {
    const el = await page.$('#' + id);
    await el.screenshot({ path: `D:/求职/项目/wenmai-workbench/portfolio/小红书卡片/新-${id}.png` });
    console.log('rendered', id);
  }
  await browser.close();
})();
