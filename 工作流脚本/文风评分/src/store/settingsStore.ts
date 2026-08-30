import { createPersistStore } from "../services/storage/database";
import {
  LLMConfig,
  ServiceProvider,
  DEFAULT_MODELS,
  LLMModel,
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  GEMINI_BASE_URL,
  DEEPSEEK_BASE_URL,
  SILICONFLOW_BASE_URL,
} from "../types/api";

// 从 NextChat store/access.ts + store/config.ts 拷贝并合并
export interface SettingsState {
  // API Keys
  provider: ServiceProvider;
  openaiUrl: string;
  openaiApiKey: string;
  anthropicUrl: string;
  anthropicApiKey: string;
  deepseekUrl: string;
  deepseekApiKey: string;
  siliconflowUrl: string;
  siliconflowApiKey: string;
  googleUrl: string;
  googleApiKey: string;

  // Model Config
  modelConfig: LLMConfig & { historyMessageCount: number; sendMemory: boolean };
  customModels: string;
  models: LLMModel[];

  // UI Settings
  fontSize: number;
  theme: "auto" | "dark" | "light";
  sendPreviewBubble: boolean;
  enableAutoGenerateTitle: boolean;
  hideBuiltinPrompts: boolean;
  keepInputAfterSend: boolean;

  // 回车发送（默认关闭，Shift+Enter 始终换行）
  enterToSend: boolean;

  // Forbidden word settings (from StyleSync-Novel)
  globalForbidden: string; // comma-separated global forbidden words
  forbiddenTolerance: number; // max hits before auto-abort (default 3)

  // Tool display mode
  toolDisplay: "icon" | "text"; // default icon

  // Slop 检测默认开关
  slopHighlightEnabled: boolean;

  // Delete confirmations
  deleteConfirm: {
    mode: "off" | "on" | "detailed";
    messages: boolean;
    sessions: boolean;
    knowledge: boolean;
  };
}

export const DEFAULT_SETTINGS: SettingsState = {
  provider: ServiceProvider.OpenAI,

  openaiUrl: OPENAI_BASE_URL,
  openaiApiKey: "",
  anthropicUrl: ANTHROPIC_BASE_URL,
  anthropicApiKey: "",
  deepseekUrl: DEEPSEEK_BASE_URL,
  deepseekApiKey: "",
  siliconflowUrl: SILICONFLOW_BASE_URL,
  siliconflowApiKey: "",
  googleUrl: GEMINI_BASE_URL,
  googleApiKey: "",

  modelConfig: {
    model: "deepseek-v4-flash",
    providerName: "DeepSeek",
    temperature: 0.7,
    top_p: 1,
    max_tokens: 16384,  // DS V4 max = 384K，默认 16K 足够一章
    presence_penalty: 0,
    frequency_penalty: 0,
    historyMessageCount: 4,
    sendMemory: true,
    enableInjectSystemPrompts: true,
    template: "{{input}}",
    thinking: false,
    reasoning_effort: "high",
  },
  customModels: "",
  models: DEFAULT_MODELS,

  fontSize: 14,
  theme: "auto",
  sendPreviewBubble: true,
  enableAutoGenerateTitle: true,
  hideBuiltinPrompts: false,
  keepInputAfterSend: false,
  enterToSend: false,
  globalForbidden: "",
  forbiddenTolerance: 3,
  toolDisplay: "icon",
  slopHighlightEnabled: false,
  deleteConfirm: { mode: "on", messages: true, sessions: true, knowledge: true },
};

export const useSettingsStore = createPersistStore(
  { ...DEFAULT_SETTINGS },
  (set, get) => ({
    setModelConfig(config: Partial<LLMConfig>) {
      set((s) => ({
        modelConfig: { ...s.modelConfig, ...config },
      }));
      get().markUpdate();
    },
    setProvider(provider: ServiceProvider) {
      // 同步 modelConfig.providerName 与默认模型：
      // API 路由、模型列表、思考模式都读取 modelConfig.providerName，
      // 此前只改 provider 字段，导致切换服务商实际不生效
      const defaultModelByProvider: Record<string, string> = {
        [ServiceProvider.OpenAI]: "gpt-4o-mini",
        [ServiceProvider.Anthropic]: "claude-3.5-sonnet",
        [ServiceProvider.Google]: "gemini-2.0-flash",
        [ServiceProvider.DeepSeek]: "deepseek-v4-flash",
        [ServiceProvider.SiliconFlow]: "deepseek-ai/DeepSeek-V3.2",
      };
      set((s) => ({
        provider,
        modelConfig: {
          ...s.modelConfig,
          providerName: provider,
          model: defaultModelByProvider[provider] || s.modelConfig.model,
        },
      }));
      get().markUpdate();
    },
    setField<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
      set({ [key]: value } as any);
      get().markUpdate();
    },
    toggleDeleteConfirm(key?: "messages" | "sessions" | "knowledge") {
      if (key) {
        const dc = { ...get().deleteConfirm };
        dc[key] = !dc[key];
        set({ deleteConfirm: dc });
      } else {
        const modes: Array<"off" | "on" | "detailed"> = ["off", "on", "detailed"];
        const current = get().deleteConfirm.mode;
        const next = modes[(modes.indexOf(current) + 1) % 3];
        set({ deleteConfirm: { ...get().deleteConfirm, mode: next } });
      }
      get().markUpdate();
    },
  }),
  {
    name: "inkflow-settings",
    version: 2,
  },
);
