/**
 * SSE 流式处理器 — 简化版
 * 支持双通道：reasoning（思考） + content（回答）
 *
 * 传输层使用 fetch + ReadableStream（与 0615 版本一致，APK 中验证可用）。
 *
 * 性能优化：rAF 节流 onUpdate 回调。
 * 每个 SSE chunk 不再直接触发 React 重渲染，而是合并到每帧最多一次。
 * 手机 WebView CPU 弱，几千 chunk × 全量重渲染会卡顿/崩溃。
 *
 * 中断处理：与 0615 版本一致。
 * AbortError 时直接 return，不调用 onFinish，避免与 stopCurrentChat 竞态。
 * 消息状态由 stopCurrentChat 负责（设 streaming=false）。
 */

import type { SSEChunk } from "../../types/api";

export interface StreamOptions {
  url: string;
  headers: Record<string, string>;
  body: string;
  controller: AbortController;
  parseSSE: (data: string) => SSEChunk | undefined;
  onUpdate: (fullContent: string, fullReasoning: string, chunk: SSEChunk) => void;
  onFinish: (fullContent: string, fullReasoning: string, response: Response) => void;
  onError?: (err: Error) => void;
  timeoutMs?: number;
}

export async function streamFetch(options: StreamOptions): Promise<void> {
  const { url, headers, body, controller, parseSSE, onUpdate, onFinish, onError, timeoutMs = 60000 } = options;

  let fullContent = "";
  let fullReasoning = "";
  let finished = false;

  let buffer = "";

  // ============ rAF 节流 ============
  // 多个 chunk 合并为每帧一次 onUpdate，避免高频重渲染卡死 WebView
  let rafId: number | null = null;
  let pendingContent = "";
  let pendingReasoning = "";
  let pendingChunk: SSEChunk | null = null;

  const flushUpdate = () => {
    rafId = null;
    if (pendingChunk) {
      onUpdate(pendingContent, pendingReasoning, pendingChunk);
      pendingChunk = null;
    }
  };

  const scheduleUpdate = (content: string, reasoning: string, chunk: SSEChunk) => {
    pendingContent = content;
    pendingReasoning = reasoning;
    pendingChunk = chunk;
    if (rafId === null) {
      rafId = requestAnimationFrame(flushUpdate);
    }
  };

  // ============ 超时 ============
  let timeoutId: ReturnType<typeof setTimeout> = undefined!;
  // 标记超时触发的中断（区别于用户手动停止），超时后需向 UI 上报错误，
  // 否则 bot 消息会永远停留在 streaming 状态
  let timedOut = false;
  const startTimeout = () => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  startTimeout();

  const resetTimeout = () => {
    clearTimeout(timeoutId);
    startTimeout();
  };

  // ============ finish ============
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);
    // flush 未发送的更新
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (pendingChunk) {
      onUpdate(pendingContent, pendingReasoning, pendingChunk);
      pendingChunk = null;
    }
    onFinish(fullContent, fullReasoning, null as any);
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      onError?.(new Error(`API Error ${response.status}: ${errText}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { onError?.(new Error("No response body")); return; }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) { console.log("[SSE] stream done, finishing"); break; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (finished) break;
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") { console.log("[SSE] got [DONE], content:", fullContent.length, "reasoning:", fullReasoning.length); finish(); return; }

        try {
          const chunk = parseSSE(data);
          if (chunk) {
            if (chunk.type === "reasoning") {
              fullReasoning += chunk.text;
            } else {
              fullContent += chunk.text;
            }
            scheduleUpdate(fullContent, fullReasoning, chunk);
            resetTimeout();
          }
        } catch { /* ignore parse error */ }
      }
    }
  } catch (e: any) {
    console.log("[SSE] error:", e.name, e.message);
    if (e.name === "AbortError") {
      clearTimeout(timeoutId);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pendingChunk = null;
      finished = true;
      // 超时中断需要上报错误，让 UI 结束 streaming 状态并展示提示；
      // 用户手动停止由 stopCurrentChat 负责清理，这里保持静默
      if (timedOut) {
        onError?.(new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒无响应）`));
      }
      return;
    }
    clearTimeout(timeoutId);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    onError?.(e);
    return;
  }

  console.log("[SSE] calling finish, content:", fullContent.length, "reasoning:", fullReasoning.length);
  finish();
}
