import React from "react";
import { pasteSyncProps } from "../../utils/text";
import type { ChatMessage as ChatMessageType } from "../../types/chat";
import type { LiveHighlight } from "../../services/checker";

interface MessageRowProps {
  msg: ChatMessageType;
  index: number;
  editingMsgId: string | null;
  editContent: string;
  deleteTarget: string | null;
  highlightMsgId: string | null;
  scorePopup: { id: string; score: number; grade: string; hits: number } | null;
  slopHighlight: LiveHighlight | null;
  slopHighlightOn: boolean;
  toolSlopDetect: boolean;
  collapsed: boolean;
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

export function MemoMessageRow(props: MessageRowProps) {
  const {
    msg, index, editingMsgId, editContent, deleteTarget, highlightMsgId,
    scorePopup, slopHighlight, slopHighlightOn, toolSlopDetect, collapsed,
    renderMessageContent,
    onStopGeneration, onSwitchVersion, onRetry, onCopy, onStartEdit,
    onSaveEdit, onCancelEdit, onSaveDraft, onScoreToggle, onExtractDialog,
    onDelete, onSetDeleteTarget, onSetEditContent, onSendAfterEdit,
    onToggleCollapse,
  } = props;

  const contentText = typeof msg.content === "string" ? msg.content : "";
  const isCollapsible = !msg.streaming && contentText.length > 0;
  // 本消息字数（不含思考过程），模型输出完成后显示在消息底部
  const charCount = contentText.length;

  // 取前三行
  const first3Lines = (() => {
    if (!contentText) return "";
    const lines = contentText.split("\n");
    const three = lines.slice(0, 3).join("\n");
    return lines.length > 3 ? three + "\n..." : three;
  })();

  return (
    <div
      key={msg.id || index}
      id={msg.id}
      className={`msg-row ${msg.role === "user" ? "user" : "bot"}`}
      style={{
        ...(editingMsgId === msg.id ? { maxWidth: "100%", width: "100%" } : {}),
        ...(highlightMsgId === msg.id ? { animation: "searchHighlight 2s ease-out" } : {}),
      }}
    >
      {editingMsgId === msg.id ? (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            ref={(el) => { if (el) el.focus(); }}
            value={editContent}
            onChange={(e) => onSetEditContent(e.target.value)}
            {...pasteSyncProps(() => editContent, onSetEditContent)}
            style={{
              width: "100%", minHeight: 200, maxHeight: "50vh", background: "#1a1a1a",
              border: "1px solid #444", borderRadius: 10, padding: 12, color: "#e8e8e8",
              fontSize: 14, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit",
            }}
            className="edit-textarea"
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }} onClick={onSaveEdit}>保存</button>
            <button className="btn" style={{ fontSize: 12, flex: 1, background: "#5a3a8a", color: "#fff" }} onClick={() => {
              onSaveEdit();
              onSendAfterEdit(msg.id, msg.role, editContent);
            }}>发送</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, flex: 1 }} onClick={onCancelEdit}>取消</button>
          </div>
        </div>
      ) : (
        <>
          <div className={`msg-bubble ${msg.isError ? "error" : ""}`}>
            {msg.reasoningContent && !msg.streaming && (
              <details className="reasoning-details">
                <summary className="reasoning-summary">思考过程 ({msg.reasoningContent.length} 字)</summary>
                <div className="reasoning-content">{msg.reasoningContent}</div>
              </details>
            )}
            {msg.streaming && msg.reasoningContent && (
              <details className="reasoning-details" open>
                <summary className="reasoning-summary">思考中...</summary>
                <div className="reasoning-content">{msg.reasoningContent}</div>
              </details>
            )}
            {isCollapsible && collapsed ? (
              <div style={{ whiteSpace: "pre-wrap" }}>{first3Lines}</div>
            ) : (
              typeof msg.content === "string"
                ? renderMessageContent(msg.content, msg.id)
                : JSON.stringify(msg.content)
            )}
            {msg.streaming && <><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></>}
            {isCollapsible && (
              <button
                className="collapse-toggle-btn"
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(msg.id); }}
                style={{
                  marginTop: 6, fontSize: 12, background: "transparent", border: "1px solid #444",
                  borderRadius: 6, color: "#aaa", cursor: "pointer", padding: "2px 10px",
                }}
              >
                {collapsed ? "展开" : "收起"}
              </button>
            )}
          </div>
          {msg.role === "assistant" && msg.streaming && (
            <div className="msg-actions">
              <button className="msg-action-btn stop" onClick={onStopGeneration} title="中断生成">&#9724; 中断</button>
            </div>
          )}
          {msg.role === "assistant" && !msg.streaming && (
            <div className="msg-actions">
              {msg.versions && msg.versions.length > 1 && (
                <div className="msg-version">
                  <button className="msg-version-btn" onClick={() => onSwitchVersion(msg.id, -1)} disabled={(msg.active_version ?? 0) <= 0}>&lt;</button>
                  <span>{(msg.active_version ?? 0) + 1}/{msg.versions.length}</span>
                  <button className="msg-version-btn" onClick={() => onSwitchVersion(msg.id, 1)} disabled={(msg.active_version ?? 0) >= msg.versions.length - 1}>&gt;</button>
                </div>
              )}
              {deleteTarget === msg.id ? (
                <div className="msg-actions" style={{ gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#e44" }}>确定删除？</span>
                  <button className="msg-action-btn danger" onClick={() => onDelete(msg.id)}>确定</button>
                  <button className="msg-action-btn" onClick={() => onSetDeleteTarget(null)}>取消</button>
                </div>
              ) : (
                <>
                  <button className="msg-action-btn" onClick={() => onRetry(index)} title="重试">&#8635;</button>
                  <button className="msg-action-btn" onClick={() => onCopy(typeof msg.content === "string" ? msg.content : "")} title="复制">&#10697;</button>
                  <button className="msg-action-btn" onClick={() => onStartEdit(msg.id, typeof msg.content === "string" ? msg.content : "")} title="编辑">&#9998;</button>
                  <button className="msg-action-btn" onClick={() => onSaveDraft(typeof msg.content === "string" ? msg.content : "", "assistant")} title="另存为草稿">&#9632;</button>
                  {scorePopup?.id === msg.id ? (
                    <span className="msg-action-btn" title={`${scorePopup.hits} hits`} style={{ fontSize: 11, fontWeight: "bold", color: scorePopup.score >= 7 ? "#4caf50" : scorePopup.score >= 5 ? "#ff9800" : "#f44336", cursor: "default" }}>
                      {scorePopup.score}/10 {scorePopup.grade}
                    </span>
                  ) : (
                    <button className="msg-action-btn" onClick={() => onScoreToggle(typeof msg.content === "string" ? msg.content : "", msg.id)} title="评分/高亮" style={slopHighlightOn ? { color: "#ff9800" } : undefined}>&#9733;</button>
                  )}
                  {typeof msg.content === "string" && (
                    <button className="msg-action-btn" onClick={() => onExtractDialog(msg.content as string)} title="对话提取">&#10077;</button>
                  )}
                  <button className="msg-action-btn" onClick={() => onSetDeleteTarget(msg.id)} title="删除">&#10007;</button>
                </>
              )}
              <span className="msg-count" title="本消息字数">{charCount.toLocaleString()} 字</span>
            </div>
          )}
          {msg.role === "user" && !msg.streaming && (
            <div className="msg-actions">
              {deleteTarget === msg.id ? (
                <div className="msg-actions" style={{ gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#e44" }}>确定删除？</span>
                  <button className="msg-action-btn danger" onClick={() => onDelete(msg.id)}>确定</button>
                  <button className="msg-action-btn" onClick={() => onSetDeleteTarget(null)}>取消</button>
                </div>
              ) : (
                <>
                  <button className="msg-action-btn" onClick={() => onCopy(typeof msg.content === "string" ? msg.content : "")} title="复制">&#10697;</button>
                  <button className="msg-action-btn" onClick={() => onStartEdit(msg.id, typeof msg.content === "string" ? msg.content : "")} title="编辑">&#9998;</button>
                  <button className="msg-action-btn" onClick={() => onSaveDraft(typeof msg.content === "string" ? msg.content : "", "user")} title="另存为草稿">&#9632;</button>
                  {typeof msg.content === "string" && (
                    <button className="msg-action-btn" onClick={() => onExtractDialog(msg.content as string)} title="对话提取">&#10077;</button>
                  )}
                  <button className="msg-action-btn" onClick={() => onSetDeleteTarget(msg.id)} title="删除">&#10007;</button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
