// 【新功能】检测器类型定义

/** 检测规则类型 */
export type CheckerType = "duplicate" | "banned" | "opening" | "slop";

/** 检测规则 */
export interface CheckerRule {
  id: string;
  type: CheckerType;
  enabled: boolean;
  // 重复检索
  similarityThreshold?: number; // 默认 0.8
  // 禁用词检索
  bannedWords?: string[]; // 禁用词列表
  // 开头检索
  openingText?: string; // 指定开头文本
}

/** 检测结果 */
export interface CheckResult {
  passed: boolean;
  type: CheckerType;
  message: string;
  details?: string;
}

/** 检测器配置状态 */
export interface CheckerState {
  rules: CheckerRule[];
}
