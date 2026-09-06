// 复刻 server.mjs 的 forbiddenLexicon()：从 slop-rules.ts 自动提取禁用词库
const fs = require('fs');
const path = require('path');
const root = 'D:/求职/项目/wenmai-workbench';
const source = fs.readFileSync(path.join(root, '工作流脚本/文风评分/src/services/checker/slop-rules.ts'), 'utf8');
const labels = { psych: '抽象心理', action: '俗套动作', formula: '公式句式', modifier: '空洞修饰', metaphor: '禁用比喻', emotion: '负面情绪' };
const groups = new Map();
const matcher = /\.\.\.(w|r)\("([^"]+)",\s*(\d),\s*\[([\s\S]*?)\]\)/g;
for (const match of source.matchAll(matcher)) {
  const key = `${match[2]} / L${match[3]}`;
  const tokens = [...match[4].matchAll(/"((?:\\.|[^"\\])*)"/g)].map(item => {
    try { return JSON.parse(`"${item[1]}"`); } catch { return item[1]; }
  });
  if (tokens.length) {
    const group = groups.get(key) || { label: labels[match[2]] || match[2], tokens: [] };
    group.tokens.push(...tokens);
    groups.set(key, group);
  }
}
const out = '# 禁用词库\n\n> 从文风评分规则表自动提取；L1、L2、L3 为检测严重度。正则条目以 `/.../` 表示。\n\n'
  + [...groups.entries()].map(([key, group]) => `## ${key}（${group.label}）\n\n${group.tokens.map(t => `- \`${t}\``).join('\n')}`).join('\n\n') + '\n';
fs.writeFileSync(path.join(root, '小说项目/同人-蜀山剑侠传/词汇库/禁用词库.md'), out, 'utf8');
console.log('禁用词库已生成，词条组数:', groups.size, '总词条:', [...groups.values()].reduce((n, g) => n + g.tokens.length, 0));
