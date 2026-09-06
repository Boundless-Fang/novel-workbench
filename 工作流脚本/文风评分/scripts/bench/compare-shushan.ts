/**
 * 蜀山剑侠传：原著章节 vs 工作台生成第二十一回 的 SLOP 文风对比。
 * 运行：cd 工作流脚本/文风评分 && node --import tsx scripts/bench/compare-shushan.ts
 * 结果写入 ../../_slop_compare.txt（UTF-8）
 */
import fs from "node:fs";
import { fullSlopScan, summarizeReport } from "../../src/services/checker/slop-detector";
import type { SlopReport } from "../../src/services/checker/slop-rules";

const SRC = "D:/求职/项目/wenmai-workbench/蜀山剑侠传前二十回.txt";
const GEN = "D:/求职/项目/wenmai-workbench/小说项目/同人-蜀山剑侠传/正文/第二十一回.txt";
const OUT = "D:/求职/项目/wenmai-workbench/_slop_compare.txt";

const src = fs.readFileSync(SRC, "utf-8");
const gen = fs.readFileSync(GEN, "utf-8");

// 抽取指定回正文：回目标题在全书中出现多次（目录+正文），取最后一次出现
function extractChapter(text: string, numCN: string): string {
  const re = new RegExp(`第[　\\s]*${numCN}[　\\s]*回`, "g");
  let m: RegExpExecArray | null;
  let start = -1;
  while ((m = re.exec(text))) start = m.index;
  if (start < 0) throw new Error(`找不到回目：${numCN}`);
  const body = text.slice(start);
  const nextRe = /第[　\s]*[一二三四五六七八九十]{1,3}[　\s]*回/g;
  nextRe.lastIndex = 10;
  const nm = nextRe.exec(body);
  const chap = nm ? body.slice(0, nm.index) : body;
  return chap.replace(/^.*\n/, "").trim();
}

function report(label: string, text: string) {
  const r = fullSlopScan(text);
  const s = summarizeReport(r);
  return {
    样本: label,
    字数: r.charCount,
    得分: s.score,
    评级: s.grade,
    词条命中: s.totalHits,
    重复率: (r.repetitionRate * 100).toFixed(1) + "%",
    句长变异系数: r.sentenceLengthCV.toFixed(2),
    词条扣分: r.slopPenalty.toFixed(1),
    顶层问题: s.topIssues.slice(0, 6),
  };
}

function tiers(label: string, text: string) {
  const r = fullSlopScan(text);
  const agg = (lvl: number) => {
    const map = new Map<string, number>();
    for (const h of r.hits) if (h.level === lvl) map.set(h.token, (map.get(h.token) || 0) + h.count);
    return [...map.entries()].map(([t, c]) => `${t}×${c}`).join("、") || "无";
  };
  return `【${label}】\n  L1强指纹：${agg(1)}\n  L2：${agg(2)}\n  L3：${agg(3)}\n  重复片段：${r.repetitionSegments?.length ?? 0} 处`;
}

const ch20 = extractChapter(src, "二十");
const ch19 = extractChapter(src, "十九");

const rows = [
  report("原著第十九回（全文）", ch19),
  report("原著第二十回（全文）", ch20),
  report("原著第二十回（截取与AI等长）", ch20.slice(0, gen.replace(/\s/g, "").length)),
  report("AI生成第二十一回", gen),
];

const out = [
  JSON.stringify(rows, null, 2),
  "",
  tiers("原著第二十回", ch20),
  "",
  tiers("AI生成第二十一回", gen),
].join("\n");

fs.writeFileSync(OUT, out, "utf-8");
console.log("written:", OUT);
