const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/求职/简历/工具/node_modules/playwright');

const OUT = 'D:/求职/项目/wenmai-workbench/_shots/xhs';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click('text=同人-蜀山剑侠传');
  await page.waitForTimeout(2000);

  async function shotTab(tab, file, out, extra = 0) {
    try {
      await page.click(`text=${tab}`, { timeout: 3000 });
      await page.waitForTimeout(600);
      await page.click(`text=${file}`, { timeout: 5000 });
      await page.waitForTimeout(1200 + extra);
      await page.screenshot({ path: path.join(OUT, out) });
      console.log('done', out);
    } catch (e) { console.log('skip', out, e.message.slice(0, 80)); }
  }

  // 覆盖主视觉：正文打开 + 侧栏章节
  await shotTab('正文', '第二十一回.txt', 'cover-app.png', 500);
  // 提示词：锚点 / 台词 / 校验报告
  await shotTab('提示词', '强制设定锚点.md', 'anchor.png');
  await shotTab('提示词', '台词.md', 'dialogue.png');
  await shotTab('提示词', '校验报告.md', 'validate.png');
  // 知识库：角色名单 / 世界观
  await shotTab('知识库', '角色名单.md', 'roster.png');
  await shotTab('知识库', '世界观.md', 'worldview.png');
  // 词汇库：专属词库
  await shotTab('词汇库', '专属词库.md', 'vocab.png');
  // 提取：原文风格
  await shotTab('提取', '原文风格.md', 'style.png');

  // 新建小说弹窗
  try {
    await page.click('text=新建小说', { timeout: 3000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'new-project.png') });
    console.log('done new-project.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) { console.log('skip new-project', e.message.slice(0, 80)); }

  await browser.close();
  console.log('all done');
})();
