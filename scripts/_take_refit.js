const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/求职/简历/工具/node_modules/playwright');

const OUT = 'D:/求职/项目/wenmai-workbench/_shots/refit';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 'http://127.0.0.1:4173';

async function shoot(browser, vp, name, actions) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await page.goto(PORT, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click('text=同人-蜀山剑侠传');
  await page.waitForTimeout(1800);
  await actions(page);
  await browser.close();
}

async function clickTab(page, tab, file, wait = 1000) {
  await page.click(`text=${tab}`, { timeout: 4000 });
  await page.waitForTimeout(500);
  await page.click(`text=${file}`, { timeout: 5000 });
  await page.waitForTimeout(wait);
}

async function openSettings(page, tab) {
  await page.click('div:has-text("设置") >> nth=-1', { timeout: 3000 }).catch(async () => {
    await page.click('text=设置', { timeout: 3000 });
  });
  await page.waitForTimeout(700);
  if (tab) { await page.click(`text=${tab}`, { timeout: 3000 }); await page.waitForTimeout(600); }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch { browser = await chromium.launch({ headless: true }); }

  // ===== 1920x1080 组（实机截图 01-08）=====
  await shoot(browser, { width: 1920, height: 1080 }, '1920', async (page) => {
    // 01 首页主视觉：正文打开
    await clickTab(page, '正文', '第二十一回.txt');
    await page.screenshot({ path: path.join(OUT, '01-首页主视觉.png') }); console.log('01');

    // 02 页面设计：世界观打开
    await clickTab(page, '知识库', '世界观.md');
    await page.screenshot({ path: path.join(OUT, '02-页面设计.png') }); console.log('02');

    // 03 初始化流程：角色名单（初始化产物）
    await clickTab(page, '知识库', '角色名单.md');
    await page.screenshot({ path: path.join(OUT, '03-初始化流程.png') }); console.log('03');

    // 04 单章生成：校验报告
    await clickTab(page, '提示词', '校验报告.md');
    await page.screenshot({ path: path.join(OUT, '04-单章生成.png') }); console.log('04');

    // 07 结构化配置：配置.md
    await clickTab(page, '提示词', '配置.md');
    await page.screenshot({ path: path.join(OUT, '07-结构化配置.png') }); console.log('07');

    // 05/06/08：设置弹窗三个 tab
    await page.click('text=设置', { timeout: 4000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, '08-模型设置.png') }); console.log('08');
    await page.click('text=预设', { timeout: 3000 }); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, '06-流程预设.png') }); console.log('06');
    // 05 新建小说弹窗
    await page.click('text=取消', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.click('text=新建小说', { timeout: 3000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, '05-新建小说.png') }); console.log('05');
  });

  // ===== 1280x720 组（workbench-*）=====
  const b2p = async (browser) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(PORT, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.click('text=同人-蜀山剑侠传');
    await page.waitForTimeout(1500);
    return page;
  };
  let page = await b2p(browser);
  await clickTab(page, '正文', '第二十一回.txt');
  await page.screenshot({ path: path.join(OUT, 'workbench-1920x1080.png') }); console.log('wb-1080');
  await page.screenshot({ path: path.join(OUT, 'workbench-chapter.png') }); console.log('wb-chapter');

  await clickTab(page, '提示词', '配置.md');
  await page.screenshot({ path: path.join(OUT, 'workbench-config.png') }); console.log('wb-config');
  await page.screenshot({ path: path.join(OUT, 'workbench-structured-config.png') }); console.log('wb-sconfig');

  await clickTab(page, '提示词', '校验报告.md');
  await page.screenshot({ path: path.join(OUT, 'workbench-settings.png'), clip: undefined }); console.log('wb-settings(背景)');

  await page.click('text=设置', { timeout: 4000 }); await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'workbench-settings.png') }); console.log('wb-settings');
  await page.click('text=预设', { timeout: 3000 }); await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'workbench-presets.png') }); console.log('wb-presets');
  await page.click('text=取消', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400);
  await page.click('text=新建小说', { timeout: 3000 }); await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'workbench-new-project.png') }); console.log('wb-new');

  await browser.close();
  console.log('ALL DONE');
})();
