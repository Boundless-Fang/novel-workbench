import React from "react";
import type { ChatSession } from "../../types/chat";
import { useProjectStore } from "../../store/projectStore";

interface TopBarProps {
  session: ChatSession | undefined;
  renamingTitle: boolean;
  renameValue: string;
  onToggleHistory: () => void;
  onToggleSearch: () => void;
  onToggleSettings: () => void;
  onCloneSession: () => void;
  onCopySession: () => void;
  onNewChat: () => void;
  onStartRename: () => void;
  onRenameValueChange: (v: string) => void;
  onFinishRename: () => void;
  onCancelRename: () => void;
}

export function TopBar({
  session,
  renamingTitle,
  renameValue,
  onToggleHistory,
  onToggleSearch,
  onToggleSettings,
  onCloneSession,
  onCopySession,
  onNewChat,
  onStartRename,
  onRenameValueChange,
  onFinishRename,
  onCancelRename,
}: TopBarProps) {
  const projectStore = useProjectStore();

  return (
    <div className="topbar">
      <button className="topbar-btn" onClick={onToggleHistory}>&#9776;</button>
      <div className="topbar-title" style={{ cursor: "pointer" }} onClick={onStartRename}>
        {renamingTitle ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onFinishRename(); if (e.key === "Escape") onCancelRename(); }}
            onBlur={onFinishRename}
            style={{ fontSize: 14, fontWeight: "bold", background: "#222", border: "1px solid #555", borderRadius: 4, padding: "2px 6px", color: "#fff", width: "100%", maxWidth: 200 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <div>{session?.topic || "新对话"}</div>
            <div className="topbar-title-meta">
              {projectStore.currentProject()?.name || ""}
              {session ? ` | ${new Date(session.lastUpdate).toLocaleString()}` : ""}
            </div>
          </>
        )}
      </div>
      <button className="topbar-btn" onClick={onCopySession} title="复制输出">&#8659;</button>
      <button className="topbar-btn" onClick={onToggleSearch} title="搜索">&#x2315;</button>
      <button className="topbar-btn" onClick={onCloneSession} title="克隆对话">&#8644;</button>
      <button className="topbar-btn" onClick={onNewChat} title="新对话">&#65291;</button>
      <button className="topbar-btn" onClick={onToggleSettings} title="设置">&#9881;</button>
    </div>
  );
}
