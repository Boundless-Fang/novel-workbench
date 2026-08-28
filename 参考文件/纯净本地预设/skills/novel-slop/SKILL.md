---
name: novel-slop
description: Slop 检测（六类三级词表 + 计分/检测器 + 语料评测脚本）。当需要给章节正文做 AI 痕迹/Slop 检测、查六类三级词表、按计分公式给正文打分（0-10 分），或跑 scan-corpus/bench 评测脚本生成表中数字时使用；可与写作流程的 stage4/stage5 配合做文风校验。
---

# Skill: novel-slop（AI 痕迹 · Slop 检测）

## 用途
把 InkFlow 的 Slop 检测器（六类 × 三级词表 + 计分公式 + 语料评测脚本）接入写作模式。
用于：
1. 写作/改稿前自查：避免命中六类 AI 高频词表；
2. 章节完成后打分：按公式算 0-10 分、评级与主要扣分点；
3. 批量评测：对整本书/语料目录跑扫描脚本，生成评测表数字。

## 触发条件
- 用户要求“检查 AI 味 / Slop / 文风检测 / 给这章打分 / 词表查一下”
- `stage4-prose`（正文）写完后做文风自查
- `stage5-validate`（校验）报告需要 SLOP 评分
- 需要生成评测报告（书中数字由脚本实测生成）

## 源文件（InkFlow 工程，只读）
- 规则表：`<inkflow>/src/services/checker/slop-rules.ts`
- 检测器：`<inkflow>/src/services/checker/slop-detector.ts`
- 评测脚本：`<inkflow>/scripts/bench/scan-corpus.ts`、`scan-levels.ts`、`bench-score.ts`
- 现有基准报告：`<inkflow>/scripts/bench/benchmark-report.md`
- 在 InkFlow 工程根下执行（依赖 node_modules 里的 tsx）：
  ```bash
  cd <inkflow>
  npx tsx scripts/bench/scan-corpus.ts <语料目录>
  npx tsx scripts/bench/scan-levels.ts <语料目录>
  npm run bench:score        # 重新生成 benchmark-report.md
  ```

## 一、规则：六类 × 三级词表

六个类别（`CATEGORY_LABELS`）：`psych` 抽象心理、`action` 俗套动作、`formula` 公式句式、`modifier` 空洞修饰、`metaphor` 禁用比喻、`emotion` 负面情绪。

三个级别（依据人类原著 vs AI 文本密度统计标定）：
- **L1** —— AI 高概率 / 人类低概率（强指纹，重罚，base=0.4）
- **L2** —— 介于两者之间（base=0.2）
- **L3** —— 人类高概率 / AI 低概率（轻罚，base=0.1）

词条全库唯一归属、匹配一次只计一次分（长词优先、不重叠）。

完整词条与句式见本 skill 的 `shared/六类三级词表.md`——只在需要查词或自查时按需读取该文件；它与 `<inkflow>/src/services/checker/slop-rules.ts` 不一致时以源文件为准。

## 二、计分 / 检测器（slop-detector.ts）

**计分公式（每词条独立计算）**，`n` = 该词条命中次数，`x` = 章字数 / 10000：
```
第 1 次：扣 base × x
第 2~n 次：每次扣 base
n ≥ 2 时完全重复额外扣：0.2 × n
base：L1=0.4，L2=0.2，L3=0.1
```

**两个独立统计扣分层**：
- 句长变异系数 `CV`：`CV < 0.4` 加扣 1.0；`CV > 0.8` 加扣 1.0（句长过匀或过散都算）
- 句子级重复率（Levenshtein 相似度 ≥70%，每句与后 5 句比较）：
  ```
  rate ≤ 0.10 → 0 分
  rate ≤ 0.25 → (rate-0.1)/0.15 × 2
  rate ≤ 0.50 → 2 + (rate-0.25)/0.25 × 2
  rate > 0.50 → 4 + min((rate-0.5)/0.5, 1) × 2
  ```

**总分**：`slopPenalty = min(词表扣分 + CV 扣分 + 重复率扣分, 10)`；`score = 10 - slopPenalty`。

**评级**：`≥9 优秀`、`≥7 良好`、`≥5 一般`、`≥3 较差`、`<3 很差`。

**报告字段**：`hits[]`（ruleId/category/level/token/count/deduction）、`charCount`、`x`、`slopPenalty`、`repetitionRate`、`repetitionDeduction`、`repetitionSegments`、`sentenceLengthCV`。

**重复率分级**：`≤0.05 极低`、`≤0.15 低`、`≤0.3 中`、`≤0.5 高`、`>0.5 严重`。

**LLM 自查要点**（无脚本环境时人工近似）：
- 把正文过一遍六类词表，按出现次数统计，代入公式粗算；
- 重点看 L1 词条（强指纹）是否清零；
- 句长是否忽长忽短（CV 落 0.4~0.8）；句式是否重复。

## 三、评测脚本（生成表中数字）

### scan-corpus.ts —— 整本书语料扫描
```bash
cd <inkflow>
npx tsx scripts/bench/scan-corpus.ts <语料目录>
```
输出两部分：
1. **全书 Tier 违禁词统计**：每本书字数、命中总数、涉及词种数、Top 词条；
2. **抽样章节完整 Slop 评分**：每本书均匀抽 5 章，`fullSlopScan` + `summarizeReport`，0-10 分、评级、命中数、重复率、扣分点，最后给抽样均分。

### scan-levels.ts —— 词条分级密度统计
```bash
npx tsx scripts/bench/scan-levels.ts <语料目录>
```
对人类原著 vs AI 文本（文件名含 `(ai)` 判 AI）统计每词条命中密度（次/万字），按 AI/人类密度比自动定级（≥3 → L1、≤1/3 → L3、否则 L2）。

### bench-score.ts —— 基准报告
```bash
npm run bench:score
```
对 `scripts/bench/data/chapters`（真实网文）与 `data/ai-samples`（AI 生成）分别打分，重写 `benchmark-report.md`（单篇明细表 / 分组统计表 / 扣分来源对比表）。**报告里所有数字必须由脚本实测生成，不要手写。**

## 四、与写作模式的配合
- **stage4（正文）写完后**：用本 skill 词表自查，L1 词条清零、L3 尽量少；命中项进改稿。
- **stage5（校验）报告**：增加一节“SLOP 评分”，给出 score、评级、Top 扣分点与重复率。

## 检查（必做，检查模型见 novel-conventions skill）
- [ ] L1 词条命中是否为 0（如仍有，列出并给出替换）
- [ ] 报告含 score / 评级 / Top 扣分点 / 重复率
- [ ] 评测表数字来自脚本输出，非手写
- [ ] 若进改稿：替换写法不引入新的 L1 词条
