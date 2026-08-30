import { CheckResult, CheckerType } from "../../types/checker";
import { checkDuplicate } from "./duplicate";
import { checkBanned } from "./banned";
import { checkOpening } from "./opening";
import { fullSlopScan, summarizeReport, type SlopSummary } from "./slop-detector";

export { fullSlopScan, summarizeReport };
export type { SlopSummary };
export { streamSlopScan, createStreamState, liveHighlightScan } from "./slop-detector";
export type { StreamScanState, LiveHighlight } from "./slop-detector";
export type { SlopReport, SlopHit, RepetitionSegment } from "./slop-rules";
export { detectRepetition } from "./slop-rules";

export interface CheckerReport {
  allPassed: boolean;
  results: CheckResult[];
}

/**
 * 执行全部已启用的检测
 */
export function runAllChecks(text: string): CheckerReport {
  const results: CheckResult[] = [
    checkDuplicate(text),
    checkBanned(text),
    checkOpening(text),
  ];
  return {
    allPassed: results.every((r) => r.passed),
    results,
  };
}

/**
 * 执行单项检测
 */
export function runCheck(text: string, type: CheckerType): CheckResult {
  switch (type) {
    case "duplicate": return checkDuplicate(text);
    case "banned": return checkBanned(text);
    case "opening": return checkOpening(text);
    default: return { type, passed: true, message: "" };
  }
}

// ============ 从 StyleSync-Novel f7_llm_text_validation.py 借鉴 ============

/**
 * 字数校验 — 检查输出是否达到最低字数要求
 */
export function validateWordCount(text: string, minWords: number): CheckResult {
  const count = text.length;
  if (count < minWords) {
    return {
      passed: false,
      type: "banned", // 暂时复用类型
      message: `字数过少 (${count}字)，未达到 ${minWords} 字标准`,
    };
  }
  return { passed: true, type: "banned", message: `字数校验通过 (${count}字)` };
}

/**
 * 结构校验 — 检查输出是否包含必要的结构标记
 * 从 StyleSync-Novel f7 的结构检测模式借鉴
 */
export function validateStructure(
  text: string,
  requiredHeaders: string[],
): CheckResult {
  const missing = requiredHeaders.filter((h) => !text.includes(h));
  if (missing.length > 0) {
    return {
      passed: false,
      type: "banned",
      message: `缺少必要结构: ${missing.join(", ")}`,
    };
  }
  return { passed: true, type: "banned", message: "结构校验通过" };
}
