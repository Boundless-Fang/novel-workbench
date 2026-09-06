const path = require('path');
let chromium;
try { chromium = require('D:/求职/简历/工具/node_modules/playwright').chromium; }
catch { chromium = require('playwright').chromium; }

const OUT = 'D:/求职/项目/wenmai-workbench/_shots';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 打开项目
  await page.click('text=同人-蜀山剑侠传');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '01-工作流总览.png') });
  console.log('shot 01 done');

  // 提示词 tab → 校验报告
  try {
    await page.click('text=提示词', { timeout: 3000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, '02-提示词文件列表.png') });
    await page.click('text=校验报告.md', { timeout: 5000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '03-校验报告.png') });
    console.log('shot 03 done');
  } catch (e) { console.log('校验报告截图失败:', e.message.slice(0, 120)); }

  // 正文 tab → 第二十一回
  try {
    await page.click('text=正文', { timeout: 3000 });
    await page.waitForTimeout(800);
    await page.click('text=第二十一回.txt', { timeout: 5000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '04-正文.png') });
    console.log('shot 04 done');
  } catch (e) { console.log('正文截图失败:', e.message.slice(0, 120)); }

  // 知识库 tab → 角色名单
  try {
    await page.click('text=知识库', { timeout: 3000 });
    await page.waitForTimeout(800);
    await page.click('text=角色名单.md', { timeout: 5000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '05-角色名单.png') });
    console.log('shot 05 done');
  } catch (e) { console.log('角色名单截图失败:', e.message.slice(0, 120)); }

  await browser.close();
  console.log('all done');
})();
