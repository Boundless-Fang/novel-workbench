import { ChatMessage } from "../types/chat";
import type React from "react";

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function ensure<T extends object>(
  obj: T,
  keys: Array<[keyof T][number]>,
): boolean {
  return keys.every(
    (k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== "",
  );
}

export function prettyObject(msg: any): string {
  const obj = msg;
  if (typeof msg !== "string") {
    msg = JSON.stringify(msg, null, "  ");
  }
  if (msg === "{}") {
    return obj.toString();
  }
  if (msg.startsWith("```json")) {
    return msg;
  }
  return ["```json", msg, "```"].join("\n");
}

export function* chunks(s: string, maxBytes = 1000 * 1000) {
  const decoder = new TextDecoder("utf-8");
  let buf = new TextEncoder().encode(s);
  while (buf.length) {
    let i = buf.lastIndexOf(32, maxBytes + 1);
    if (i < 0) i = buf.indexOf(32, maxBytes);
    if (i < 0) i = buf.length;
    yield decoder.decode(buf.slice(0, i));
    buf = buf.slice(i + 1);
  }
}

export function getMessageTextContent(msg: ChatMessage): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  const c = msg.content as Array<{ type: string; text?: string }>;
  return c
    .filter((v) => v.type === "text")
    .map((v) => v.text || "")
    .join("\n");
}

export function trimTopic(topic: string): string {
  // 限制标题长度为50个字符
  return topic.length > 50 ? topic.slice(0, 50) + "..." : topic;
}

export function isVisionModel(model: string): boolean {
  const visionKeywords = ["vision", "claude-3", "gemini", "gpt-4o", "gpt-4-turbo"];
  return visionKeywords.some((k) => model.includes(k));
}

/**
 * 跨平台复制到剪贴板。
 * navigator.clipboard API 在 Android WebView（https://localhost scheme）中
 * 经常静默失败（权限/安全上下文问题）。优先用 Clipboard API，失败则回退到
 * 临时 textarea + document.execCommand('copy')，兼容 WebView。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. 优先尝试标准 Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* 回退到 execCommand */ }
  }
  // 2. 回退：临时 textarea + execCommand
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 生成 textarea 的 onPaste + onInput + onBlur 同步属性。
 * Android WebView 中输入法剪贴板面板的粘贴可能不触发 React onChange，
 * 导致 state 与 DOM 不同步。三层兜底：
 * - onPaste：标准粘贴路径，rAF 同步（避免阻塞粘贴）
 * - onInput：任何输入路径（含 commitText）都触发，立即同步
 * - onBlur：失焦时同步，最后兜底
 */
export function pasteSyncProps(getValue: () => string, setValue: (v: string) => void) {
  return {
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const t = e.currentTarget;
      requestAnimationFrame(() => setValue(t.value));
    },
    onInput: (e: React.FormEvent<HTMLTextAreaElement>) => {
      const v = e.currentTarget.value;
      if (v !== getValue()) setValue(v);
    },
    onBlur: (e: React.FocusEvent<HTMLTextAreaElement>) => setValue(e.target.value),
  };
}
