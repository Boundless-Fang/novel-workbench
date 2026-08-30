/**
 * 中文小说 Slop 检测规则库 v3
 * ============================
 * 六大类别 × 三级严重度,词条全库唯一归属,匹配一次只计一次分。
 *
 * 类别:
 *   psych    抽象心理   —— 模糊/隐喻式心理描写套路
 *   action   俗套动作   —— AI 高频动作/表情/声音/身体模板
 *   formula  公式句式   —— 结构性对偶公式与副词填塞
 *   modifier 空洞修饰   —— 无信息量的程度词/夸张
 *   metaphor 禁用比喻   —— 具体意象黑名单
 *   emotion  负面情绪   —— 情绪名词 + 直述句式
 *
 * 级别(依据人类原著 vs AI 文本密度统计标定):
 *   L1 —— AI 高概率 / 人类低概率(强指纹,重罚)
 *   L2 —— 介于两者之间
 *   L3 —— 人类高概率 / AI 低概率(轻罚,防误伤)
 *
 * 计分公式见 slop-detector.ts 的 ruleDeduction。
 */

// ===== 类型定义 =====

export type SlopCategory =
  | "psych"
  | "action"
  | "formula"
  | "modifier"
  | "metaphor"
  | "emotion";

export type SlopLevel = 1 | 2 | 3;

export interface SlopRuleDef {
  id: string;
  category: SlopCategory;
  level: SlopLevel;
  /** 纯文本匹配(优先,性能好) */
  word?: string;
  /** 正则源(不带 flag,扫描时加 g) */
  regex?: string;
}

export interface SlopHit {
  ruleId: string;
  category: SlopCategory;
  level: SlopLevel;
  /** 命中的词条展示名 */
  token: string;
  count: number;
  /** 该词条本章节扣分 */
  deduction: number;
}

export interface SlopReport {
  hits: SlopHit[];
  /** 本章字数 */
  charCount: number;
  /** 字数/10000,计分缩放系数 */
  x: number;
  /** 总扣分(词表扣分 + 重复率 + 句长CV) */
  slopPenalty: number;
  repetitionRate: number;
  repetitionDeduction: number;
  repetitionSegments: RepetitionSegment[];
  sentenceLengthCV: number;
  /** 代词密度扣分:他/她 每万字密度触发 */
  pronounDeduction: number;
  pronounHeDensity: number;
  pronounSheDensity: number;
  /** 非对话短段率扣分 */
  shortParaDeduction: number;
  shortParaRate: number;
  /** TTR(不同字占比)<0.1 扣分 */
  ttrDeduction: number;
  ttr: number;
  /** 段首"她"密度扣分 */
  sheStartDeduction: number;
  sheStartPerWan: number;
  /** 非对话短句率扣分 */
  shortSentenceDeduction: number;
  shortSentenceRate: number;
}

export const CATEGORY_LABELS: Record<SlopCategory, string> = {
  psych: "抽象心理",
  action: "俗套动作",
  formula: "公式句式",
  modifier: "空洞修饰",
  metaphor: "禁用比喻",
  emotion: "负面情绪",
};

/** 各级别单次基础扣分 */
export const LEVEL_BASE: Record<SlopLevel, number> = { 1: 0.4, 2: 0.2, 3: 0.1 };

/** 完全重复额外扣分(每条命中,出现≥2次时按次数计) */
export const REPEAT_EXTRA = 0.2;

// ===== 规则表 =====

function w(category: SlopCategory, level: SlopLevel, words: string[]): SlopRuleDef[] {
  return words.map((word) => ({ id: `${category}${level}-${word}`, category, level, word }));
}

function r(category: SlopCategory, level: SlopLevel, sources: string[]): SlopRuleDef[] {
  return sources.map((regex) => ({ id: `${category}${level}-/${regex}/`, category, level, regex }));
}

export const SLOP_RULES: readonly SlopRuleDef[] = [
  // ============ ① 抽象心理 ============
  ...w("psych", 1, [
    "说不清道不明", "极为复杂", "复杂的情绪", "心底那根弦", "脑海轰然一声",
    "掠过一丝幽光", "心头某处忽然微微一软", "心跳不自觉地加快了一拍",
    "脑海中不由自主地浮现出", "无法言说", "灵魂出窍",
  ]),
  ...r("psych", 1, [
    "一股.{1,6}涌上心头",
    "心中涌[起现].{1,8}",
    "心中充满了.{2,8}",
  ]),
  ...w("psych", 2, ["灵魂深处", "思维停滞", "一片空白"]),
  ...r("psych", 2, [
    "说不出.{2,10}",
    "一种说不出的.{2,10}",
    "大脑一片空白",
    "脑海一片空白",
    "心底升[起腾]",
    "理智的弦(?:断了|崩塌|崩断|断裂)",
  ]),
  ...r("psych", 3, ["莫名的.{2,10}"]),

  // ============ ② 俗套动作 ============
  ...w("action", 1, [
    "垂下眼睫", "停了一瞬", "指节泛白", "双手攥紧", "一声压抑", "咬着下唇",
    "偏过头去", "风中轻轻拂动", "修长白嫩的", "两瓣肥嫩的", "耳尖悄悄染上",
    "鼻尖一酸", "睫毛轻轻一颤", "咽回喉中", "溢出的轻哼", "尾音上扬",
    "身子发软", "连抬一根手指的力气都没有", "把脸偏向一侧", "肩头轻轻发抖",
    "手指蜷紧又松开", "十根玉指在后颈交扣", "倒吸一口凉气", "带着哭腔",
    "唇角那抹笑意", "沉默了片刻", "仰头发出一声", "轰然炸开", "瞳孔骤然收缩",
    "破碎", "炸开", "浑身酥软",
  ]),
  ...r("action", 1, [
    "碧蓝(?:的)?(?:眸子|眼睛|眼眸|双眼)",
    "将脸埋[入在].{2,15}",
    "声音(?:沙哑|嘶哑|哽咽|颤抖)",
    "(?:深深|深吸)一口气",
    "心头一(?:颤|震|暖|凉|紧|痛)",
    "声音轻[得地]像是",
    "猛地.{1,4}炸开",
    "眼角(?:泛红|微红|发红)",
    "眼尾(?:红晕|泛红|微红)",
    "(?:脸颊|面颊|脸上)浮起.{1,6}红晕",
    "喉间像是被什么东西堵住",
    "(?:浑身|整个人)酥软",
  ]),
  ...w("action", 2, ["低下头", "目光一凝"]),
  ...r("action", 2, [
    "身子一(?:僵|颤|软)",
    "嘴角上(?:扬|弯)",
    "停顿了?一瞬",
  ]),
  ...w("action", 3, ["如释重负", "嘴角微微上扬"]),
  ...r("action", 3, [
    "(?:松了|舒了|叹了)一口气",
    "瞪大了(?:眼睛|双眼|眼眸)",
    "睁大了(?:双眼|眼睛|眼眸)",
  ]),

  // ============ ③ 公式句式 ============
  ...w("formula", 1, ["不受控制地", "不由自主地"]),
  ...r("formula", 1, [
    "她的声音.{2,15}",
    "带上了一丝.{2,10}",
    "空气中弥漫着.{1,10}",
    "整个人都.{2,6}",
    "下意识地.{1,4}",
    "(?:仿佛)?不是.{1,30}而是",
    "那不是\\S{2,20}也不是\\S{2,20}(?:而是|而是一种)",
    "(?:仿佛)?不是.{2,15},?也不是.{2,15},?而是一种",
  ]),
  ...r("formula", 2, [
    "带着一丝.{2,10}",
    "没有一丝.{2,10}",
    "闪过一丝.{2,10}",
    "与其说.{2,30}不如说",
    "这(?:它)?是一种.{2,20}也是一种",
    "这(?:不仅|不只)是一种\\S{2,15}也是一种\\S{2,15}",
    "这(?:像)?是一场.{2,20}",
    "带着一种.{2,20}(?:的)?(?:感觉|意味|气息)",
    "充满了.{2,10}的(?:气息|味道|感觉)",
    "出于.{2,15}(?:的本能|的考虑|的想法)",
    "为了.{2,15}而(?:狠狠|用力|拼命|猛然)",
    "因为.{2,20}而(?:不由得|忍不住|下意识)",
    "沉默(?:弥漫开来|如死一般|在两人之间蔓延)",
    "或许这就是.{2,10}吧",
    "仿佛整个世界都",
    "时间仿佛凝固了",
    "诉说着.{2,15}的故事",
    "(?:仿佛|好像)(?:在诉说|在讲述|在述说|在宣告)",
    "仿佛(?:是|在).{2,15}(?:的洗礼|的仪式|的献祭)",
    "带着不容置疑的语气",
    "不容置疑的.{1,5}语气",
    "那不是.{2,10}那只是",
    "他(?:她)?不是.{2,10}他(?:她)?是",
    "(?:他|她)从来没有.{2,15}他(?:她)?只是",
    "鬼使神差地.{1,4}",
  ]),
  ...r("formula", 3, [
    "不由得.{1,4}(?:地)?",
    "不禁.{1,4}(?:地)?",
    "(?:不仅|不只是|不仅仅是)\\S{2,15}(?:更是|还是|而是|也)\\S{2,15}",
  ]),

  // ============ ④ 空洞修饰 ============
  ...w("modifier", 1, ["剧烈地", "猛烈地", "无助地", "不容置疑的"]),
  ...w("modifier", 2, [
    "极致的", "难以言喻的", "疯狂地", "流淌", "猛烈的", "不可思议的",
    "绝望地", "残忍地", "极致地", "极度地", "爆炸性的", "爆炸性地",
    "无法形容地", "难以言喻地", "彻底地", "不可思议地",
  ]),
  ...w("modifier", 3, [
    "疯狂的", "下意识的", "巨大的", "彻底的", "蕴含", "承载", "本能的",
    "无法形容的", "机械的", "机械地", "机器般的", "令人窒息的", "孤注一掷的",
    "狂风骤雨般", "带有侵略性的", "带有惩罚性的", "无助的", "极度的",
    "剧烈的", "灭顶的", "直达灵魂",
  ]),
  ...r("modifier", 3, ["毁灭性的(?:冲刺|力量|撞击)"]),

  // ============ ⑤ 禁用比喻 ============
  ...w("metaphor", 1, [
    "最锋利的冰锥", "破布娃娃", "淬了毒", "待宰的", "重型卡车", "行驶的列车",
    "山崩地裂", "攻城锤", "砧板上", "离了水的鱼", "一盆冰水", "一把重锤",
    "被抽去骨头", "祭品",
  ]),
  ...r("metaphor", 1, [
    "断了线的(?:木偶|人偶|布?娃娃)",
    "(?:像|如|如同|宛若)(?:破布|布)?娃娃",
    "(?:像|如)(?:个)?(?:断了线|破|坏)(?:的)?(?:木偶|人偶|布?娃娃)",
    "濒死的(?:鱼|人)",
    "被抛上岸的鱼",
    "空白的(?:大脑|思维)",
    "(?:如|像)飓风",
    "(?:如|像)牲畜",
    "(?:如|像)子弹",
    "(?:如|像)炮弹",
    "(?:如|像)信徒",
    "燎原的(?:火|烈火)",
    "(?:声音|嗓子|喉咙|身体)破碎",
    "破碎的(?:声音|嗓音|呻吟|身体)",
    "(?:如|像|如同)(?:撞击|撞[上击])",
  ]),
  ...w("metaphor", 2, [
    "容器", "催化剂", "催情药", "拉风箱", "攻城略地", "开疆拓土",
    "小兽", "毒刺", "船桨", "划船", "羽毛", "虔诚的",
  ]),
  ...r("metaphor", 2, [
    "掠夺(?!者)",
    "每一个毛孔都在叫嚣",
    "五脏六腑都错了位",
    "烟花(?:般)?(?:炸开|绽放|爆开|般灿烂)",
    "(?:如|像|如同)(?:机器|机械)",
    "(?:如|像)溺水",
  ]),
  ...w("metaphor", 3, [
    "火山爆发", "岩浆", "海藻", "娃娃", "木偶", "人偶", "毒蛇", "小船", "火星",
  ]),

  // ============ ⑥ 负面情绪 ============
  ...w("emotion", 1, [
    "献祭", "恩典", "悲壮", "毛骨悚然", "诡谲", "毁灭性", "四肢百骸",
  ]),
  ...w("emotion", 2, [
    "痛苦", "恐惧", "撕裂", "厌恶", "尖叫", "恶心", "诡异", "恶毒", "麻木",
    "绝望", "惨叫", "剧痛", "毁灭", "污秽", "恶意", "麻痹", "脊椎", "青紫",
    "作呕", "不似人声", "凄惨", "厌弃", "苦痛", "恐怖",
    "激动地", "紧张地", "愤怒地", "悲伤地", "恐惧地", "焦虑地",
    "羞耻地", "骄傲地", "幽幽地",
  ]),
  ...r("emotion", 2, [
    "(?:他|她|男主|女主|女人|男人|少女)(?:感到|觉得|很|非常|十分|极其)\\S{0,4}(?:愤怒|悲伤|恐惧|兴奋|紧张|焦虑|绝望|厌恶|痛苦|麻木)",
    "她觉得.{3,20}",
    "她感受到.{3,20}",
    "(?:他|她)心里(?:充满了|满是|只剩下)",
  ]),
];

// ===================================================================
// 中文文本重复率检测 v2(句子级 Levenshtein)
// ===================================================================

/** 高重复片段 */
export interface RepetitionSegment {
  start: number;
  end: number;
  text: string;
  /** 与该句最相似的匹配句相似度 */
  overlapRatio: number;
}

/**
 * Levenshtein 编辑距离
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/**
 * 句子级重复检测(Levenshtein 相似度)。
 * 每句话与后面最多 5 句话比较,相似度 ≥70% 即标记。
 */
export function detectRepetition(text: string): {
  segments: RepetitionSegment[];
  rate: number;
  deduction: number;
} {
  const SENTENCE_SPLIT = /[。！?]|\.{6,}/;
  const rawParts = text.split(SENTENCE_SPLIT);

  const sentenceInfos: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;
  for (const raw of rawParts) {
    const rawLen = raw.length;
    while (cursor < text.length && SENTENCE_SPLIT.test(text[cursor])) {
      cursor++;
    }
    const trimmed = raw.trim();
    if (trimmed.length >= 4) {
      sentenceInfos.push({ start: cursor, end: cursor + rawLen, text: trimmed });
    }
    cursor += rawLen;
  }

  const totalSentences = sentenceInfos.length;
  if (totalSentences < 2) {
    return { segments: [], rate: 0, deduction: 0 };
  }

  const SIMILARITY_THRESHOLD = 0.7;
  const LOOK_AHEAD = 5;
  const matchedIndices = new Set<number>();

  for (let i = 0; i < totalSentences; i++) {
    const a = sentenceInfos[i];
    const limit = Math.min(i + 1 + LOOK_AHEAD, totalSentences);
    for (let j = i + 1; j < limit; j++) {
      const b = sentenceInfos[j];
      const dist = levenshteinDistance(a.text, b.text);
      const maxLen = Math.max(a.text.length, b.text.length);
      const similarity = 1 - dist / maxLen;
      if (similarity >= SIMILARITY_THRESHOLD) {
        matchedIndices.add(i);
        matchedIndices.add(j);
      }
    }
  }

  if (matchedIndices.size === 0) {
    return { segments: [], rate: 0, deduction: 0 };
  }

  const sorted = [...matchedIndices].sort((a, b) => a - b);
  const segments: RepetitionSegment[] = [];
  let segStart = sorted[0];
  let segEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] <= segEnd + 1) {
      segEnd = sorted[i];
    } else {
      const s = sentenceInfos[segStart];
      const e = sentenceInfos[segEnd];
      segments.push({
        start: s.start,
        end: e.end,
        text: text.slice(s.start, e.end),
        overlapRatio: 0.7,
      });
      segStart = sorted[i];
      segEnd = sorted[i];
    }
  }
  const s = sentenceInfos[segStart];
  const e = sentenceInfos[segEnd];
  segments.push({
    start: s.start,
    end: e.end,
    text: text.slice(s.start, e.end),
    overlapRatio: 0.7,
  });

  // 扣分映射
  const rate = matchedIndices.size / totalSentences;
  let deduction: number;
  if (rate <= 0.1) {
    deduction = 0;
  } else if (rate <= 0.25) {
    deduction = ((rate - 0.1) / 0.15) * 2;
  } else if (rate <= 0.5) {
    deduction = 2 + ((rate - 0.25) / 0.25) * 2;
  } else {
    deduction = 4 + Math.min((rate - 0.5) / 0.5, 1) * 2;
  }

  return {
    segments,
    rate: Math.round(rate * 10000) / 10000,
    deduction: Math.round(deduction * 100) / 100,
  };
}
