import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../store";
import { useChat } from "../hooks/useChat";

export function ChatPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const session = useChatStore((s) => s.currentSession());
  const messages = session?.messages || [];
  const { sendMessage, stopGeneration, isLoading, checkResults } = useChat();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const failedChecks = checkResults.filter((r) => !r.passed);

  return (
    <div className="page">
      <div className="header">
        <button className="header-btn" onClick={() => navigate("/")}>←</button>
        <span className="header-title">{session?.topic || "新对话"}</span>
        <button className="header-btn" onClick={() => navigate("/settings")}>⚙</button>
      </div>

      {/* 检测结果栏 */}
      {failedChecks.length > 0 && (
        <div className="checker-bar checker-warn">
          检测: {failedChecks.map((r) => r.message).join(" | ")}
        </div>
      )}

      <div className="messages">
        {messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className={`msg ${msg.role === "user" ? "msg-user" : "msg-bot"} ${msg.isError ? "msg-error" : ""}`}
          >
            {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
            {msg.streaming && <span className="typing-dot" />}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">&#9672;</div>
            <div>输入提示词开始 AI 辅助写作</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题或写作提示..."
          rows={1}
        />
        {isLoading ? (
          <button className="send-btn" style={{ background: "#e74c3c" }} onClick={stopGeneration}>■</button>
        ) : (
          <button className="send-btn" onClick={handleSend} disabled={!input.trim()}>→</button>
        )}
      </div>
    </div>
  );
}
