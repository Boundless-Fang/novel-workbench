/**
 * 扫描外部语料目录：Tier1 违禁词统计 + 抽章完整 Slop 评分
 * 运行：npx tsx scripts/bench/scan-corpus.ts <语料目录>
 */
import fs from "node:fs";
import path from "node:path";
import { SLOP_RULES } from "../../src/services/checker/slop-rules";
import { fullSlopScan, summarizeReport } from "../../src/services/checker/slop-detector";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("用法: npx tsx scripts/bench/scan-corpus.ts <语料目录>");
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

const WORD_RULES = SLOP_RULES.filter((r) => r.word !== undefined).map((r) => r.word!);

function countHits(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const word of WORD_RULES) {
    let count = 0;
    let idx = 0;
    while ((idx = text.indexOf(word, idx)) !== -1) {
      count++;
      idx += word.length;
    }
    if (count > 0) map.set(word, count);
  }
  return map;
}

function splitChapters(text: string): { title: string; text: string }[] {
  const re = /^第[0-9一二三四五六七八九十百千零两]+章.*$/gm;
  const marks: { i: number; t: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) marks.push({ i: m.index, t: m[0].trim().slice(0, 30) });
  if (marks.length === 0) return [{ title: "(无章节标记)", text }];
  const out: { title: string; text: string }[] = [];
  for (let k = 0; k < marks.length; k++) {
    const start = marks[k].i + marks[k].t.length;
    const end = k + 1 < marks.length ? marks[k + 1].i : text.length;
    out.push({ title: marks[k].t, text: text.slice(start, end) });
  }
  return out;
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));

console.log("===== 一、全书 Tier1 违禁词统计 =====\n");
const corpusTexts: { name: string; text: string }[] = [];
for (const f of files) {
  const text = readSmart(path.join(dir, f));
  corpusTexts.push({ name: f, text });
  const hits = countHits(text);
  const total = [...hits.values()].reduce((a, b) => a + b, 0);
  console.log(`《${f}》 字数=${text.length} 命中总数=${total} 涉及词种数=${hits.size}`);
  const sorted = [...hits.entries()].sort((a, b) => b[1] - a[1]);
  for (const [w, c] of sorted.slice(0, 15)) console.log(`   ${w}: ${c}`);
  if (sorted.length > 15) console.log(`   ...(其余 ${sorted.length - 15} 个词略)`);
  console.log("");
}

console.log("===== 二、抽样章节完整 Slop 评分 =====");
console.log("(每本书均匀抽 5 章，7 层检测，0-10 分，越高越好)\n");

for (const { name, text } of corpusTexts) {
  const chapters = splitChapters(text);
  const picks: typeof chapters = [];
  if (chapters.length <= 5) {
    picks.push(...chapters);
  } else {
    const step = chapters.length / 5;
    for (let k = 0; k < 5; k++) picks.push(chapters[Math.floor(k * step)]);
  }
  console.log(`《${name}》 共 ${chapters.length} 章`);
  let sum = 0;
  for (const ch of picks) {
    const report = fullSlopScan(ch.text);
    const s = summarizeReport(report);
    sum += s.score;
    console.log(
      `   [${ch.title}] 字数=${ch.text.length} 得分=${s.score.toFixed(1)} (${s.grade}) 命中=${s.totalHits} 重复率=${(s.repetitionRate * 100).toFixed(1)}% 扣分点: ${s.topIssues.slice(0, 3).join("；") || "—"}`,
    );
  }
  console.log(`   → 抽样均分 ${((sum / picks.length) || 0).toFixed(2)}\n`);
}
