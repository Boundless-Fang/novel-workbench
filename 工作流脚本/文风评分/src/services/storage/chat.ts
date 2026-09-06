// 对话持久化 — 使用 chatStore 自带 IndexedDB 持久化，此文件提供额外工具方法
import { useChatStore } from "../../store/chatStore";

export function exportChatToFile(sessionId: string): string {
  const state = useChatStore.getState();
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return "";
  return JSON.stringify(session, null, 2);
}

export function importChatFromFile(json: string): void {
  const session = JSON.parse(json);
  const store = useChatStore.getState();
  store.newSession();
}
