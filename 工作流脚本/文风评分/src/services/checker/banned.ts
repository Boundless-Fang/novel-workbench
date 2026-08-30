import { CheckResult } from "../../types/checker";
import { useCheckerStore } from "../../store/checkerStore";

/**
 * 【新功能】禁用词检索 — 增强版
 * 从 StyleSync-Novel useChat.js 借鉴：
 * - 支持逗号/换行分隔的禁用词列表转正则
 * - 支持全局 + 本地禁用词合并
 * - 返回匹配位置和命中次数
 */

export function buildForbiddenRegex(globalWords: string[], localWords: string[]): RegExp | null {
  const allWords = [...new Set([...globalWords, ...localWords])].filter(Boolean);
  if (allWords.length === 0) return null;
  // 按长度降序排列，避免短词先匹配
  allWords.sort((a, b) => b.length - a.length);
  const escaped = allWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(${escaped.join("|")})`, "gi");
}

export function checkBanned(text: string): CheckResult {
  const { rules } = useCheckerStore.getState();
  const rule = rules.find((r) => r.type === "banned" && r.enabled);
  if (!rule || !rule.bannedWords?.length) {
    return { passed: true, type: "banned", message: "禁用词检索已禁用或无规则" };
  }

  const regex = buildForbiddenRegex(rule.bannedWords, []);
  if (!regex) {
    return { passed: true, type: "banned", message: "未设禁用词" };
  }

  const matches = [...text.matchAll(regex)];
  if (matches.length > 0) {
    const found = [...new Set(matches.map((m) => m[0]))];
    return {
      passed: false,
      type: "banned",
      message: `发现 ${found.length} 个禁用词 (命中 ${matches.length} 次)`,
      details: found.slice(0, 10).join(", "),
    };
  }

  return { passed: true, type: "banned", message: "未发现禁用词" };
}

/**
 * 流式扫描禁用词
 * 从 StyleSync-Novel 借鉴：增量扫描，只在新增文本块中匹配
 * 返回新命中位置集合
 */
export function streamScanBanned(
  currentText: string,
  lastScannedIndex: number,
  bannedWords: string[],
): { newIndices: number[]; totalHits: number; lastScannedIndex: number } {
  const regex = buildForbiddenRegex(bannedWords, []);
  if (!regex || currentText.length === 0) {
    return { newIndices: [], totalHits: 0, lastScannedIndex: currentText.length };
  }

  // 向前回退 200 字符，防止边界截断漏检
  const scanStart = Math.max(0, lastScannedIndex - 200);
  const testBlock = currentText.slice(scanStart);

  const newIndices: number[] = [];
  const matches = [...testBlock.matchAll(regex)];
  for (const match of matches) {
    newIndices.push(scanStart + match.index!);
  }

  const endIndex = currentText.length;
  return { newIndices, totalHits: newIndices.length, lastScannedIndex: endIndex };
}

/**
 * 容忍度检测：命中次数超阈值时返回 true
 * 从 StyleSync-Novel 借鉴用于流式阻断
 */
export function checkForbiddenTolerance(totalHits: number, tolerance: number): boolean {
  return totalHits >= tolerance;
}
