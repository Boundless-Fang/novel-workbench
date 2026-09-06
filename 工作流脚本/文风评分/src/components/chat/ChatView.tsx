import React, { useRef, useEffect, useMemo } from "react";
import type { ChatMessage as ChatMessageType } from "../../types/chat";
import type { LiveHighlight } from "../../services/checker";
import { MemoMessageRow } from "./ChatMessage";

interface ChatViewProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  editingMsgId: string | null;
  editContent: string;
  deleteTarget: string | null;
  highlightMsgId: string | null;
  scorePopup: { id: string; score: number; grade: string; hits: number } | null;
  slopHighlight: LiveHighlight | null;
  slopHighlightOn: boolean;
  toolSlopDetect: boolean;
  collapsedMsgIds: Set<string>;
  renderMessageContent: (text: string, msgId: string) => React.ReactNode;
  onStopGeneration: () => void;
  onSwitchVersion: (msgId: string, dir: number) => void;
  onRetry: (msgIndex: number) => void;
  onCopy: (text: string) => void;
  onStartEdit: (msgId: string, content: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onSaveDraft: (text: string, role: "user" | "assistant") => void;
  onScoreToggle: (text: string, msgId: string) => void;
  onExtractDialog: (text: string) => void;
  onDelete: (msgId: string) => void;
  onSetDeleteTarget: (msgId: string | null) => void;
  onSetEditContent: (v: string) => void;
  onSendAfterEdit: (msgId: string, role: string, content: string) => void;
  onToggleCollapse: (msgId: string) => void;
}

export function ChatView({
  messages, isLoading, editingMsgId, editContent, deleteTarget, highlightMsgId,
  scorePopup, slopHighlight, slopHighlightOn, toolSlopDetect, collapsedMsgIds,
  renderMessageContent, onStopGeneration, onSwitchVersion, onRetry, onCopy,
  onStartEdit, onSaveEdit, onCancelEdit, onSaveDraft, onScoreToggle,
  onExtractDialog, onDelete, onSetDeleteTarget, onSetEditContent, onSendAfterEdit,
  onToggleCollapse,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const lastTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldAutoScroll.current = distFromBottom < 20;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!shouldAutoScroll.current) return;
    messagesRef.current && (messagesRef.current.scrollTop = messagesRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    if (isLoading) {
      shouldAutoScroll.current = true;
      messagesRef.current && (messagesRef.current.scrollTop = messagesRef.current.scrollHeight);
    }
  }, [isLoading]);

  // 全局追踪最后聚焦的 textarea，避免点击箭头时失焦导致检测不到
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === "TEXTAREA") {
        lastTextareaRef.current = t as HTMLTextAreaElement;
      }
    };
    document.addEventListener("focusin", handler);
    return () => document.removeEventListener("focusin", handler);
  }, []);

  const scrollToTop = () => {
    const el = lastTextareaRef.current;
    if (el && document.contains(el) && el.scrollHeight > el.clientHeight + 4) {
      el.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    messagesRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    const el = lastTextareaRef.current;
    if (el && document.contains(el) && el.scrollHeight > el.clientHeight + 4) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }
    const m = messagesRef.current;
    if (m) m.scrollTo({ top: m.scrollHeight, behavior: "smooth" });
  };

  return (
    <>
      <div className="messages" ref={messagesRef}>
        {messages.length === 0 ? (
          <div className="empty">开始与AI助手对话</div>
        ) : (
          messages.map((msg, i) => (
            <MemoMessageRow
              key={msg.id || i}
              msg={msg}
              index={i}
              editingMsgId={editingMsgId}
              editContent={editContent}
              deleteTarget={deleteTarget}
              highlightMsgId={highlightMsgId}
              scorePopup={scorePopup}
              slopHighlight={slopHighlight}
              slopHighlightOn={slopHighlightOn}
              toolSlopDetect={toolSlopDetect}
              collapsed={collapsedMsgIds.has(msg.id)}
              renderMessageContent={renderMessageContent}
              onStopGeneration={onStopGeneration}
              onSwitchVersion={onSwitchVersion}
              onRetry={onRetry}
              onCopy={onCopy}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onSaveDraft={onSaveDraft}
              onScoreToggle={onScoreToggle}
              onExtractDialog={onExtractDialog}
              onDelete={onDelete}
              onSetDeleteTarget={onSetDeleteTarget}
              onSetEditContent={onSetEditContent}
              onSendAfterEdit={onSendAfterEdit}
              onToggleCollapse={onToggleCollapse}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll Arrows */}
      <button
        onClick={scrollToTop}
        style={{
          position: "fixed", right: 12, top: "50%", zIndex: 50,
          background: "rgba(30,30,30,0.85)", color: "#888", border: "1px solid #333",
          borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, marginBottom: 4, transform: "translateY(-24px)",
        }}
      >&#8593;</button>
      <button
        onClick={scrollToBottom}
        style={{
          position: "fixed", right: 12, top: "50%", zIndex: 50,
          background: "rgba(30,30,30,0.85)", color: "#888", border: "1px solid #333",
          borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, transform: "translateY(24px)",
        }}
      >&#8595;</button>
    </>
  );
}
