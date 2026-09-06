const path = require('path');
const { chromium } = require('D:/求职/简历/工具/node_modules/playwright');
const OUT = 'D:/求职/项目/wenmai-workbench/_shots/refit';
const PORT = 'http://127.0.0.1:4173';

async function clickTab(page, tab, file, wait = 1000) {
  await page.click(`text=${tab}`, { timeout: 4000 });
  await page.waitForTimeout(500);
  await page.click(`text=${file}`, { timeout: 5000 });
  await page.waitForTimeout(wait);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(PORT, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click('text=同人-蜀山剑侠传');
  await page.waitForTimeout(1800);

  // 补 1920 组：05 新建小说弹窗
  await page.click('text=新建小说', { timeout: 4000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '05-新建小说.png') });
  console.log('05');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.close();

  // 1280 组
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await p2.goto(PORT, { waitUntil: 'load', timeout: 30000 });
  await p2.waitForTimeout(1200);
  await p2.click('text=同人-蜀山剑侠传');
  await p2.waitForTimeout(1500);

  await clickTab(p2, '正文', '第二十一回.txt');
  await p2.screenshot({ path: path.join(OUT, 'workbench-1920x1080.png') }); console.log('wb-1080');
  await p2.screenshot({ path: path.join(OUT, 'workbench-chapter.png') }); console.log('wb-chapter');

  await clickTab(p2, '提示词', '配置.md');
  await p2.screenshot({ path: path.join(OUT, 'workbench-config.png') }); console.log('wb-config');
  await p2.screenshot({ path: path.join(OUT, 'workbench-structured-config.png') }); console.log('wb-sconfig');

  await p2.click('text=设置', { timeout: 4000 }); await p2.waitForTimeout(800);
  await p2.screenshot({ path: path.join(OUT, 'workbench-settings.png') }); console.log('wb-settings');
  await p2.keyboard.press('Escape'); await p2.waitForTimeout(500);
  await p2.click('text=设置', { timeout: 4000 }); await p2.waitForTimeout(700);
  await p2.click('text=预设', { timeout: 3000 }); await p2.waitForTimeout(600);
  await p2.screenshot({ path: path.join(OUT, 'workbench-presets.png') }); console.log('wb-presets');
  await p2.keyboard.press('Escape'); await p2.waitForTimeout(500);
  await p2.click('text=新建小说', { timeout: 4000 }); await p2.waitForTimeout(700);
  await p2.screenshot({ path: path.join(OUT, 'workbench-new-project.png') }); console.log('wb-new');

  await browser.close();
  console.log('ALL DONE');
})();
