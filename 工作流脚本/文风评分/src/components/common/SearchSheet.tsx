import React, { useState, useEffect, useCallback } from "react";
import { useChatStore, useProjectStore } from "../../store";

interface SearchResult {
  sessionId?: string; sessionTopic?: string; messageId: string; messageIndex: number;
  role: string; snippet: string; matchStart: number; matchLength: number;
  versionIndex?: number; sessionIndex?: number; projectId?: string;
}

interface SearchSheetProps {
  onClose: () => void;
  onHighlight: (msgId: string | null) => void;
}

export function SearchSheet({ onClose, onHighlight }: SearchSheetProps) {
  const chatStore = useChatStore();
  const projectStore = useProjectStore();
  const [searchMode, setSearchMode] = useState<"global" | "session" | "branch">("session");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const doSearch = useCallback((query: string, mode: "global" | "session" | "branch") => {
    if (!query.trim()) { setSearchResults([]); return; }
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    const matchContent = (content: string, extra: any) => {
      const lower = content.toLowerCase();
      let idx = 0;
      while ((idx = lower.indexOf(q, idx)) !== -1) {
        const start = Math.max(0, idx - 30);
        const end = Math.min(content.length, idx + q.length + 50);
        results.push({
          ...extra,
          snippet: (start > 0 ? "\u2026" : "") + content.slice(start, end) + (end < content.length ? "\u2026" : ""),
          matchStart: idx - start + (start > 0 ? 1 : 0),
          matchLength: q.length,
        });
        idx += q.length;
        if (results.length >= 200) return;
      }
    };

    if (mode === "global") {
      chatStore.sessions.forEach((session, si) => {
        session.messages.forEach((msg, mi) => {
          const c = typeof msg.content === "string" ? msg.content : "";
          matchContent(c, { sessionId: session.id, sessionTopic: session.topic, messageId: msg.id, messageIndex: mi, role: msg.role, sessionIndex: si, projectId: session.projectId });
        });
      });
    } else if (mode === "session") {
      const session = chatStore.currentSession();
      if (session) {
        session.messages.forEach((msg, mi) => {
          const c = typeof msg.content === "string" ? msg.content : "";
          matchContent(c, { messageId: msg.id, messageIndex: mi, role: msg.role });
        });
      }
    } else if (mode === "branch") {
      const session = chatStore.currentSession();
      if (session) {
        const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
        if (lastAssistant?.versions) {
          lastAssistant.versions.forEach((v, vi) => {
            matchContent(v.content, { messageId: lastAssistant.id, messageIndex: session.messages.indexOf(lastAssistant), role: "assistant", versionIndex: vi });
          });
        }
      }
    }
    setSearchResults(results);
  }, [chatStore]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(searchQuery, searchMode), 200);
    return () => clearTimeout(timer);
  }, [searchQuery, searchMode, doSearch]);

  const navigateToResult = (r: SearchResult) => {
    onClose();
    if (r.sessionId !== undefined && r.sessionIndex !== undefined) {
      if (r.projectId) projectStore.selectProject(r.projectId);
      chatStore.selectSession(r.sessionIndex);
    }
    if (r.versionIndex !== undefined) {
      chatStore.setActiveVersion(r.messageId, r.versionIndex);
    }
    onHighlight(r.messageId);
    setTimeout(() => {
      const el = document.getElementById(r.messageId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    setTimeout(() => onHighlight(null), 2200);
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-sheet" style={{ position: "absolute", bottom: 0, zIndex: 90, maxHeight: "85vh", width: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "4px 0", display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: "#444", margin: "4px 0 8px" }} />
        </div>
        <div style={{ padding: "0 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>&#x2315;</span>
            <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchMode === "global" ? "全局搜索所有对话…" : searchMode === "branch" ? "跨分支搜索…" : "搜索当前对话…"}
              style={{ flex: 1, background: "#1a1a1a", border: "1px solid #444", borderRadius: 8, padding: "8px 12px", color: "#e8e8e8", fontSize: 14 }} />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} style={{ background: "none", border: "none", color: "#666", fontSize: 16, cursor: "pointer" }}>&#10005;</button>
            )}
            <button onClick={onClose} className="topbar-btn" style={{ fontSize: 16 }}>&#10005;</button>
          </div>
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #2a2a2a", marginBottom: 10 }}>
            {(["global", "session", "branch"] as const).map((m) => (
              <button key={m} onClick={() => { setSearchMode(m); setSearchResults([]); }}
                style={{
                  flex: 1, padding: "8px 0", background: "none", border: "none",
                  color: searchMode === m ? "#a0b0ff" : "#666", fontSize: 13,
                  borderBottom: searchMode === m ? "2px solid #7c8aff" : "2px solid transparent",
                  cursor: "pointer", fontWeight: searchMode === m ? 600 : 400,
                }}>{m === "global" ? "全局查找" : m === "session" ? "本对话查找" : "跨分支查找"}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
          {!searchQuery.trim() ? (
            <div style={{ textAlign: "center", color: "#555", padding: 32, fontSize: 13 }}>
              {searchMode === "global" ? "输入关键词搜索所有对话记录" : searchMode === "branch" ? "搜索当前对话最新 AI 输出的所有分支版本" : "输入关键词搜索当前对话内容"}
            </div>
          ) : searchResults.length === 0 ? (
            <div style={{ textAlign: "center", color: "#555", padding: 32, fontSize: 13 }}>无匹配结果</div>
          ) : (
            <>
              {searchResults.map((r, ri) => (
                <div key={`${r.messageId}-${r.versionIndex ?? ""}-${ri}`}
                  onClick={() => navigateToResult(r)}
                  style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, cursor: "pointer", background: "#1a1a1a", border: "1px solid #2a2a2a", transition: "background .12s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#252530"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#1a1a1a"; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, fontWeight: 600, color: r.role === "user" ? "#7c8aff" : "#5ac85a", background: r.role === "user" ? "rgba(124,138,255,0.15)" : "rgba(90,200,90,0.15)" }}>{r.role === "user" ? "用户" : "AI"}</span>
                    {r.versionIndex !== undefined && (
                      <span style={{ fontSize: 10, color: "#f0a040", background: "rgba(240,160,64,0.15)", padding: "1px 5px", borderRadius: 4 }}>分支{r.versionIndex + 1}</span>
                    )}
                    {r.sessionTopic && (
                      <span style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sessionTopic.length > 20 ? r.sessionTopic.slice(0, 20) + "…" : r.sessionTopic}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.5, wordBreak: "break-all" }}>
                    {r.snippet.slice(0, r.matchStart)}
                    <span style={{ background: "rgba(255,200,50,0.3)", borderRadius: 2, padding: "0 1px", fontWeight: 600, color: "#ffe088" }}>{r.snippet.slice(r.matchStart, r.matchStart + r.matchLength)}</span>
                    {r.snippet.slice(r.matchStart + r.matchLength)}
                  </div>
                </div>
              ))}
              <div style={{ textAlign: "center", color: "#555", fontSize: 11, padding: "6px 0" }}>共 {searchResults.length} 条</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
