// 提示词模板持久化 — promptStore 自带 IndexedDB 持久化
// 本文件提供导入导出工具

import { usePromptStore } from "../../store/promptStore";

export function exportPromptsToJson(): string {
  const all = usePromptStore.getState().getAll();
  return JSON.stringify(all, null, 2);
}

export function importPromptsFromJson(json: string): void {
  const items = JSON.parse(json);
  const store = usePromptStore.getState();
  for (const item of items) {
    store.create(item);
  }
}
