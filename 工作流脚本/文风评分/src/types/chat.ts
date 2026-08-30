import { RequestMessage } from "./api";

export type ChatMessageTool = {
  id: string;
  index?: number;
  type?: string;
  function?: {
    name: string;
    arguments?: string;
  };
  content?: string;
  isError?: boolean;
  errorMsg?: string;
};

// 从 NextChat store/chat.ts 拷贝
export type ChatMessage = RequestMessage & {
  date: string;
  streaming?: boolean;
  isError?: boolean;
  id: string;
  model?: string;
  tools?: ChatMessageTool[];
  // Multi-version support (from StyleSync-Novel)
  versions?: { content: string; isError?: boolean; reasoningContent?: string }[];
  active_version?: number;
  // DeepSeek Beta prefix/FIM
  prefixText?: string;
  suffixText?: string;
  // DeepSeek 思考模式
  reasoningContent?: string;
};

export interface DraftMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  date: string;
}

export interface ChatKnowledgeItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  enabled: boolean;
}

export interface ChatStat {
  tokenCount: number;
  wordCount: number;
  charCount: number;
}

// 从 NextChat store/chat.ts 拷贝 ChatSession 结构
export interface ChatSession {
  id: string;
  topic: string;
  memoryPrompt: string;
  messages: ChatMessage[];
  stat: ChatStat;
  lastUpdate: number;
  lastSummarizeIndex: number;
  clearContextIndex?: number;
  maskId: string;
  // Project scope
  projectId: string;
  // Per-chat features
  drafts: DraftMessage[];
  chatKnowledge: ChatKnowledgeItem[];
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionIndex: number;
  lastInput: string;
}

import { generateId } from "../utils/id";

export function createMessage(override: Partial<ChatMessage>): ChatMessage {
  return {
    id: generateId(),
    date: new Date().toLocaleString(),
    role: "user",
    content: "",
    ...override,
  };
}

export const DEFAULT_TOPIC = "新的对话";
