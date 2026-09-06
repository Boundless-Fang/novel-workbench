import { createPersistStore } from "../services/storage/database";
import {
  ChatSession,
  ChatMessage,
  ChatMessageTool,
  DraftMessage,
  ChatKnowledgeItem,
  createMessage,
  DEFAULT_TOPIC,
} from "../types/chat";
import { PromptTemplate } from "../types/prompt";
import { generateId } from "../utils/id";
import { estimateTokenLength } from "../utils/token";
import { getMessageTextContent, prettyObject } from "../utils/text";
import { fillTemplate } from "../utils/template";
import { getClientApi } from "../services/api/client";
import { ChatControllerPool } from "../services/api/controller";
import { useSettingsStore } from "./settingsStore";
import { useProjectStore } from "./projectStore";
import { usePromptStore } from "./promptStore";

// 从 NextChat store/chat.ts 完整借鉴 flow:
// onUserInput → fillTemplate → build messages → getClientApi → api.llm.chat → onUpdate/onFinish/onError

function createEmptySession(projectId?: string): ChatSession {
  return {
    id: generateId(),
    topic: DEFAULT_TOPIC,
    memoryPrompt: "",
    messages: [],
    stat: { tokenCount: 0, wordCount: 0, charCount: 0 },
    lastUpdate: Date.now(),
    lastSummarizeIndex: 0,
    maskId: "",
    projectId: projectId || useProjectStore.getState().currentProjectId,
    drafts: [],
    chatKnowledge: [],
  };
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionIndex: number;
  lastInput: string;
}

const DEFAULT_CHAT_STATE: ChatState = {
  sessions: [createEmptySession()],
  currentSessionIndex: 0,
  lastInput: "",
};

export const useChatStore = createPersistStore(
  { ...DEFAULT_CHAT_STATE },
  (set, _get) => {
    function get() {
      return { ..._get(), ...methods };
    }

    const methods = {
      currentSession(): ChatSession {
        const { sessions, currentSessionIndex } = get();
        return sessions[currentSessionIndex] || sessions[0];
      },

      selectSession(index: number) {
        set({ currentSessionIndex: index });
      },

      newSession(prompt?: PromptTemplate, projectId?: string) {
        const pid = projectId || useProjectStore.getState().currentProjectId;
        const session = createEmptySession(pid);
        if (prompt) {
          session.maskId = prompt.id;
          session.topic = prompt.name;
        } else {
          // 默认命名：新对话1, 新对话2, 新对话3...
          const existing = get().sessions.filter((s) => s.topic && /^新对话\d+$/.test(s.topic));
          const maxNum = existing.reduce((max, s) => {
            const n = parseInt(s.topic.replace("新对话", ""), 10);
            return isNaN(n) ? max : Math.max(max, n);
          }, 0);
          session.topic = `新对话${maxNum + 1}`;
        }
        set((state) => ({
          currentSessionIndex: 0,
          sessions: [session, ...state.sessions],
        }));
      },

      /** 重命名当前对话 */
      renameSession(name: string) {
        get().updateCurrentSession((s) => {
          s.topic = name.trim() || DEFAULT_TOPIC;
        });
      },

      /** 克隆当前对话 */
      cloneSession() {
        const src = get().currentSession();
        if (!src) return;
        const clone: ChatSession = {
          ...src,
          id: generateId(),
          topic: (src.topic || DEFAULT_TOPIC) + " (副本)",
          messages: src.messages.map((m) => ({ ...m, id: generateId() })),
          drafts: src.drafts.map((d) => ({ ...d, id: generateId() })),
          chatKnowledge: src.chatKnowledge.map((k) => ({ ...k })),
          lastUpdate: Date.now(),
        };
        set((s) => ({
          sessions: [...s.sessions, clone],
          currentSessionIndex: s.sessions.length,
        }));
        get().markUpdate();
      },

      /** 获取当前项目下的所有会话 */
      sessionsForProject(projectId: string): ChatSession[] {
        return get().sessions.filter((s) => s.projectId === projectId);
      },

      // ============ 草稿箱 ============

      addDraft(message: DraftMessage) {
        get().updateCurrentSession((s) => {
          s.drafts = [...s.drafts, message];
        });
      },

      deleteDraft(draftId: string) {
        get().updateCurrentSession((s) => {
          s.drafts = s.drafts.filter((d) => d.id !== draftId);
        });
      },

      // ============ 单对话知识库 ============

      addChatKnowledge(item: Omit<ChatKnowledgeItem, "id" | "createdAt" | "enabled">): boolean {
        const s = get().currentSession();
        if (!s) return false;
        const existingIdx = s.chatKnowledge?.findIndex((k) => k.title === item.title) ?? -1;
        if (existingIdx >= 0) {
          get().updateCurrentSession((s) => {
            s.chatKnowledge[existingIdx] = {
              ...s.chatKnowledge[existingIdx],
              content: item.content,
              enabled: true,
            };
          });
          return true;
        }
        get().updateCurrentSession((s) => {
          s.chatKnowledge = [...(s.chatKnowledge || []), { ...item, id: generateId(), createdAt: Date.now(), enabled: true }];
        });
        return true;
      },

      toggleChatKnowledge(id: string) {
        get().updateCurrentSession((s) => {
          if (!s.chatKnowledge) return;
          s.chatKnowledge = s.chatKnowledge.map((k) =>
            k.id === id ? { ...k, enabled: !k.enabled } : k,
          );
        });
      },


      deleteChatKnowledge(id: string) {
        get().updateCurrentSession((s) => {
          if (!s.chatKnowledge) return;
          s.chatKnowledge = s.chatKnowledge.filter((k) => k.id !== id);
        });
      },

      deleteSession(index: number) {
        const sessions = [...get().sessions]; // 先拷贝，避免 mutation
        if (sessions.length === 1) {
          set({ sessions: [createEmptySession()], currentSessionIndex: 0 });
          return;
        }
        sessions.splice(index, 1);
        const newIndex = Math.min(get().currentSessionIndex, sessions.length - 1);
        set({ sessions, currentSessionIndex: newIndex });
      },

      deleteMessage(messageId: string) {
        get().updateCurrentSession((s) => {
          s.messages = s.messages.filter((m) => m.id !== messageId);
        });
      },

      updateCurrentSession(updater: (session: ChatSession) => void) {
        const sessions = [...get().sessions];
        const session = { ...sessions[get().currentSessionIndex] };
        updater(session);
        sessions[get().currentSessionIndex] = session;
        set({ sessions });
        get().markUpdate();
      },

      // ============ 完整聊天流程 — 从 NextChat 借鉴 ============

      async onUserInput(content: string, prefixText?: string, suffixText?: string) {
        const session = get().currentSession();
        if (!session) return;

        const settings = useSettingsStore.getState();
        const modelConfig = settings.modelConfig;

        // 1. 模板填充
        const filledContent = fillTemplate(
          modelConfig.template as string,
          {
            input: content,
            model: modelConfig.model,
            time: new Date().toLocaleDateString("zh-CN"),
          },
        );

        // 2. 创建用户消息
        const userMessage: ChatMessage = createMessage({
          role: "user",
          content: filledContent,
        });

        // 3. 创建 bot 占位消息（版本化）
        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true,
          model: modelConfig.model,
          versions: [{ content: "" }],
          active_version: 0,
          prefixText,
          suffixText,
        });

        // 4. 获取最近消息（含记忆）
        const recentMessages = get().getMessagesWithMemory();
        const sendMessages = recentMessages.concat(userMessage) as ChatMessage[];

        // 4.5 注入知识库文件 — 替换 {{kb:标题}} 标记
        const enabledKb = session.chatKnowledge?.filter((k) => k.enabled) || [];
        if (enabledKb.length > 0) {
          const buildMap = (text: string): string =>
            text.replace(/\{\{kb:([^}]+)\}\}/g, (_, title) => {
              const found = enabledKb.find((k) => k.title === title);
              return found ? `【${found.title}】\n${found.content}` : `{{kb:${title}}}`;
            });

          for (const msg of sendMessages) {
            if (typeof msg.content === "string") {
              msg.content = buildMap(msg.content);
            }
          }
          if (typeof userMessage.content === "string") {
            userMessage.content = buildMap(userMessage.content);
          }
        }

        // 5. 保存用户和 bot 消息
        get().updateCurrentSession((s) => {
          s.messages = s.messages.concat([userMessage, botMessage]);
          s.lastUpdate = Date.now();
          if ((s.topic === DEFAULT_TOPIC || /^新对话\d+$/.test(s.topic)) && content.length > 0) {
            s.topic = content.slice(0, 30);
          }
        });

        // 6. 获取 API 客户端并请求
        const api = getClientApi();
        const messageIndex = session.messages.length;

        // Clean messages before sending (strip extra fields like id/date/versions)
        const cleanMessages = sendMessages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : "",
        }));

        await api.chat({
          messages: cleanMessages,
          config: { ...modelConfig, stream: true },
          prefixText,
          suffixText,
          onUpdate(fullContent, fullReasoning) {
            botMessage.streaming = true;
            if (botMessage.versions) {
              const av = botMessage.active_version ?? 0;
              botMessage.versions[av].content = fullContent;
              botMessage.content = fullContent; // sync for display
              if (fullReasoning) {
                botMessage.versions[av].reasoningContent = fullReasoning;
                botMessage.reasoningContent = fullReasoning;
              }
            }
            get().updateCurrentSession((s) => {
              s.messages = s.messages.concat();
            });
          },
          async onFinish(fullContent, fullReasoning) {
            botMessage.streaming = false;
            if (botMessage.versions) {
              const av = botMessage.active_version ?? 0;
              botMessage.versions[av].content = fullContent;
              botMessage.content = fullContent;
              if (fullReasoning) {
                botMessage.versions[av].reasoningContent = fullReasoning;
                botMessage.reasoningContent = fullReasoning;
              }
            }
            botMessage.date = new Date().toLocaleString();
            // 更新统计
            get().updateCurrentSession((s) => {
              s.messages = s.messages.concat();
              const allText = s.messages.map(getMessageTextContent).join("");
              s.stat = {
                tokenCount: Math.round(estimateTokenLength(allText)),
                wordCount: allText.split(/\s+/).filter(Boolean).length,
                charCount: allText.length,
              };
              s.lastUpdate = Date.now();
            });
            ChatControllerPool.remove(session.id, botMessage.id);
          },
          onBeforeTool(tool: ChatMessageTool) {
            (botMessage.tools = botMessage.tools || []).push(tool);
            get().updateCurrentSession((s) => {
              s.messages = s.messages.concat();
            });
          },
          onAfterTool(tool: ChatMessageTool) {
            botMessage.tools?.forEach((t, i, tools) => {
              if (tool.id === t.id) {
                tools[i] = { ...tool };
              }
            });
            get().updateCurrentSession((s) => {
              s.messages = s.messages.concat();
            });
          },
          onError(error) {
            const isAborted = error.message?.includes?.("aborted");
            const av = botMessage.active_version ?? 0;
            if (botMessage.versions) {
              botMessage.versions[av].content += "\n\n" + prettyObject({ error: true, message: error.message });
              botMessage.versions[av].isError = !isAborted;
            }
            botMessage.content = botMessage.versions?.[av]?.content || "";
            botMessage.streaming = false;
            userMessage.isError = !isAborted;
            botMessage.isError = !isAborted;
            get().updateCurrentSession((s) => {
              s.messages = s.messages.concat();
            });
            ChatControllerPool.remove(session.id, botMessage.id);
          },
          onController(controller) {
            ChatControllerPool.addController(
              session.id,
              botMessage.id,
              controller,
            );
          },
        });
      },

// ============ 消息上下文管理 — 从 NextChat 借鉴 ============

      /**
       * 构建上下文集（含系统提示词、记忆、上下文预设）
       * @param endIndex 可选，只取该索引之前的消息（重试时排除目标 bot 消息）
       */
      getMessagesWithMemory(endIndex?: number): ChatMessage[] {
        const session = get().currentSession();
        if (!session) return [];

        const clearContextIndex = session.clearContextIndex ?? 0;
        let messages = session.messages.slice(clearContextIndex);
        // 重试时排除目标消息及之后的所有消息
        if (endIndex !== undefined) {
          messages = messages.slice(0, endIndex - clearContextIndex);
        }
        const modelConfig = useSettingsStore.getState().modelConfig;
        const n = modelConfig.historyMessageCount ?? 4;

        // 取最近的消息
        let recentMessages: ChatMessage[] = messages.slice(-n * 2).map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content :
                   (m.versions ? (m.versions[m.active_version ?? 0]?.content || "") : ""),
        })) as any;

        // 上下文预设消息 — 从 promptStore 获取模板的 context
        const contextPrompts: ChatMessage[] = [];
        if (session.maskId) {
          const prompts = usePromptStore.getState();
          const mask = prompts.getAll().find((p) => p.id === session.maskId);
          if (mask?.context && mask.context.length > 0) {
            contextPrompts.push(...mask.context.map((c) => ({
              role: c.role,
              content: typeof c.content === "string" ? c.content : "",
            })) as any);
          }
        }

        // 注入系统提示词（GPT 系列）
        const shouldInjectSystem = modelConfig.enableInjectSystemPrompts ??
          (modelConfig.model.startsWith("gpt-") || modelConfig.model.startsWith("chatgpt-"));

        if (shouldInjectSystem) {
          const systemMsg = createMessage({
            role: "system",
            content: `You are an AI writing assistant. Current model: ${modelConfig.model}. Current time: ${new Date().toDateString()}. Follow the user's instructions carefully.`,
          });
          recentMessages = [systemMsg, ...recentMessages];
        }

        // 记忆提示词
        if (modelConfig.sendMemory && session.memoryPrompt) {
          const memoryMsg = createMessage({
            role: "system",
            content: `History summary:\n${session.memoryPrompt}`,
          });
          recentMessages = [memoryMsg, ...recentMessages];
        }

        // 注入上下文预设消息（放在系统提示词之后、对话之前）
        if (contextPrompts.length > 0) {
          // 找到系统消息的末尾位置，在其后插入 context
          const sysEndIdx = recentMessages.findIndex(
            (_, i) => recentMessages.slice(i).every((m) => m.role !== "system"),
          );
          const insertIdx = sysEndIdx === -1 ? 0 : sysEndIdx;
          recentMessages = [
            ...recentMessages.slice(0, insertIdx),
            ...contextPrompts,
            ...recentMessages.slice(insertIdx),
          ];
        }

        // 注：知识库文件注入已移至 onUserInput 统一处理（支持 {{knowledge}} 标记）
        return recentMessages;
      },

      // ============ 辅助方法 ============

      onBotMessage(message: string, streaming: boolean, isError?: boolean) {
        get().updateCurrentSession((s) => {
          const lastMsg = s.messages[s.messages.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.streaming) {
            lastMsg.content = message;
            lastMsg.streaming = streaming;
            if (isError) lastMsg.isError = true;
          } else {
            s.messages.push(createMessage({ role: "assistant", content: message, streaming, isError }));
          }
          const allText = s.messages.map(getMessageTextContent).join("");
          s.stat = {
            tokenCount: Math.round(estimateTokenLength(allText)),
            wordCount: allText.split(/\s+/).filter(Boolean).length,
            charCount: allText.length,
          };
          s.lastUpdate = Date.now();
        });
      },

      summarizeSession() {
        get().updateCurrentSession((s) => {
          if (s.messages.length > 50) {
            s.clearContextIndex = s.messages.length - 10;
          }
        });
      },

      clearAllData() {
        set({ sessions: [createEmptySession()], currentSessionIndex: 0, lastInput: "" });
        get().markUpdate();
      },

      getMessages(): ChatMessage[] {
        return get().currentSession()?.messages || [];
      },

      stopCurrentChat() {
        const session = get().currentSession();
        if (!session) return;
        ChatControllerPool.stopSession(session.id);
        get().updateCurrentSession((s) => {
          s.messages.forEach((m) => {
            if (m.streaming && m.role === "assistant") {
              m.streaming = false;
              if (m.versions) {
                const av = m.active_version ?? 0;
                if (m.versions[av] && m.versions[av].content === "") {
                  m.versions[av].content = "已中断";
                }
              } else if (m.content === "") {
                m.content = "已中断";
              }
            }
          });
        });
      },

      // ============ 版本切换 (from StyleSync-Novel) ============

      setActiveVersion(messageId: string, versionIndex: number) {
        get().updateCurrentSession((s) => {
          const msg = s.messages.find((m) => m.id === messageId);
          if (msg && msg.versions && versionIndex >= 0 && versionIndex < msg.versions.length) {
            msg.active_version = versionIndex;
            msg.content = msg.versions[versionIndex].content;
            msg.reasoningContent = msg.versions[versionIndex].reasoningContent;
          }
        });
      },

      async regenerateMessage(messageIndex: number) {
        const session = get().currentSession();
        if (!session) return;
        const targetMessage = session.messages[messageIndex];
        if (!targetMessage || targetMessage.role !== "assistant") return;

        const settings = useSettingsStore.getState();
        const modelConfig = settings.modelConfig;

        // Add new version (from StyleSync-Novel)
        if (!targetMessage.versions) {
          targetMessage.versions = [{ content: typeof targetMessage.content === "string" ? targetMessage.content : "" }];
        }
        targetMessage.versions.push({ content: "" });
        targetMessage.active_version = targetMessage.versions.length - 1;
        targetMessage.streaming = true;
        targetMessage.isError = false;
        targetMessage.reasoningContent = "";

        get().updateCurrentSession((s) => { s.messages = s.messages.concat(); });

        // 复用 getMessagesWithMemory 构建上下文，排除目标消息自身
        const apiMessages = get().getMessagesWithMemory(messageIndex);

        // 注入知识库标记替换
        const enabledKb = session.chatKnowledge?.filter((k) => k.enabled) || [];
        if (enabledKb.length > 0) {
          const buildMap = (text: string): string =>
            text.replace(/\{\{kb:([^}]+)\}\}/g, (_, title) => {
              const found = enabledKb.find((k) => k.title === title);
              return found ? `【${found.title}】\n${found.content}` : `{{kb:${title}}}`;
            });
          for (const msg of apiMessages) {
            if (typeof msg.content === "string") {
              msg.content = buildMap(msg.content);
            }
          }
        }

        // Clean messages before sending
        const cleanMessages = apiMessages.map((m: any) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : "",
        }));

        // Preserve FIM context from original message for local rewrite retry
        const rewritePrefix = targetMessage.prefixText;
        const rewriteSuffix = targetMessage.suffixText;

        // Call API directly
        const api = getClientApi();
        try {
          await api.chat({
            messages: cleanMessages,
            config: { ...modelConfig, stream: true },
            prefixText: rewritePrefix,
            suffixText: rewriteSuffix,
            onUpdate(fullContent, fullReasoning) {
              targetMessage.streaming = true;
              if (targetMessage.versions) {
                const av = targetMessage.active_version ?? 0;
                targetMessage.versions[av].content = fullContent;
                targetMessage.content = fullContent;
                if (fullReasoning) {
                  targetMessage.versions[av].reasoningContent = fullReasoning;
                  targetMessage.reasoningContent = fullReasoning;
                }
              }
              get().updateCurrentSession((s) => { s.messages = s.messages.concat(); });
            },
            async onFinish(fullContent, fullReasoning) {
              targetMessage.streaming = false;
              if (targetMessage.versions) {
                const av = targetMessage.active_version ?? 0;
                targetMessage.versions[av].content = fullContent;
                targetMessage.content = fullContent;
                if (fullReasoning) {
                  targetMessage.versions[av].reasoningContent = fullReasoning;
                  targetMessage.reasoningContent = fullReasoning;
                }
              }
              targetMessage.date = new Date().toLocaleString();
              get().updateCurrentSession((s) => { s.messages = s.messages.concat(); });
              ChatControllerPool.remove(session.id, targetMessage.id);
            },
            onError(error) {
              const av = targetMessage.active_version ?? 0;
              if (targetMessage.versions) {
                targetMessage.versions[av].content += "\n\n" + prettyObject({ error: true, message: error.message });
                targetMessage.versions[av].isError = true;
              }
              targetMessage.content = targetMessage.versions?.[av]?.content || "";
              targetMessage.streaming = false;
              targetMessage.isError = true;
              get().updateCurrentSession((s) => { s.messages = s.messages.concat(); });
              ChatControllerPool.remove(session.id, targetMessage.id);
            },
            onController(controller) {
              ChatControllerPool.addController(session.id, targetMessage.id, controller);
            },
          });
        } catch (e: any) {
          if (e.name === "AbortError") {
            targetMessage.streaming = false;
            get().updateCurrentSession((s) => { s.messages = s.messages.concat(); });
          } else {
            targetMessage.streaming = false;
            targetMessage.isError = true;
            const av = targetMessage.active_version ?? 0;
            if (targetMessage.versions) {
              targetMessage.versions[av].content += "\n\n" + prettyObject({ error: true, message: e.message || String(e) });
            }
            targetMessage.content = targetMessage.versions?.[av]?.content || "";
            get().updateCurrentSession((s) => { s.messages = s.messages.concat(); });
          }
          ChatControllerPool.remove(session.id, targetMessage.id);
        }
      },
    };

    return methods;
  },
  {
    name: "inkflow-chat",
    version: 1,
  },
);

// 启动时清理：崩溃/重启后重置孤儿 streaming 状态 + 中断残留请求
const _unsubCleanup = useChatStore.subscribe((state) => {
  if (state._hasHydrated) {
    _unsubCleanup();
    ChatControllerPool.stopAll();
    let hasOrphans = false;
    const cleaned = state.sessions.map((session) => {
      let sessionHasOrphan = false;
      const msgs = session.messages.map((msg) => {
        if (msg.streaming) {
          sessionHasOrphan = true;
          return { ...msg, streaming: false, isError: true };
        }
        return msg;
      });
      if (sessionHasOrphan) {
        hasOrphans = true;
        return { ...session, messages: msgs };
      }
      return session;
    });
    if (hasOrphans) {
      useChatStore.setState({ sessions: cleaned } as any);
    }
  }
});
