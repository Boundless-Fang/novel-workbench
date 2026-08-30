/**
 * 文本相似度计算工具
 * 用于【新功能】重复检索 — 检测 AI 输出是否与已有内容重复
 */

/**
 * 计算两个字符串的编辑距离 (Levenshtein Distance)
 * 使用滚动两行数组，内存 O(min(m,n))；a 始终为较短的字符串。
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length > b.length) return levenshteinDistance(b, a);
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;

  let prev = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;

  for (let j = 1; j <= n; j++) {
    const curr = new Array<number>(m + 1);
    curr[0] = j;
    const bj = b[j - 1];
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === bj ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
    }
    prev = curr;
  }
  return prev[m];
}

// 相似度比较的长度上限：Levenshtein 是 O(m*n)，
// 长文本（如整章小说）全文比较会冻结 UI 甚至内存溢出，故截取前缀比较
const MAX_COMPARE_LENGTH = 3000;

/**
 * 基于编辑距离计算相似度 (0~1, 1 表示完全相同)
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const aa = a.length > MAX_COMPARE_LENGTH ? a.slice(0, MAX_COMPARE_LENGTH) : a;
  const bb = b.length > MAX_COMPARE_LENGTH ? b.slice(0, MAX_COMPARE_LENGTH) : b;
  const dist = levenshteinDistance(aa, bb);
  const maxLen = Math.max(aa.length, bb.length);
  return 1 - dist / maxLen;
}

/**
 * 生成 n-gram (默认 bigram) 集合，用于加速相似度比较
 */
export function getNGrams(text: string, n: number = 2): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i <= text.length - n; i++) {
    grams.add(text.slice(i, i + n));
  }
  return grams;
}

/**
 * Jaccard 相似度 (基于 n-gram 集合)
 */
export function jaccardSimilarity(a: string, b: string, n: number = 2): number {
  const aGrams = getNGrams(a, n);
  const bGrams = getNGrams(b, n);

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection++;
  }

  const union = aGrams.size + bGrams.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 局部重复检测：在单段文字中查找重复片段
 * 使用滑动窗口（10字符），8/10以上相同即标记
 * 返回重复区间数组 [{ start, end }]
 */
export function findLocalDuplicates(text: string): { start: number; end: number }[] {
  const WINDOW = 10;
  const MIN_MATCH = 8;
  if (text.length < WINDOW * 2) return [];

  const duplicates = new Set<number>();
  const seen = new Map<string, number[]>();

  // 滑动窗口
  for (let i = 0; i <= text.length - WINDOW; i++) {
    const window = text.slice(i, i + WINDOW);
    // 使用窗口内容自身的排序作为粗指纹
    const sorted = window.split("").sort().join("");

    if (seen.has(sorted)) {
      const positions = seen.get(sorted)!;
      for (const prevPos of positions) {
        // 精确比较：相同位置字符数
        let matches = 0;
        for (let k = 0; k < WINDOW; k++) {
          if (text[prevPos + k] === text[i + k]) matches++;
        }
        if (matches >= MIN_MATCH && Math.abs(i - prevPos) >= WINDOW) {
          // 标记两个窗口的所有字符
          for (let k = 0; k < WINDOW; k++) {
            duplicates.add(prevPos + k);
            duplicates.add(i + k);
          }
        }
      }
      positions.push(i);
    } else {
      seen.set(sorted, [i]);
    }
  }

  // 合并连续区间
  const sorted = [...duplicates].sort((a, b) => a - b);
  const ranges: { start: number; end: number }[] = [];
  let rangeStart = -1;
  let rangeEnd = -1;
  for (const idx of sorted) {
    if (rangeStart === -1) {
      rangeStart = idx;
      rangeEnd = idx;
    } else if (idx <= rangeEnd + 1) {
      rangeEnd = idx;
    } else {
      ranges.push({ start: rangeStart, end: rangeEnd + 1 });
      rangeStart = idx;
      rangeEnd = idx;
    }
  }
  if (rangeStart !== -1) {
    ranges.push({ start: rangeStart, end: rangeEnd + 1 });
  }

  return ranges;
}
