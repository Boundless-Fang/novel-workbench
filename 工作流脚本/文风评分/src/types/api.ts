import type { ChatMessageTool } from "./chat";

export enum ServiceProvider {
  OpenAI = "OpenAI",
  Anthropic = "Anthropic",
  Google = "Google",
  DeepSeek = "DeepSeek",
  SiliconFlow = "SiliconFlow",
}

export enum ModelProvider {
  GPT = "GPT",
  Claude = "Claude",
  GeminiPro = "GeminiPro",
  DeepSeek = "DeepSeek",
}

// API 基础 URL 常量 — 从 NextChat constant.ts 拷贝
export const OPENAI_BASE_URL = "https://api.openai.com";
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_BETA_URL = "https://api.deepseek.com/beta";
export const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
export const SILICONFLOW_FIM_PATH = "fim/completions";
export const SILICONFLOW_MODELS: string[] = [
  "deepseek-ai/DeepSeek-V3.2",
  "deepseek-ai/DeepSeek-V3.2-Exp",
  "deepseek-ai/DeepSeek-V4-Flash-0731",
  "deepseek-ai/DeepSeek-V4-Flash",
  "deepseek-ai/DeepSeek-V4-Pro",
];

export const SILICONFLOW_MODEL_LABELS: Record<string, string> = {
  "deepseek-ai/DeepSeek-V3.2": "DeepSeek V3.2（代金券可用）",
  "deepseek-ai/DeepSeek-V3.2-Exp": "DeepSeek V3.2 Exp",
  "deepseek-ai/DeepSeek-V4-Flash-0731": "DeepSeek V4 Flash 0731",
  "deepseek-ai/DeepSeek-V4-Flash": "DeepSeek V4 Flash",
  "deepseek-ai/DeepSeek-V4-Pro": "DeepSeek V4 Pro",
};

export const PROVIDER_LABELS: Record<string, string> = {
  OpenAI: "OpenAI",
  DeepSeek: "DeepSeek",
  SiliconFlow: "硅基流动（SiliconFlow）",
  Anthropic: "Anthropic (Claude)",
  Google: "Google (Gemini)",
};

export const OpenaiPath = {
  ChatPath: "v1/chat/completions",
  ListModelPath: "v1/models",
};

// DeepSeek 使用不同于 OpenAI 的 API 路径（无 /v1 前缀）
export const DEEPSEEK_CHAT_PATH = "chat/completions";

export const Anthropic = {
  ChatPath: "v1/messages",
  Vision: "2023-06-01",
};

export const Google = {
  ChatPath: (modelName: string) =>
    `v1beta/models/${modelName}:streamGenerateContent`,
};

export const REQUEST_TIMEOUT_MS = 60000;
export const REQUEST_TIMEOUT_MS_FOR_THINKING = REQUEST_TIMEOUT_MS * 5;

// ============ API 请求/响应类型 — 从 NextChat client/api.ts 拷贝 ============

export type MessageRole = "system" | "user" | "assistant";

export interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface RequestMessage {
  role: MessageRole;
  content: string | MultimodalContent[];
}

export interface LLMConfig {
  model: string;
  providerName?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  // NextChat 扩展字段
  historyMessageCount?: number;
  sendMemory?: boolean;
  enableInjectSystemPrompts?: boolean;
  template?: string;
  // DeepSeek 思考模式 (from StyleSync-Novel)
  thinking?: boolean;
  reasoning_effort?: ReasoningEffort;
}

// 思考强度档位：low / high / xhigh / max
// 服务端映射（deepseek-v4-flash / deepseek-v4-pro）：
//   low   -> low / high
//   high  -> high / high
//   xhigh -> high / max
//   max   -> max / max
export type ReasoningEffort = "low" | "high" | "xhigh" | "max";

export const REASONING_EFFORT_OPTIONS: {
  value: ReasoningEffort;
  label: string;
  desc: string;
}[] = [
  { value: "low", label: "低", desc: "快速响应，思考较浅" },
  { value: "high", label: "标准", desc: "均衡（默认）" },
  { value: "xhigh", label: "高", desc: "深度推理" },
  { value: "max", label: "极致", desc: "最强推理" },
];

export interface SSEChunk {
  type: "reasoning" | "content";
  text: string;
}

export interface ChatOptions {
  messages: RequestMessage[];
  config: LLMConfig;

  onUpdate?: (fullContent: string, fullReasoning: string, chunk: SSEChunk) => void;
  onFinish: (fullContent: string, fullReasoning: string, responseRes: Response) => void;
  onError?: (err: Error) => void;
  onController?: (controller: AbortController) => void;
  onBeforeTool?: (tool: ChatMessageTool) => void;
  onAfterTool?: (tool: ChatMessageTool) => void;

  // DeepSeek Beta 功能
  prefixText?: string;   // 对话前缀续写：assistant 开头文本
  suffixText?: string;   // FIM 补全：suffix 文本
}

export interface LLMUsage {
  used: number;
  total: number;
}

export interface LLMModel {
  name: string;
  displayName?: string;
  available: boolean;
  provider: {
    id: string;
    providerName: string;
    providerType: string;
    sorted: number;
  };
  sorted: number;
}

// 抽象 API 类 — 每个平台继承实现
export abstract class LLMApi {
  abstract chat(options: ChatOptions): Promise<void>;
  abstract usage(): Promise<LLMUsage>;
  abstract models(): Promise<LLMModel[]>;
}

export const DEFAULT_MODELS: LLMModel[] = [
  {
    name: "gpt-4o-mini",
    available: true,
    provider: { id: "openai", providerName: "OpenAI", providerType: "openai", sorted: 1 },
    sorted: 1,
  },
  {
    name: "gpt-4o",
    available: true,
    provider: { id: "openai", providerName: "OpenAI", providerType: "openai", sorted: 2 },
    sorted: 2,
  },
  {
    name: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    available: true,
    provider: { id: "deepseek", providerName: "DeepSeek", providerType: "deepseek", sorted: 3 },
    sorted: 3,
  },
  {
    name: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    available: true,
    provider: { id: "deepseek", providerName: "DeepSeek", providerType: "deepseek", sorted: 4 },
    sorted: 4,
  },
  {
    name: "claude-3.5-sonnet",
    available: true,
    provider: { id: "anthropic", providerName: "Anthropic", providerType: "anthropic", sorted: 5 },
    sorted: 5,
  },
  {
    name: "gemini-2.0-flash",
    available: true,
    provider: { id: "google", providerName: "Google", providerType: "google", sorted: 6 },
    sorted: 6,
  },
  {
    name: "deepseek-ai/DeepSeek-V3.2",
    displayName: "DeepSeek V3.2",
    available: true,
    provider: { id: "siliconflow", providerName: "SiliconFlow", providerType: "siliconflow", sorted: 7 },
    sorted: 7,
  },
  {
    name: "deepseek-ai/DeepSeek-V3.2-Exp",
    displayName: "DeepSeek V3.2 Exp",
    available: true,
    provider: { id: "siliconflow", providerName: "SiliconFlow", providerType: "siliconflow", sorted: 8 },
    sorted: 8,
  },
  {
    name: "deepseek-ai/DeepSeek-V4-Flash-0731",
    displayName: "DeepSeek V4 Flash 0731",
    available: true,
    provider: { id: "siliconflow", providerName: "SiliconFlow", providerType: "siliconflow", sorted: 9 },
    sorted: 9,
  },
  {
    name: "deepseek-ai/DeepSeek-V4-Flash",
    displayName: "DeepSeek V4 Flash",
    available: true,
    provider: { id: "siliconflow", providerName: "SiliconFlow", providerType: "siliconflow", sorted: 10 },
    sorted: 10,
  },
  {
    name: "deepseek-ai/DeepSeek-V4-Pro",
    displayName: "DeepSeek V4 Pro",
    available: true,
    provider: { id: "siliconflow", providerName: "SiliconFlow", providerType: "siliconflow", sorted: 11 },
    sorted: 11,
  },
];

export const SUMMARIZE_MODEL = "gpt-4o-mini";
