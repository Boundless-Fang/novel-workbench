import {
  ServiceProvider,
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  GEMINI_BASE_URL,
  DEEPSEEK_BASE_URL,
  SILICONFLOW_BASE_URL,
  LLMApi,
} from "../../types/api";
import { useSettingsStore } from "../../store/settingsStore";
import { ChatGPTApi } from "./providers/openai";

// 从 NextChat client/api.ts getClientApi / getHeaders 借鉴改写

// ============ Provider 路由 ============

export function getClientApi(): LLMApi {
  const settings = useSettingsStore.getState();
  const providerName = settings.modelConfig.providerName as ServiceProvider;

  switch (providerName) {
    case ServiceProvider.Google:
      // TODO: GeminiApi
      return new ChatGPTApi(); // 回退到 OpenAI 兼容
    case ServiceProvider.Anthropic:
      // TODO: ClaudeApi
      return new ChatGPTApi(); // 回退到 OpenAI 兼容
    case ServiceProvider.DeepSeek:
      return new ChatGPTApi(); // DeepSeek 兼容 OpenAI 格式
    case ServiceProvider.SiliconFlow:
      return new ChatGPTApi(); // SiliconFlow 兼容 OpenAI 格式
    default:
      return new ChatGPTApi();
  }
}

// ============ 请求头构造 ============

export function getHeaders(): Record<string, string> {
  const settings = useSettingsStore.getState();
  const { modelConfig } = settings;

  let apiKey = "";
  let isGoogle = false;
  let isAnthropic = false;

  switch (modelConfig.providerName) {
    case ServiceProvider.Google:
      apiKey = settings.googleApiKey;
      isGoogle = true;
      break;
    case ServiceProvider.Anthropic:
      apiKey = settings.anthropicApiKey;
      isAnthropic = true;
      break;
    case ServiceProvider.DeepSeek:
      apiKey = settings.deepseekApiKey;
      break;
    case ServiceProvider.SiliconFlow:
      apiKey = settings.siliconflowApiKey;
      break;
    default:
      apiKey = settings.openaiApiKey;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    if (isGoogle) {
      headers["x-goog-api-key"] = apiKey;
    } else if (isAnthropic) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  }

  return headers;
}

// ============ Base URL ============

export function getBaseUrl(): string {
  const settings = useSettingsStore.getState();
  const { modelConfig } = settings;

  switch (modelConfig.providerName) {
    case ServiceProvider.Google:
      return settings.googleUrl || GEMINI_BASE_URL;
    case ServiceProvider.Anthropic:
      return settings.anthropicUrl || ANTHROPIC_BASE_URL;
    case ServiceProvider.DeepSeek:
      return settings.deepseekUrl || DEEPSEEK_BASE_URL;
    case ServiceProvider.SiliconFlow:
      return settings.siliconflowUrl || SILICONFLOW_BASE_URL;
    default:
      return settings.openaiUrl || OPENAI_BASE_URL;
  }
}

export function getApiKey(): string {
  const settings = useSettingsStore.getState();
  const { modelConfig } = settings;

  switch (modelConfig.providerName) {
    case ServiceProvider.Google:
      return settings.googleApiKey;
    case ServiceProvider.Anthropic:
      return settings.anthropicApiKey;
    case ServiceProvider.DeepSeek:
      return settings.deepseekApiKey;
    case ServiceProvider.SiliconFlow:
      return settings.siliconflowApiKey;
    default:
      return settings.openaiApiKey;
  }
}
