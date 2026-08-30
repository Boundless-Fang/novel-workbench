import { useCallback, useState, useRef } from "react";
import { useChatStore } from "../store/chatStore";
import { useSettingsStore } from "../store/settingsStore";
import { runAllChecks } from "../services/checker";
import type { CheckResult } from "../types/checker";

export function useChat() {
  const [isLoading, setIsLoading] = useState(false);
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const lastResultRef = useRef<string>("");

  const sendMessage = useCallback(
    async (input: string, prefixText?: string, suffixText?: string) => {
      if (!input.trim() && !prefixText?.trim()) return;

      const chatStore = useChatStore.getState();
      setIsLoading(true);
      setCheckResults([]);

      await chatStore.onUserInput(input, prefixText, suffixText);

      // API 调用完成后，对最后一条 assistant 消息执行检测
      const session = useChatStore.getState().currentSession();
      if (session) {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg?.role === "assistant" && typeof lastMsg.content === "string") {
          const text = lastMsg.content;
          if (text && text !== lastResultRef.current) {
            lastResultRef.current = text;
            const report = runAllChecks(text);
            setCheckResults(report.results);
          }
        }
      }

      setIsLoading(false);
    },
    [],
  );

  const retryMessage = useCallback(async (msgIndex: number) => {
    setIsLoading(true);
    try {
      await useChatStore.getState().regenerateMessage(msgIndex);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopGeneration = useCallback(() => {
    useChatStore.getState().stopCurrentChat();
    setIsLoading(false);
  }, []);

  return { sendMessage, retryMessage, stopGeneration, isLoading, checkResults };
}
