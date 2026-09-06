/**
 * 临时对比脚本：用 InkFlow 自己的 Slop 文风检测器，
 * 对《超凡都市407》第384章 与 白釉生成文本 分别打分。
 */
import fs from "node:fs";
import { fullSlopScan, summarizeReport } from "../../src/services/checker/slop-detector";
import type { SlopReport } from "../../src/services/checker/slop-rules";

const SRC = "D:\\novel apk\\训练文本\\超凡都市407.txt";
const GEN = "D:\\novel apk\\训练文本\\测试生成_白釉_第1章大婚_风格版_v3_扩写.txt";
const OUT = "D:\\novel apk\\训练文本\\Inkflow文风检测_原著384_vs_生成.txt";

const src = fs.readFileSync(SRC, "utf-8");
const gen = fs.readFileSync(GEN, "utf-8");

// 抽取第384章正文
const chapters = src.split(/(?=　　?第\d+章)/);
let chap = "";
for (const block of chapters) {
  const m = block.match(/^\s*　　?第(\d+)章/);
  if (m && m[1] === "384") {
    chap = block.replace(/^.*?第\d+章.*$/m, "").trim();
    break;
  }
}

function make(report: SlopReport) {
  const sum = summarizeReport(report);
  return {
    score: sum.score,
    grade: sum.grade,
    totalHits: sum.totalHits,
    topIssues: sum.topIssues,
    repetitionRate: report.repetitionRate,
    repetitionDeduction: report.repetitionDeduction,
    sentenceLengthCV: report.sentenceLengthCV,
    slopPenalty: report.slopPenalty,
    tier1Hits: report.tier1Hits.map((h) => ({ token: h.token, count: h.count })),
    tier2Hits: report.tier2Hits.map((h) => ({ token: h.token, count: h.count })),
    tier3Hits: report.tier3Hits.map((h) => ({ token: h.token, count: h.count })),
    fictionTells: report.fictionTells.map((h) => ({ token: h.token, count: h.count })),
    tellingViolations: report.tellingViolations.map((h) => ({ token: h.token, count: h.count })),
    structuralTics: report.structuralTics.map((h) => ({ token: h.token, count: h.count })),
    bannedMetaphors: report.bannedMetaphors.map((h) => ({ token: h.token, count: h.count })),
    bannedMetaphorsAvoid: report.bannedMetaphorsAvoid.map((h) => ({ token: h.token, count: h.count })),
  };
}

const result = {
  engine: "InkFlow fullSlopScan (7层 Slop 检测, 0-10分, 越高越好)",
  original: { name: "超凡都市407_第384章", chars: chap.length, report: make(fullSlopScan(chap)) },
  generated: { name: "白釉_第1章_风格版v3扩写", chars: gen.length, report: make(fullSlopScan(gen)) },
};

fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf-8");
console.log(JSON.stringify(result, null, 2));
