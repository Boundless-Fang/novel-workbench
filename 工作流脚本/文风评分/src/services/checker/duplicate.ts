import { CheckResult } from "../../types/checker";
import { useCheckerStore } from "../../store/checkerStore";
import { useKnowledgeStore } from "../../store/knowledgeStore";
import { useChatStore } from "../../store/chatStore";
import { similarity, jaccardSimilarity } from "../../utils/similarity";
import { getMessageTextContent } from "../../utils/text";

/**
 * 【新功能】重复检索
 * 检测 AI 输出是否与已有内容高度重复
 */
export function checkDuplicate(text: string): CheckResult {
  const { rules } = useCheckerStore.getState();
  const rule = rules.find((r) => r.type === "duplicate" && r.enabled);
  if (!rule) {
    return { passed: true, type: "duplicate", message: "重复检索已禁用" };
  }

  const threshold = rule.similarityThreshold ?? 0.8;

  // 收集所有已有内容
  const existingTexts: string[] = [];

  // 知识库内容
  const knowledgeItems = useKnowledgeStore.getState().items;
  for (const item of knowledgeItems) {
    existingTexts.push(item.content);
  }

  // 当前会话已有 AI 回复
  const messages = useChatStore.getState().getMessages();
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.content) {
      existingTexts.push(getMessageTextContent(msg));
    }
  }

  // 分批比较（先 Jaccard 预筛选，再精确相似度）
  for (const existing of existingTexts) {
    // 快速预检：Jaccard 相似度
    const jaccard = jaccardSimilarity(text, existing, 3);
    if (jaccard < threshold - 0.2) continue;

    // 精确比较
    const sim = similarity(text, existing);
    if (sim >= threshold) {
      return {
        passed: false,
        type: "duplicate",
        message: `重复率过高 (${(sim * 100).toFixed(1)}%)`,
        details: existing.slice(0, 100),
      };
    }
  }

  return { passed: true, type: "duplicate", message: "无重复" };
}
