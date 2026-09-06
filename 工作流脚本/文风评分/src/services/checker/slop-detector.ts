/**
 * Slop 检测器 v3
 * ============================
 * 基于 slop-rules.ts 的 六类别 × 三级别 统一规则表扫描。
 *
 * 计分公式(每词条独立计算,n=该词条命中次数,x=章字数/10000):
 *   第 1 次:扣 base × x
 *   第 2~n 次:每次扣 base
 *   n ≥ 2 时完全重复额外扣:0.2 × n
 *   base:L1=0.4,L2=0.2,L3=0.1
 *
 * 另有两个独立统计扣分层:句长变异系数、句子级重复率(沿用 v2)。
 */

import {
  CATEGORY_LABELS,
  LEVEL_BASE,
  REPEAT_EXTRA,
  SLOP_RULES,
  detectRepetition,
  type RepetitionSegment,
  type SlopCategory,
  type SlopHit,
  type SlopLevel,
  type SlopReport,
  type SlopRuleDef,
} from "./slop-rules";

// ===================================================================
// 规则预编译
// ===================================================================

interface CompiledWordRule extends SlopRuleDef {
  kind: "word";
}
interface CompiledRegexRule extends SlopRuleDef {
  kind: "regex";
  re: RegExp;
}
type CompiledRule = CompiledWordRule | CompiledRegexRule;

const COMPILED_RULES: readonly CompiledRule[] = SLOP_RULES.map((rule) => {
  if (rule.word !== undefined) return { ...rule, kind: "word" as const };
  return { ...rule, kind: "regex" as const, re: new RegExp(rule.regex!, "g") };
});

/** 轻量扫描用:L1 词条 */
const L1_RULES = COMPILED_RULES.filter((rule) => rule.level === 1);

interface CandidateMatch {
  start: number;
  end: number;
  ruleIndex: number;
}

/**
 * 收集所有候选匹配。字符串规则用 indexOf,正则用 matchAll。
 */
function collectCandidates(text: string, rules: readonly CompiledRule[]): CandidateMatch[] {
  const candidates: CandidateMatch[] = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.kind === "word") {
      const word = rule.word!;
      let idx = 0;
      while ((idx = text.indexOf(word, idx)) !== -1) {
        candidates.push({ start: idx, end: idx + word.length, ruleIndex: i });
        idx += word.length;
      }
    } else {
      const re = new RegExp(rule.re.source, "g");
      for (const m of text.matchAll(re)) {
        candidates.push({ start: m.index!, end: m.index! + m[0].length, ruleIndex: i });
      }
    }
  }
  return candidates;
}

/**
 * 贪心去重:按匹配长度降序接受不重叠的匹配。
 * 保证同一片段只归属一条规则(长词优先),消灭历史跨层双扣问题。
 */
function acceptNonOverlapping(candidates: CandidateMatch[]): CandidateMatch[] {
  const sorted = [...candidates].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.ruleIndex - b.ruleIndex,
  );
  const accepted: CandidateMatch[] = [];
  // 已占用区间(按 start 排序维护)
  for (const cand of sorted) {
    let overlap = false;
    for (const acc of accepted) {
      if (cand.start < acc.end && acc.start < cand.end) {
        overlap = true;
        break;
      }
    }
    if (!overlap) accepted.push(cand);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

/**
 * 对文本执行规则扫描,返回每条规则的命中数及精确位置。
 */
export function scanRules(
  text: string,
  rules: readonly CompiledRule[] = COMPILED_RULES,
): { counts: Map<number, number>; positions: Array<{ start: number; end: number; ruleIndex: number }> } {
  const accepted = acceptNonOverlapping(collectCandidates(text, rules));
  const counts = new Map<number, number>();
  const positions: Array<{ start: number; end: number; ruleIndex: number }> = [];
  for (const m of accepted) {
    counts.set(m.ruleIndex, (counts.get(m.ruleIndex) ?? 0) + 1);
    positions.push(m);
  }
  return { counts, positions };
}

// ===================================================================
// 计分
// ===================================================================

/**
 * 词表计分 = 按级别聚合密度扣分 + 单词重复罚。
 *
 * 密度扣分:
 *   某级别所有词命中数合计 → 密度 x = 合计/(千字)
 *   扣分 = coef × (x − 0.5),x>0.5 才计入,coef:L1=1,L2=0.7,L3=0.4
 *
 * 单词重复罚:
 *   某词命中 count 次,基准 = floor(章字数/3000)(每3000字容1次)
 *   超基准部分每次扣 0.2,单词封顶 1 分。
 */
export function ruleDeduction(
  levelCounts: { [K in SlopLevel]: number },
  charCount: number,
  perWordCounts: Map<number, number>,
): number {
  const coef = (l: SlopLevel) => (l === 1 ? 1 : l === 2 ? 0.7 : 0.4);
  let ded = 0;

  // 密度扣分(按级别聚合)
  for (const level of [1, 2, 3] as SlopLevel[]) {
    if (levelCounts[level] <= 0) continue;
    const x = levelCounts[level] / (charCount / 1000);
    if (x > 0.5) ded += coef(level) * (x - 0.5);
  }

  // 单词重复罚(每条词单独,封顶1)
  const base = Math.floor(charCount / 3000);
  for (const count of perWordCounts.values()) {
    if (count <= base) continue;
    const times = count - base;
    ded += Math.min(times * 0.2, 1);
  }

  return Math.round(ded * 100) / 100;
}

// ===================================================================
// 统计指标
// ===================================================================

function splitSentences(text: string): number[] {
  return text
    .split(/(?:[。!?]|[.…]{6})+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.length);
}

function calcSentenceCV(sentences: number[]): number {
  if (sentences.length < 2) return 0;
  const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
  if (mean === 0) return 0;
  const variance =
    lengths_reduce(sentences, mean) / sentences.length;
  return Math.sqrt(variance) / mean;
}

function lengths_reduce(lengths: number[], mean: number): number {
  return lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0);
}

/** 对话引号(支持中文“”与「」) */
const DLG_RE = /[“"「][^“"「」”"]{1,200}[」”"]/g;

/**
 * 代词密度扣分:统计叙述文本里 "她" 每万字密度(剔除对话)。
 * 她密度 y > 120 时:扣 0.5 + 0.02*(y-120),上限 2 分。
 */
export function calcPronounDeduction(text: string): {
  deduction: number;
  he: number;
  she: number;
} {
  const narr = text.replace(DLG_RE, "");
  const countChar = (ch: string) => {
    let c = 0, i = 0;
    while ((i = narr.indexOf(ch, i)) !== -1) { c++; i += ch.length; }
    return c;
  };
  const den = (n: number) => (n / (narr.length || 1)) * 10000;
  const he = den(countChar("他"));
  const she = den(countChar("她"));
  let deduction = 0;
  if (she > 120) {
    deduction = 0.5 + 0.02 * (she - 120);
    if (deduction > 2) deduction = 2;
  }
  return { deduction, he: Math.round(he * 10) / 10, she: Math.round(she * 10) / 10 };
}

/** 非对话短段率:>0.15 扣 0.5,每多 0.05 多扣 0.5。 */
export function calcShortParaDeduction(text: string): { deduction: number; rate: number } {
  const paras = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const nonDlg = paras.filter((p) => !DLG_RE.test(p));
  if (nonDlg.length === 0) return { deduction: 0, rate: 0 };
  const rate = nonDlg.filter((p) => p.length < 15).length / nonDlg.length;
  let deduction = 0;
  if (rate > 0.15) {
    deduction = 0.5 + Math.ceil((rate - 0.15) / 0.05) * 0.5;
  }
  return { deduction, rate: Math.round(rate * 1000) / 1000 };
}

/** 字符多样性 TTR:不同汉字占比,<0.1 扣 0.5。 */
export function calcTtrDeduction(text: string): { deduction: number; ttr: number } {
  const S = new Set<string>();
  let n = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) { S.add(ch); n++; }
  }
  const ttr = n ? S.size / n : 0;
  const deduction = ttr < 0.1 ? 0.5 : 0;
  return { deduction, ttr: Math.round(ttr * 1000) / 1000 };
}

/** 段首"她":>6 扣 0.5,每多 6 多扣 0.5。 */
export function calcSheStartDeduction(text: string): { deduction: number; perWan: number } {
  let starts = 0;
  for (const p of text.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    if (p.startsWith("她")) starts++;
  }
  const perWan = (starts / (text.length || 1)) * 10000;
  let deduction = 0;
  if (perWan > 6) {
    deduction = 0.5 + Math.ceil((perWan - 6) / 6) * 0.5;
  }
  return { deduction, perWan: Math.round(perWan * 10) / 10 };
}

/**
 * 非对话短句率:剔除引号对话后,按 。！？… 断句(逗号/顿号不分割),
 * 汉字数 ≤6 为短句。短句率 >6% 扣 0.5,每多 3% 再扣 0.5。
 */
export function calcShortSentenceDeduction(text: string): {
  deduction: number;
  rate: number;
} {
  const narr = text.replace(DLG_RE, "");
  const sentences = narr.split(/[。！？!?.…]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (sentences.length === 0) return { deduction: 0, rate: 0 };
  const short = sentences.filter(
    (s) => s.replace(/[^\u4e00-\u9fff]/g, "").length <= 6,
  ).length;
  const rate = short / sentences.length;
  let deduction = 0;
  if (rate > 0.06) {
    deduction = 0.5 + Math.ceil((rate - 0.06) / 0.03) * 0.5;
  }
  return { deduction, rate: Math.round(rate * 1000) / 1000 };
}

// ===================================================================
// 全量扫描(生成完成后执行)
// ===================================================================

export function fullSlopScan(text: string): SlopReport {
  const charCount = text.length;
  const x = charCount / 10000;

  const { counts } = scanRules(text);

  // 按级别聚合命中次数
  const levelCounts = { 1: 0, 2: 0, 3: 0 } as { [K in SlopLevel]: number };
  const perWordCounts = new Map<number, number>();
  const hits: SlopHit[] = [];
  for (const [ruleIndex, count] of counts) {
    const rule = COMPILED_RULES[ruleIndex];
    levelCounts[rule.level] += count;
    perWordCounts.set(ruleIndex, count);
    hits.push({
      ruleId: rule.id,
      category: rule.category,
      level: rule.level,
      token: rule.word ?? `/${rule.regex}/`,
      count,
      deduction: 0,
    });
  }

  const wordPenalty = ruleDeduction(levelCounts, charCount, perWordCounts);

  // --- 句长均匀度 ---
  const sentenceCV = calcSentenceCV(splitSentences(text));
  let cvDeduction = 0;
  if (sentenceCV < 0.4) cvDeduction += 1.0;
  if (sentenceCV > 0.8) cvDeduction += 1.0;

  // --- 重复率 ---
  const rep = detectRepetition(text);

  // --- 代词密度 ---
  const pron = calcPronounDeduction(text);

  // --- 非对话短段率 ---
  const shortPara = calcShortParaDeduction(text);

  // --- TTR ---
  const ttrRes = calcTtrDeduction(text);

  // --- 段首她 ---
  const sheStart = calcSheStartDeduction(text);

  // --- 非对话短句率 ---
  const shortSentence = calcShortSentenceDeduction(text);

  const slopPenalty =
    Math.round(
      Math.min(
        wordPenalty + cvDeduction + rep.deduction + pron.deduction + shortPara.deduction +
        ttrRes.deduction + sheStart.deduction + shortSentence.deduction,
        10,
      ) * 100,
    ) / 100;

  return {
    hits: hits.sort((a, b) => b.deduction - a.deduction),
    charCount,
    x: Math.round(x * 1000) / 1000,
    slopPenalty,
    repetitionRate: rep.rate,
    repetitionDeduction: rep.deduction,
    repetitionSegments: rep.segments,
    sentenceLengthCV: Math.round(sentenceCV * 1000) / 1000,
    pronounDeduction: pron.deduction,
    pronounHeDensity: pron.he,
    pronounSheDensity: pron.she,
    shortParaDeduction: shortPara.deduction,
    shortParaRate: shortPara.rate,
    ttrDeduction: ttrRes.deduction,
    ttr: ttrRes.ttr,
    sheStartDeduction: sheStart.deduction,
    sheStartPerWan: sheStart.perWan,
    shortSentenceDeduction: shortSentence.deduction,
    shortSentenceRate: shortSentence.rate,
  };
}

// ===================================================================
// 流式增量扫描(流式输出期间每 ~1000 字触发)
// ===================================================================

export interface StreamScanState {
  lastFullScanLength: number;
  lastReport: SlopReport | null;
  /** 增量 L1 命中累计(轻量扫描期间持续累积) */
  pendingL1Counts: Map<number, number>;
}

export function createStreamState(): StreamScanState {
  return {
    lastFullScanLength: 0,
    lastReport: null,
    pendingL1Counts: new Map(),
  };
}

/**
 * 流式增量扫描。每 1000 个新增字符做一次全量扫描,
 * 未达阈值时只做 L1 轻量扫描并叠加到上次全量报告上。
 */
export function streamSlopScan(
  fullText: string,
  state: StreamScanState,
): { report: SlopReport; newCharsSinceLastFull: number } {
  const currentLength = fullText.length;
  const newCharsSinceLastFull = currentLength - state.lastFullScanLength;

  const FULL_SCAN_INTERVAL = 1000;
  const newChars = fullText.slice(state.lastFullScanLength).replace(/[^\u4e00-\u9fff]/g, "").length;

  if (newChars >= FULL_SCAN_INTERVAL || !state.lastReport) {
    const report = fullSlopScan(fullText);
    state.lastFullScanLength = currentLength;
    state.lastReport = report;
    state.pendingL1Counts = new Map();
    return { report, newCharsSinceLastFull: currentLength };
  }

  // 轻量增量:只扫 L1 词条的新增部分
  const incrementalText = fullText.slice(state.lastFullScanLength);
  const { counts: incCounts } = scanRules(incrementalText, L1_RULES);
  for (const [idx, c] of incCounts) {
    state.pendingL1Counts.set(idx, (state.pendingL1Counts.get(idx) ?? 0) + c);
  }

  // 在上次全量报告基础上叠加 L1 增量(近似值)
  const base = state.lastReport!;
  const mergedHits = new Map<string, SlopHit>();
  for (const h of base.hits) mergedHits.set(h.ruleId, { ...h });

  const l1ByIndex = new Map<number, CompiledRule>();
  L1_RULES.forEach((rule) => {
    const globalIdx = COMPILED_RULES.indexOf(rule);
    l1ByIndex.set(globalIdx, rule);
  });

  // 按级别重算聚合计数:基础级1=上次报告 L1 词的总命中
  const levelCounts = { 1: 0, 2: 0, 3: 0 } as { [K in SlopLevel]: number };
  for (const [globalIdx, addCount] of state.pendingL1Counts) {
    const rule = l1ByIndex.get(globalIdx)!;
    const existing = mergedHits.get(rule.id);
    const newCount = (existing?.count ?? 0) + addCount;
    levelCounts[1] += newCount;
    mergedHits.set(rule.id, {
      ruleId: rule.id,
      category: rule.category,
      level: rule.level,
      token: rule.word ?? `/${rule.regex}/`,
      count: newCount,
      deduction: 0,
    });
  }
  // 重算词表罚分。L1 之外级别沿用上次总数。
  for (const h of base.hits) {
    if (h.level !== 1) levelCounts[h.level] += h.count;
  }
  const perWordCounts = new Map<number, number>();
  for (const h of base.hits) {
    if (h.level === 1) {
      const gi = COMPILED_RULES.findIndex((r) => r.id === h.ruleId);
      if (gi >= 0) perWordCounts.set(gi, h.count);
    }
  }
  const newWordPenalty = ruleDeduction(levelCounts, base.charCount, perWordCounts);
  const nonWordBase = nonWordParts(base);

  return {
    report: {
      ...base,
      hits: [...mergedHits.values()].sort((a, b) => b.deduction - a.deduction),
      charCount: currentLength,
      slopPenalty: Math.round(Math.min(nonWordBase + newWordPenalty, 10) * 100) / 100,
    },
    newCharsSinceLastFull,
  };
}

/** 提取报告中的非词表统计扣分(CV+重复率+她密度+短段率+TTR+段首她+短句率) */
function nonWordParts(report: SlopReport): number {
  const repD = report.repetitionDeduction;
  const cvD =
    (report.sentenceLengthCV < 0.4 ? 1 : 0) + (report.sentenceLengthCV > 0.8 ? 1 : 0);
  return (
    repD +
    cvD +
    report.pronounDeduction +
    report.shortParaDeduction +
    report.ttrDeduction +
    report.sheStartDeduction +
    report.shortSentenceDeduction
  );
}

// ===================================================================
// 轻量实时高亮扫描(流式输出期间高频调用,~每 200ms)
// ===================================================================

export interface LiveHighlight {
  positions: Array<{ start: number; end: number; token: string }>;
}

export function liveHighlightScan(text: string): LiveHighlight {
  const { positions: accepted } = scanRules(text);
  const positions: LiveHighlight["positions"] = accepted.map((m) => {
    const rule = COMPILED_RULES[m.ruleIndex];
    return {
      start: m.start,
      end: m.end,
      token: rule.word ?? text.slice(m.start, Math.min(m.end, m.start + 25)),
    };
  });

  // --- 精确到句:重复率检测 ---
  const rep = detectRepetition(text);
  if (rep.segments.length > 0) {
    for (const seg of rep.segments) {
      positions.push({
        start: seg.start,
        end: seg.end,
        token: seg.text.length > 25 ? seg.text.slice(0, 25) + "…" : seg.text,
      });
    }
  }

  positions.sort((a, b) => a.start - b.start);
  return { positions };
}

// ===================================================================
// 报告格式化(用于 UI 展示)
// ===================================================================

export interface SlopSummary {
  score: number;
  grade: "优秀" | "良好" | "一般" | "较差" | "很差";
  topIssues: string[];
  totalHits: number;
  repetitionRate: number;
  repetitionDeduction: number;
  repetitionLevel: string;
}

export function summarizeReport(report: SlopReport): SlopSummary {
  const score = 10 - report.slopPenalty;

  let grade: SlopSummary["grade"];
  if (score >= 9) grade = "优秀";
  else if (score >= 7) grade = "良好";
  else if (score >= 5) grade = "一般";
  else if (score >= 3) grade = "较差";
  else grade = "很差";

  const issues = report.hits.map((h) => ({
    count: h.count,
    display: `[${CATEGORY_LABELS[h.category]}·L${h.level}] ${h.token}`,
  }));
  issues.sort((a, b) => b.count - a.count);

  if (report.repetitionDeduction > 0) {
    issues.push({
      count: report.repetitionSegments.length,
      display: `[重复率] ${(report.repetitionRate * 100).toFixed(0)}%(扣${report.repetitionDeduction}分)`,
    });
  }
  if (report.pronounDeduction > 0) {
    issues.push({
      count: 1,
      display: `[她密度] 叙述她${report.pronounSheDensity}/万(扣${report.pronounDeduction}分)`,
    });
  }
  if (report.shortParaDeduction > 0) {
    issues.push({
      count: 1,
      display: `[短段率] ${(report.shortParaRate * 100).toFixed(0)}%(>${report.shortParaDeduction >= 1 ? "20%" : "15%"},扣${report.shortParaDeduction}分)`,
    });
  }
  if (report.ttrDeduction > 0) {
    issues.push({
      count: 1,
      display: `[用字多样性] ${(report.ttr * 100).toFixed(0)}%(<10%,扣${report.ttrDeduction}分)`,
    });
  }
  if (report.sheStartDeduction > 0) {
    issues.push({
      count: 1,
      display: `[段首她] ${report.sheStartPerWan}/万(扣${report.sheStartDeduction}分)`,
    });
  }
  if (report.shortSentenceDeduction > 0) {
    issues.push({
      count: 1,
      display: `[短句率] ${(report.shortSentenceRate * 100).toFixed(0)}%(>6%,扣${report.shortSentenceDeduction}分)`,
    });
  }

  const totalHits = issues.reduce((s, i) => s + i.count, 0);

  let repetitionLevel: string;
  const r = report.repetitionRate;
  if (r <= 0.05) repetitionLevel = "极低";
  else if (r <= 0.15) repetitionLevel = "低";
  else if (r <= 0.3) repetitionLevel = "中";
  else if (r <= 0.5) repetitionLevel = "高";
  else repetitionLevel = "严重";

  return {
    score: Math.round(score * 10) / 10,
    grade,
    topIssues: issues.slice(0, 5).map((i) => `${i.display} (×${i.count})`),
    totalHits,
    repetitionRate: report.repetitionRate,
    repetitionDeduction: report.repetitionDeduction,
    repetitionLevel,
  };
}

export type { SlopCategory, SlopLevel, SlopReport, SlopHit, RepetitionSegment };
