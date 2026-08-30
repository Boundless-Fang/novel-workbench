/**
 * 中文数字工具 — 从 StyleSync-Novel useProject.js 借鉴
 * 支持中文数字 ↔ 阿拉伯数字 互转，章节名解析
 */

// ============ 中文数字 → 阿拉伯数字 ============

const CN_MAP: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

const CN_UNITS: Record<string, number> = {
  十: 10, 百: 100, 千: 1000, 万: 10000,
};

export function chineseToNumber(cn: string): number {
  let result = 0;
  let tmp = 0;

  for (let i = 0; i < cn.length; i++) {
    const char = cn[i];
    if (CN_UNITS[char] !== undefined) {
      const unit = CN_UNITS[char];
      if (tmp === 0 && unit === 10) tmp = 1;
      result += tmp * unit;
      tmp = 0;
    } else {
      tmp = CN_MAP[char] || 0;
    }
  }
  result += tmp;
  return result;
}

// ============ 阿拉伯数字 → 中文数字 ============

const CN_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function numberToChinese(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return String(num);
  if (num < 10) return CN_DIGITS[num];
  if (num < 20) return num === 10 ? "十" : `十${CN_DIGITS[num % 10]}`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ""}`;
  }
  return String(num);
}

// ============ 章节名解析 ============

/**
 * 从章节名提取章节序号
 * 支持: "第1章", "chapter_3", "第X章_title"
 */
export function getChapterNumber(name: string): number {
  // 阿拉伯数字
  const arabicMatch = name.match(/\d+/);
  if (arabicMatch) return parseInt(arabicMatch[0]);

  // 中文数字
  const cnMatch = name.match(/第([零一二两三四五六七八九十百千万]+)[章回节卷]/);
  if (cnMatch) return chineseToNumber(cnMatch[1]);

  return 999999; // 无法解析的排最后
}

/**
 * 格式化章节标题为 "第X章"
 */
export function formatChapterLabel(name: string): string {
  const cleanName = name.replace(/\.txt$/, "");
  const legacyMatch = cleanName.match(/^chapter_(\d+)(?:_(.+))?$/i);
  if (legacyMatch) {
    const num = parseInt(legacyMatch[1], 10);
    const suffix = legacyMatch[2] ? `_${legacyMatch[2]}` : "";
    return `第${numberToChinese(num)}章${suffix}`;
  }
  const arabicMatch = cleanName.match(/^第(\d+)章(?:_(.+))?$/);
  if (arabicMatch) {
    const num = parseInt(arabicMatch[1], 10);
    const suffix = arabicMatch[2] ? `_${arabicMatch[2]}` : "";
    return `第${numberToChinese(num)}章${suffix}`;
  }
  return cleanName;
}
