/**
 * 工程基准测试 ①：质量评分分布
 * =================================
 * 对 scripts/bench/data/ 下的真实网文章节与 AI 生成样本分别执行
 * 7 层 Slop 评分，输出分布统计。
 *
 * 运行：npm run bench:score
 * 依赖：仅本地纯函数，零 API 成本。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fullSlopScan, summarizeReport } from "../../src/services/checker/slop-detector";
import { CATEGORY_LABELS, type SlopCategory, type SlopReport } from "../../src/services/checker/slop-rules";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const REPORT_FILE = path.join(__dirname, "benchmark-report.md");

interface Sample {
  group: "真实网文" | "AI生成";
  name: string;
  text: string;
  report: SlopReport;
}

function loadGroup(dir: string, group: Sample["group"]): Sample[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), "utf-8");
      return { group, name: f.replace(/\.txt$/, ""), text, report: fullSlopScan(text) };
    });
}

function scoreOf(s: Sample): number {
  return summarizeReport(s.report).score;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 汇总某组样本每类别命中的总次数(用于"扣分来源 Top 表") */
function aggregateLayerHits(samples: Sample[]): Array<{ label: string; count: number }> {
  const categories: SlopCategory[] = ["psych", "action", "formula", "modifier", "metaphor", "emotion"];
  return categories
    .map((cat) => ({
      label: CATEGORY_LABELS[cat],
      count: samples.reduce(
        (sum, s) => sum + s.report.hits.filter((h) => h.category === cat).reduce((a, h) => a + h.count, 0),
        0,
      ),
    }))
    .sort((a, b) => b.count - a.count);
}

function buildReport(samples: Sample[]): string {
  const real = samples.filter((s) => s.group === "真实网文");
  const ai = samples.filter((s) => s.group === "AI生成");

  const lines: string[] = [];
  lines.push("# InkFlow 工程基准报告 ①：质量评分分布");
  lines.push("");
  lines.push(`- 生成时间：${new Date().toLocaleString("zh-CN")}`);
  lines.push("- 评分引擎：7 层 × 11 项加权 Slop 检测（`fullSlopScan`，0-10 分，越高越好）");
  lines.push(`- 样本：真实网文 ${real.length} 篇 / AI 生成 ${ai.length} 篇`);
  lines.push("- 本报告所有数字均由脚本实测生成，可复现：`npm run bench:score`");
  lines.push("");

  // ==== 每篇明细 ====
  lines.push("## 单篇评分明细");
  lines.push("");
  lines.push("| 分组 | 样本 | 字数 | 得分 | 评级 | 命中总数 | 重复率 | 主要扣分点 |");
  lines.push("|------|------|------|------|------|----------|--------|-----------|");
  for (const s of samples) {
    const sum = summarizeReport(s.report);
    lines.push(
      `| ${s.group} | ${s.name} | ${s.text.length} | ${sum.score.toFixed(1)} | ${sum.grade} | ${sum.totalHits} | ${(sum.repetitionRate * 100).toFixed(1)}% | ${sum.topIssues.slice(0, 2).join("；") || "—"} |`,
    );
  }
  lines.push("");

  // ==== 分组统计 ====
  lines.push("## 分组统计");
  lines.push("");
  lines.push("| 指标 | 真实网文 | AI 生成 |");
  lines.push("|------|----------|---------|");
  lines.push(`| 样本数 | ${real.length} | ${ai.length} |`);
  lines.push(`| 平均分 | ${mean(real.map(scoreOf)).toFixed(2)} | ${mean(ai.map(scoreOf)).toFixed(2)} |`);
  lines.push(`| 中位数 | ${median(real.map(scoreOf)).toFixed(2)} | ${median(ai.map(scoreOf)).toFixed(2)} |`);
  lines.push(`| 最低分 | ${Math.min(...real.map(scoreOf)).toFixed(1)} | ${Math.min(...ai.map(scoreOf)).toFixed(1)} |`);
  lines.push(`| 最高分 | ${Math.max(...real.map(scoreOf)).toFixed(1)} | ${Math.max(...ai.map(scoreOf)).toFixed(1)} |`);
  lines.push(`| 平均命中数 | ${mean(real.map((s) => summarizeReport(s.report).totalHits)).toFixed(1)} | ${mean(ai.map((s) => summarizeReport(s.report).totalHits)).toFixed(1)} |`);
  lines.push(`| 平均重复率 | ${(mean(real.map((s) => s.report.repetitionRate)) * 100).toFixed(1)}% | ${(mean(ai.map((s) => s.report.repetitionRate)) * 100).toFixed(1)}% |`);
  lines.push("");

  // ==== 扣分来源 ====
  lines.push("## 扣分来源对比（各层累计命中次数）");
  lines.push("");
  const realLayers = aggregateLayerHits(real);
  const aiLayers = aggregateLayerHits(ai);
  const allLabels = [...new Set([...realLayers.map((l) => l.label), ...aiLayers.map((l) => l.label)])];
  lines.push("| 检测层 | 真实网文 | AI 生成 |");
  lines.push("|--------|----------|---------|");
  for (const label of allLabels) {
    const r = realLayers.find((l) => l.label === label)?.count ?? 0;
    const a = aiLayers.find((l) => l.label === label)?.count ?? 0;
    lines.push(`| ${label} | ${r} | ${a} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("> 说明：真实网文为公开发布的章节样本（仅本地使用，不入库）；AI 生成样本为带有典型 AI 写作病句的合成文本。");
  lines.push("");

  return lines.join("\n");
}

// ========== 主流程 ==========
const samples: Sample[] = [
  ...loadGroup(path.join(DATA_DIR, "chapters"), "真实网文"),
  ...loadGroup(path.join(DATA_DIR, "ai-samples"), "AI生成"),
];

if (samples.length === 0) {
  console.error("[X] scripts/bench/data/ 下没有找到测试文本");
  console.error("    请将真实章节放入 data/chapters/，AI 样本放入 data/ai-samples/");
  process.exit(1);
}

const report = buildReport(samples);
fs.writeFileSync(REPORT_FILE, report, "utf-8");
console.log(report);
console.log(`\n[OK] 报告已写入 ${REPORT_FILE}`);
