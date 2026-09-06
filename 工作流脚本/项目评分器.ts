/** 当前小说专用的 SLOP 评分入口：词表只来自项目的 词汇库/禁用词库.md。 */
import { existsSync, readFileSync } from "node:fs";
import { fullSlopScan, ruleDeduction, scanRules } from "./文风评分/src/services/checker/slop-detector";

type ProjectRule = { id:string; category:string; level:1|2|3; word?:string; regex?:string; kind:"word"|"regex"; re?:RegExp };

const [prosePath, lexiconPath] = process.argv.slice(2);
if (!prosePath || !lexiconPath || !existsSync(prosePath)) throw new Error("用法：项目评分器 <正文文件> <禁用词库>");

function termsFromLexicon(source:string): ProjectRule[] {
  let category = "项目禁用词", level:1|2|3 = 2, index = 0;
  const rules:ProjectRule[] = [];
  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const heading = raw.match(/^##\s+(.+?)(?:\s*\/\s*L([123]))?(?:（.*）)?\s*$/);
    if (heading) { category = heading[1].trim(); level = (Number(heading[2]) || 2) as 1|2|3; continue; }
    const item = raw.match(/^\s*[-*]\s+(?:`([^`]+)`|(.+?))\s*$/);
    if (!item) continue;
    const token = (item[1] || item[2] || "").trim();
    if (!token || token.startsWith("#") || token.startsWith(">")) continue;
    const id = `project-${index++}`;
    if (/^\/.+\/[gimsuy]*$/.test(token)) {
      const end = token.lastIndexOf("/");
      try { rules.push({ id, category, level, regex:token.slice(1, end), kind:"regex", re:new RegExp(token.slice(1, end), token.slice(end + 1).replace(/[^gimsuy]/g, "") || "g") }); } catch { /* 无效正则不进入评分 */ }
    } else rules.push({ id, category, level, word:token, kind:"word" });
  }
  return rules;
}

function wordPenalty(text:string, rules:ProjectRule[]) {
  const { counts } = scanRules(text, rules as any);
  const levels:{1:number;2:number;3:number} = {1:0,2:0,3:0};
  for (const [index, count] of counts) levels[rules[index].level] += count;
  return { deduction:ruleDeduction(levels, text.length, counts), counts };
}

const text = readFileSync(prosePath, "utf8");
const lexicon = existsSync(lexiconPath) ? readFileSync(lexiconPath, "utf8") : "";
const projectRules = termsFromLexicon(lexicon);
const base = fullSlopScan(text);
const globalRules = base.hits.map((hit, index) => hit.token.startsWith("/") ? ({ id:`global-${index}`, category:hit.category, level:hit.level, regex:hit.token.slice(1, -1), kind:"regex", re:new RegExp(hit.token.slice(1, -1), "g") }) : ({ id:`global-${index}`, category:hit.category, level:hit.level, word:hit.token, kind:"word" })) as ProjectRule[];
const globalDeduction = wordPenalty(text, globalRules).deduction;
const project = wordPenalty(text, projectRules);
const penalty = Math.round(Math.min(Math.max(0, base.slopPenalty - globalDeduction + project.deduction), 10) * 100) / 100;
const score = Math.round((10 - penalty) * 10) / 10;
const grade = score >= 9 ? "优秀" : score >= 7 ? "良好" : score >= 5 ? "一般" : score >= 3 ? "较差" : "很差";
const hits = [...project.counts.entries()].map(([index,count]) => ({ rule:projectRules[index], count })).sort((a,b) => b.count - a.count);
console.log(`项目专用 SLOP 评分｜得分=${score.toFixed(1)} (${grade})｜字数=${text.length}`);
console.log(`禁用词库：${lexiconPath}｜有效规则=${projectRules.length}｜词表扣分=${project.deduction.toFixed(2)}`);
console.log(`文风评分非词表检测：重复率=${(base.repetitionRate * 100).toFixed(1)}%｜总扣分=${penalty.toFixed(2)}`);
if (hits.length) console.log("项目禁用词命中：" + hits.slice(0, 15).map(({rule,count}) => `[${rule.category}·L${rule.level}] ${rule.word ?? `/${rule.regex}/`} ×${count}`).join("；"));
else console.log("项目禁用词命中：无");
