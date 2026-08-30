// 知识库持久化 — knowledgeStore 自带 IndexedDB 持久化
// 本文件提供导入导出工具

import { useKnowledgeStore } from "../../store/knowledgeStore";

export function exportKnowledgeToJson(): string {
  const items = useKnowledgeStore.getState().items;
  return JSON.stringify(items, null, 2);
}

export function importKnowledgeFromJson(json: string): void {
  const items = JSON.parse(json);
  const store = useKnowledgeStore.getState();
  for (const item of items) {
    store.addItem(item);
  }
}
