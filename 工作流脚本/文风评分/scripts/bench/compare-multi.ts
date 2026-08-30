/**
 * 临时对比脚本：用 InkFlow Slop 检测器扫描多个原著章节 + 白釉生成文本。
 */
import fs from "node:fs";
import { fullSlopScan, summarizeReport } from "../../src/services/checker/slop-detector";
import type { SlopReport } from "../../src/services/checker/slop-rules";

const SRC = "D:\\novel apk\\训练文本\\超凡都市407.txt";
const GEN = "D:\\novel apk\\训练文本\\测试生成_白釉_第1章大婚_风格版_v3_扩写.txt";
const OUT = "D:\\novel apk\\训练文本\\Inkflow文风检测_多章对比.txt";

const src = fs.readFileSync(SRC, "utf-8");
const gen = fs.readFileSync(GEN, "utf-8");

// 解析所有章节
const chapters: Array<{ no: number; text: string }> = [];
for (const block of src.split(/(?=　　?第\d+章)/)) {
  const m = block.match(/^\s*　　?第(\d+)章/);
  if (m) {
    chapters.push({ no: Number(m[1]), text: block.replace(/^.*?第\d+章.*$/m, "").trim() });
  }
}

function summarize(report: SlopReport) {
  const sum = summarizeReport(report);
  return {
    score: sum.score,
    grade: sum.grade,
    totalHits: sum.totalHits,
    topIssues: sum.topIssues.slice(0, 3),
    repetitionRate: Number(report.repetitionRate.toFixed(3)),
    sentenceLengthCV: report.sentenceLengthCV,
    slopPenalty: report.slopPenalty,
  };
}

// 固定分层 + 伪随机12章
const fixed = [1, 100, 200, 300];
const chosenNos = new Set<number>(fixed);
let seed = 42;
while (chosenNos.size < 16) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const no = chapters[seed % chapters.length].no;
  chosenNos.add(no);
}

const origScores: number[] = [];
const rows: any[] = [];
for (const no of [...chosenNos].sort((a, b) => a - b)) {
  const ch = chapters.find((c) => c.no === no)!;
  const r = fullSlopScan(ch.text);
  const s = summarize(r);
  origScores.push(s.score);
  rows.push({ chapter: no, chars: ch.text.length, ...s });
}

const genReport = fullSlopScan(gen);
const genSummary = summarize(genReport);

function stats(nums: number[]) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    n: nums.length,
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    min: Number(Math.min(...nums).toFixed(2)),
    max: Number(Math.max(...nums).toFixed(2)),
  };
}

const result = {
  engine: "InkFlow fullSlopScan（0-10，越高越干净）",
  generated: {
    name: "白釉_第1章_风格版v3扩写",
    chars: gen.length,
    ...genSummary,
  },
  original_sample: {
    chapters: rows,
    stats: stats(origScores),
    note: "固定抽取第1/100/200/300章 + 伪随机补12章，共16章",
  },
};

fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf-8");
console.log(JSON.stringify(result, null, 2));
