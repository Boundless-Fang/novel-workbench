import { ChatOptions, LLMApi, OpenaiPath, DEEPSEEK_BETA_URL, DEEPSEEK_CHAT_PATH, SILICONFLOW_FIM_PATH, SSEChunk } from "../../../types/api";
import { getHeaders, getBaseUrl } from "../client";
import { REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS_FOR_THINKING } from "../../../types/api";
import { streamFetch } from "../stream";

export interface RequestPayload {
  messages: {
    role: string;
    content: string;
  }[];
  stream?: boolean;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens?: number;
  max_completion_tokens?: number;
}

export class ChatGPTApi extends LLMApi {
  async chat(options: ChatOptions): Promise<void> {
    const messages = options.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

    const controller = new AbortController();
    options.onController?.(controller);

    const baseUrlForRoute = getBaseUrl();
    const isSiliconFlow =
      options.config.providerName === "SiliconFlow" ||
      /siliconflow/i.test(baseUrlForRoute);
    // DeepSeek 系模型：官方 deepseek-* 或 SiliconFlow 上的 deepseek-ai/DeepSeek-*
    const isDeepSeekFamilyModel = /deepseek/i.test(options.config.model);
    const isThinking = isDeepSeekFamilyModel && options.config.thinking;

    // DeepSeek Beta FIM 补全（有 suffix）：走 /beta/completions
    // SiliconFlow FIM：走 OpenAI 兼容的 /v1/fim/completions（不支持 thinking）
    if (options.prefixText && options.suffixText) {
      const fimPayload: any = {
        model: options.config.model,
        prompt: options.prefixText,
        suffix: options.suffixText,
        max_tokens: Math.min(options.config.max_tokens ?? 4096, 4096),
        temperature: options.config.temperature ?? 0.7,
        stream: true,
      };

      const trimmedBase = baseUrlForRoute.replace(/\/+$/, "");
      const fimUrl = isSiliconFlow
        ? trimmedBase.endsWith("/v1")
          ? `${trimmedBase}/${SILICONFLOW_FIM_PATH}`
          : `${trimmedBase}/v1/${SILICONFLOW_FIM_PATH}`
        : `${DEEPSEEK_BETA_URL}/completions`;

      await streamFetch({
        url: fimUrl,
        headers: getHeaders(),
        body: JSON.stringify(fimPayload),
        controller,
        timeoutMs: isThinking ? REQUEST_TIMEOUT_MS_FOR_THINKING : REQUEST_TIMEOUT_MS,
        parseSSE: (data): SSEChunk | undefined => {
          const json = JSON.parse(data);
          const choice = json.choices?.[0];
          if (choice?.reasoning_content) {
            return { type: "reasoning", text: choice.reasoning_content };
          }
          const text = choice?.text;
          return text ? { type: "content", text } : undefined;
        },
        onUpdate: options.onUpdate!,
        onFinish: options.onFinish,
        onError: options.onError,
      });
      return;
    }

    // 前缀续写：最后一条 assistant 消息带 prefix:true。
    // DeepSeek 官方走 /beta 端点；SiliconFlow 走 OpenAI 兼容 /v1/chat/completions。
    // 思考模式下续写前缀必须放入 reasoning_content（content 留空串），thinking 才会真正生效。
    if (options.prefixText) {
      if (isThinking) {
        messages.push({
          role: "assistant",
          content: "",
          prefix: true,
          reasoning_content: options.prefixText,
        } as any);
      } else {
        messages.push({
          role: "assistant",
          content: options.prefixText,
          prefix: true,
        } as any);
      }
      // 不 return，继续下面的常规聊天流程
    }

    const requestPayload: RequestPayload = {
      messages,
      stream: options.config.stream ?? true,
      model: options.config.model,
      temperature: options.config.temperature ?? 0.7,
      top_p: options.config.top_p ?? 1,
      max_tokens: options.config.max_tokens || options.config.max_completion_tokens,
    };

    // gpt-5 / o1 系列用 max_completion_tokens
    if (requestPayload.model.startsWith("gpt-5") || requestPayload.model.startsWith("o1")) {
      requestPayload.max_completion_tokens = requestPayload.max_tokens;
      delete requestPayload.max_tokens;
    }

    // 思考模式：DeepSeek 官方用 thinking + reasoning_effort，
    // SiliconFlow 用 enable_thinking（OpenAI 兼容）。
    if (isThinking) {
      if (isSiliconFlow) {
        (requestPayload as any).enable_thinking = true;
      } else {
        (requestPayload as any).thinking = { type: "enabled" };
        (requestPayload as any).reasoning_effort = options.config.reasoning_effort || "high";
      }
    } else if (isDeepSeekFamilyModel) {
      if (isSiliconFlow) {
        (requestPayload as any).enable_thinking = false;
      } else {
        (requestPayload as any).thinking = { type: "disabled" };
      }
    }

    // 前缀续写走对应端点；Beta 端点的 /chat/completions 同时支持 prefix:true 与 thinking
    const baseUrl = options.prefixText
      ? (isSiliconFlow ? baseUrlForRoute : DEEPSEEK_BETA_URL)
      : baseUrlForRoute;
    const trimmedBase = baseUrl.replace(/\/+$/, "");
    const path = trimmedBase.includes("deepseek.com")
      ? DEEPSEEK_CHAT_PATH
      : trimmedBase.endsWith("/v1")
        ? "chat/completions"
        : OpenaiPath.ChatPath;
    const chatPath = `${trimmedBase}/${path}`;
    const headers = getHeaders();

    if (options.prefixText) {
      console.log("[prefix request]", JSON.stringify(requestPayload, null, 2));
    }

    await streamFetch({
      url: chatPath,
      headers,
      body: JSON.stringify(requestPayload),
      controller,
      timeoutMs: isThinking ? REQUEST_TIMEOUT_MS_FOR_THINKING : REQUEST_TIMEOUT_MS,
      parseSSE: (data): SSEChunk | undefined => {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (!delta) return undefined;
        if (delta.reasoning_content) {
          return { type: "reasoning", text: delta.reasoning_content };
        }
        if (delta.content) {
          return { type: "content", text: delta.content };
        }
        return undefined;
      },
      onUpdate: options.onUpdate!,
      onFinish: options.onFinish,
      onError: options.onError,
    });
  }

  async usage(): Promise<any> {
    return { used: 0, total: 0 };
  }

  async models(): Promise<any> {
    return [];
  }
}
