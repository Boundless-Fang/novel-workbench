/**
 * 词表分级统计:对人类原著 vs AI 文本统计每词条命中密度(次/万字)
 * 运行:npx tsx scripts/bench/scan-levels.ts <语料目录>
 */
import fs from "node:fs";
import path from "node:path";
import {
  SLOP_RULES,
} from "../../src/services/checker/slop-rules";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("用法: npx tsx scripts/bench/scan-levels.ts <语料目录>");
  process.exit(1);
}

function readSmart(file: string): string {
  const buf = fs.readFileSync(file);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("gb18030").decode(buf);
  }
}

interface Rule { key: string; layer: string }

const rules: Rule[] = SLOP_RULES.map((rule) => ({
  key: rule.word ?? `/${rule.regex}/`,
  layer: `${rule.category}-L${rule.level}`,
}));

function countRule(text: string, rule: Rule): number {
  if (rule.key.startsWith("/")) {
    const src = rule.key.slice(1, -1);
    try {
      const re = new RegExp(src, "g");
      return [...text.matchAll(re)].length;
    } catch {
      return 0;
    }
  }
  let count = 0, idx = 0;
  while ((idx = text.indexOf(rule.key, idx)) !== -1) { count++; idx += rule.key.length; }
  return count;
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
const docs = files.map((f) => {
  const text = readSmart(path.join(dir, f));
  return { name: f, isAI: /[（(]\s*ai\s*[）)]/i.test(f), text };
});

const humanDocs = docs.filter((d) => !d.isAI);
const aiDocs = docs.filter((d) => d.isAI);
const humanChars = humanDocs.reduce((s, d) => s + d.text.length, 0);
const aiChars = aiDocs.reduce((s, d) => s + d.text.length, 0);
console.log(`人类文本 ${humanDocs.length} 本 ${humanChars} 字 | AI 文本 ${aiDocs.length} 本 ${aiChars} 字\n`);

interface Row {
  key: string; layer: string;
  hHits: number; hDen: number;
  aHits: number; aDen: number;
}

const rows: Row[] = [];
for (const rule of rules) {
  let hHits = 0, aHits = 0;
  for (const d of humanDocs) hHits += countRule(d.text, rule);
  for (const d of aiDocs) aHits += countRule(d.text, rule);
  rows.push({
    key: rule.key, layer: rule.layer,
    hHits, hDen: (hHits / humanChars) * 10000,
    aHits, aDen: (aHits / aiChars) * 10000,
  });
}

function level(r: Row): string {
  const minTotal = 8; // 总命中过少的标记样本不足
  if (r.hHits + r.aHits < minTotal) return "不足";
  const ratio = (r.aDen + 0.01) / (r.hDen + 0.01);
  if (ratio >= 3) return "L1";
  if (ratio <= 1 / 3) return "L3";
  return "L2";
}

// 按 AI 密度/人类密度 比值降序输出
const sorted = [...rows].sort((a, b) => (b.aDen + 0.001) / (b.hDen + 0.001) - (a.aDen + 0.001) / (a.hDen + 0.001));

console.log("词条 | 层 | 人类密度/万 | AI密度/万 | AI/人类比 | 级");
for (const r of sorted) {
  const ratio = ((r.aDen + 0.01) / (r.hDen + 0.01)).toFixed(1);
  console.log(`${r.key} | ${r.layer} | ${r.hDen.toFixed(2)} (${r.hHits}) | ${r.aDen.toFixed(2)} (${r.aHits}) | ${ratio} | ${level(r)}`);
}
