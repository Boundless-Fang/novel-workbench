import { CheckResult } from "../../types/checker";
import { useCheckerStore } from "../../store/checkerStore";

/**
 * 【新功能】开头检索
 * 检测 AI 输出是否以指定开头文本开始
 */
export function checkOpening(text: string): CheckResult {
  const { rules } = useCheckerStore.getState();
  const rule = rules.find((r) => r.type === "opening" && r.enabled);
  if (!rule || !rule.openingText) {
    return { passed: true, type: "opening", message: "开头检索已禁用或无规则" };
  }

  const trimmedText = text.trimStart();
  const trimmedOpening = rule.openingText.trim();

  if (!trimmedText.startsWith(trimmedOpening)) {
    return {
      passed: false,
      type: "opening",
      message: `输出未以指定开头开始`,
      details: `期望: "${trimmedOpening.slice(0, 50)}..."`,
    };
  }

  return { passed: true, type: "opening", message: "开头符合要求" };
}
