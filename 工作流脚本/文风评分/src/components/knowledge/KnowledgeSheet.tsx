import React, { useState, useCallback } from "react";
import { useChatStore, usePromptStore, useKnowledgeStore } from "../../store";
import { generateId } from "../../utils/id";
import { pasteSyncProps } from "../../utils/text";
import type { DraftMessage } from "../../types/chat";

interface KnowledgeSheetProps {
  sheetHeight: number;
  kbCategory: string;
  kbSearch: string;
  kbScope: "global" | "project";
  kbAdding: boolean;
  kbTitle: string;
  kbContent: string;
  editingKbId: string | null;
  editingKbType: "prompt" | "knowledge" | null;
  currentProjectId: string;
  lastDeletedRef: React.MutableRefObject<string | null>;
  input: string;
  editingDraftId: string | null;
  editContent: string;
  onSetKbCategory: (v: string) => void;
  onSetKbSearch: (v: string) => void;
  onSetKbScope: (v: "global" | "project") => void;
  onSetKbAdding: (v: boolean) => void;
  onSetKbTitle: (v: string) => void;
  onSetKbContent: (v: string) => void;
  onSetEditingKbId: (v: string | null) => void;
  onSetEditingKbType: (v: "prompt" | "knowledge" | null) => void;
  onSetEditingDraftId: (v: string | null) => void;
  onSetEditContent: (v: string) => void;
  onSetInput: (v: string) => void;
  onClose: () => void;
  onSheetDragStart: (e: React.PointerEvent) => void;
  onSheetDragMove: (e: React.PointerEvent) => void;
  onSheetDragEnd: () => void;
}

export function KnowledgeSheet({
  sheetHeight, kbCategory, kbSearch, kbScope, kbAdding, kbTitle, kbContent,
  editingKbId, editingKbType, currentProjectId, lastDeletedRef, input,
  editingDraftId, editContent,
  onSetKbCategory, onSetKbSearch, onSetKbScope, onSetKbAdding, onSetKbTitle,
  onSetKbContent, onSetEditingKbId, onSetEditingKbType, onSetEditingDraftId,
  onSetEditContent, onSetInput, onClose,
  onSheetDragStart, onSheetDragMove, onSheetDragEnd,
}: KnowledgeSheetProps) {
  const chatStore = useChatStore();
  const prompts = usePromptStore();
  const knowledge = useKnowledgeStore();
  const session = chatStore.currentSession();

  const handleInjectToChat = (title: string, content: string) => {
    const store = useChatStore.getState();
    store.addChatKnowledge({ title, content });
    lastDeletedRef.current = title;
    const marker = `{{kb:${title}}}`;
    if (!input.includes(marker)) {
      onSetInput(input ? input + "\n" + marker : marker);
    }
  };

  const handleShuffleInject = (title: string, content: string) => {
    const lines = content.split(/\n/);
    const shuffled = lines.map((line) => {
      // 只对含 ： 的词汇列表行洗牌，其他行原样保留
      const colonIdx = line.indexOf("：");
      if (colonIdx < 0) return line;
      const prefix = line.slice(0, colonIdx + 1);
      const body = line.slice(colonIdx + 1);
      const tokens = body.split(/[、]/).filter((t) => t.trim());
      if (tokens.length <= 1) return line;
      for (let i = tokens.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
      }
      return prefix + tokens.join("、");
    });
    handleInjectToChat(title, shuffled.join("\n"));
  };

  const handleKbAdd = () => {
    if (!kbTitle.trim() || !kbContent.trim()) return;
    if (kbCategory === "提示词") {
      const exists = prompts.getAll().some((p) => p.name === kbTitle.trim());
      if (exists) { alert("已存在同名提示词"); return; }
      prompts.create({ name: kbTitle.trim(), description: "", context: [{ role: "system" as const, content: kbContent.trim(), id: generateId(), date: new Date().toLocaleString() }], modelConfig: {}, builtin: false, scope: kbScope, projectId: kbScope === "project" ? currentProjectId : undefined });
    } else if (kbCategory === "草稿") {
      useChatStore.getState().addDraft({ id: generateId(), role: "user", content: kbContent.trim(), date: new Date().toLocaleString() });
    } else {
      const exists = knowledge.items.some((i) => i.category === kbCategory && i.title === kbTitle.trim() && i.content === kbContent.trim());
      if (exists) { alert("已存在完全相同的条目"); return; }
      knowledge.addItem({ title: kbTitle.trim(), content: kbContent.trim(), category: kbCategory, scope: kbScope, projectId: kbScope === "project" ? currentProjectId : undefined });
    }
    onSetKbTitle(""); onSetKbContent(""); onSetKbAdding(false);
  };

  const handleInjectAll = () => {
    if (kbCategory === "提示词") {
      const allPrompts = prompts.getAll(currentProjectId);
      allPrompts.forEach((p) => handleInjectToChat(p.name, p.context?.[0]?.content as string || ""));
    } else if (kbCategory === "草稿") {
      session?.drafts?.forEach((d) => handleInjectToChat(`草稿 ${d.date}`, d.content));
    } else {
      const items = knowledge.getByCategory(kbCategory, currentProjectId);
      items.forEach((item) => handleInjectToChat(item.title, item.content));
    }
  };
  const handleKbEdit = (id: string, type: "prompt" | "knowledge", title: string, content: string, scope?: "global" | "project") => {
      onSetEditingKbId(id); onSetEditingKbType(type); onSetKbTitle(title); onSetKbContent(content);
      if (scope) onSetKbScope(scope); onSetKbAdding(false);
    };

  const handleKbEditSave = () => {
    if (!kbTitle.trim() || !kbContent.trim()) return;
    if (editingKbType === "prompt" && editingKbId) {
      prompts.updatePrompt(editingKbId, (p) => { p.name = kbTitle.trim(); p.context = [{ role: "system" as const, content: kbContent.trim(), id: editingKbId!, date: "" }]; p.scope = kbScope; p.projectId = kbScope === "project" ? currentProjectId : undefined; });
    } else if (editingKbType === "knowledge" && editingKbId) {
      knowledge.updateItem(editingKbId, { title: kbTitle.trim(), content: kbContent.trim(), scope: kbScope, projectId: kbScope === "project" ? currentProjectId : undefined });
    }
    onSetEditingKbId(null); onSetEditingKbType(null); onSetKbTitle(""); onSetKbContent("");
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-sheet" style={{ position: "absolute", bottom: 0, zIndex: 90, height: `${sheetHeight}vh`, maxHeight: "none", width: "100%" }}>
        <div className="modal-handle drag-handle" onPointerDown={onSheetDragStart} onPointerMove={onSheetDragMove} onPointerUp={onSheetDragEnd}
          style={{ cursor: "ns-resize", padding: "6px 0", marginBottom: 4 }} />
        <div className="modal-title" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          知识库
          {(session?.chatKnowledge?.length ?? 0) > 0 && (
            <span style={{ fontSize: 11, background: "#5a3a8a", color: "#fff", borderRadius: 10, padding: "1px 7px", fontWeight: "normal" }}>
              已注入 {session.chatKnowledge.length}
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button className="topbar-btn" title="注入当前分类下全部条目" style={{ fontSize: 13, padding: "2px 6px", color: "#7c8aff" }}
              onClick={handleInjectAll}>&#8659;&#8659;</button>
            <button className="topbar-btn" title="撤回上次注入" style={{ fontSize: 13, padding: "2px 6px" }}
              onClick={() => {
                const title = lastDeletedRef.current;
                if (!title) return;
                const ses = useChatStore.getState().currentSession();
                const item = ses?.chatKnowledge?.find((k) => k.title === title);
                if (item) useChatStore.getState().deleteChatKnowledge(item.id);
                onSetInput(input.replace(new RegExp(`\\{\\{kb:${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}\n?`, 'g'), '').trimEnd());
                lastDeletedRef.current = null;
              }}>&#8630;</button>
            <button className="topbar-btn" title="清空全部注入" style={{ fontSize: 13, padding: "2px 6px" }}
              onClick={() => {
                const ses = useChatStore.getState().currentSession();
                const count = ses?.chatKnowledge?.length ?? 0;
                if (count === 0) return;
                if (!confirm(`确认清空已注入的全部 ${count} 条？`)) return;
                ses?.chatKnowledge?.forEach((k) => useChatStore.getState().deleteChatKnowledge(k.id));
                onSetInput(input.replace(/\{\{kb:[^}]+\}\}\n?/g, '').trimEnd());
                lastDeletedRef.current = null;
              }}>&#10007;</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#666", marginBottom: 6, textAlign: "center" }}>
          点击 ↓ 注入 | 在输入框中自由调整标记位置
        </div>

        {/* Search */}
        <div style={{ marginBottom: 6, position: "relative" }}>
          <input value={kbSearch} onChange={(e) => onSetKbSearch(e.target.value)} placeholder="搜索知识库..."
            style={{ width: "100%", background: "#222", border: "1px solid #444", borderRadius: 8, padding: "8px 30px 8px 10px", color: "#e8e8e8", fontSize: 13 }} />
          {kbSearch && (
            <button onClick={() => onSetKbSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#666", fontSize: 14, background: "none", border: "none", cursor: "pointer" }}>&#10005;</button>
          )}
        </div>

        {/* Category Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, marginBottom: 6 }}>
          {["提示词","信息卡","词库","草稿","正文","参考"].map((cat) => (
            <button key={cat}
              className={`btn ${kbCategory === cat && !kbSearch ? "btn-primary" : "btn-ghost"}`}
              style={{ fontSize: 11, padding: "4px 0", textAlign: "center", borderRadius: 6 }}
              onClick={() => { onSetKbCategory(cat); onSetKbSearch(""); onSetKbAdding(false); onSetEditingKbId(null); }}
            >{cat}</button>
          ))}
        </div>

        {/* Search Results */}
        {kbSearch.trim() ? (
          <div>
            <div style={{ fontSize: 12, color: "#7c8aff", marginBottom: 6 }}>
              搜索「{kbSearch}」— {knowledge.searchItems(kbSearch, currentProjectId).length} 条结果
            </div>
            {(() => {
              const results = knowledge.searchItems(kbSearch, currentProjectId).sort((a, b) => b.createdAt - a.createdAt);
              return results.length > 0 ? results.map((item) => (
                <div key={item.id} className="kb-item">
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => { onSetInput(item.content); onClose(); }}>
                    <div className="kb-item-name">{item.title}</div>
                    <div className="kb-item-desc">{item.content.slice(0, 60)}</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{item.category || "未分类"} · {item.scope === "global" ? "通用" : "项目"} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</div>
                  </div>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button className="msg-action-btn" title="乱序注入" onClick={(e) => { e.stopPropagation(); handleShuffleInject(item.title, item.content); }}>&#8635;</button>
                    <button className="msg-action-btn" title="注入" onClick={(e) => { e.stopPropagation(); handleInjectToChat(item.title, item.content); }}>&#8595;</button>
                    <button className="msg-action-btn" title="编辑" onClick={(e) => { e.stopPropagation(); handleKbEdit(item.id, "knowledge", item.title, item.content, item.scope); }}>&#9998;</button>
                    <button className="msg-action-btn" title="删除" onClick={(e) => { e.stopPropagation(); if (!confirm("确定删除此条目？")) return; knowledge.removeItem(item.id); }}>&#10007;</button>
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: 12, color: "#555", padding: "12px 0", textAlign: "center" }}>无匹配结果</div>
              );
            })()}
          </div>
        ) : (<>

          {/* Add/Edit Form */}
          {(kbAdding || editingKbId) ? (
            <div className="kb-editor">
              <input value={kbTitle} onChange={(e) => onSetKbTitle(e.target.value)} placeholder="标题" />
              <textarea value={kbContent} onChange={(e) => onSetKbContent(e.target.value)} {...pasteSyncProps(() => kbContent, onSetKbContent)} placeholder="内容" />
              {kbCategory !== "提示词" && <div style={{ fontSize: 12, color: "#888" }}>分类：{kbCategory}</div>}
              {kbCategory !== "草稿" && (
                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                  <button className={`btn ${kbScope === "global" ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1, fontSize: 12, padding: "4px 8px" }} onClick={() => onSetKbScope("global")}>通用</button>
                  <button className={`btn ${kbScope === "project" ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1, fontSize: 12, padding: "4px 8px" }} onClick={() => onSetKbScope("project")}>限定</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={editingKbId ? handleKbEditSave : handleKbAdd}>
                  {editingKbId ? "保存修改" : "保存"}
                </button>
                <button className="btn btn-ghost" onClick={() => { onSetKbAdding(false); onSetEditingKbId(null); onSetKbTitle(""); onSetKbContent(""); }}>取消</button>
              </div>
            </div>
          ) : kbCategory === "提示词" ? (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                <button className="btn btn-ghost" style={{ color: "#7c8aff", fontSize: 12, padding: "4px 8px" }} onClick={() => { onSetKbAdding(true); onSetKbScope("global"); }}>&#65291; 添加</button>
              </div>
              {(() => {
                const allPrompts = prompts.getAll(currentProjectId);
                return allPrompts.length > 0 ? allPrompts.map((p) => (
                  <div key={p.id} className="kb-item">
                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => { onSetInput(p.context?.[0]?.content as string || ""); onClose(); }}>
                      <div className="kb-item-name">{p.name}</div>
                      <div className="kb-item-desc">{p.description || (p.context?.[0]?.content as string || "").slice(0, 40)}</div>
                      <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{p.scope === "global" ? "通用" : "项目"} · {new Date(p.createdAt).toLocaleDateString("zh-CN")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button className="msg-action-btn" title="乱序注入" onClick={(e) => { e.stopPropagation(); handleShuffleInject(p.name, p.context?.[0]?.content as string || ""); }}>&#8635;</button>
                      <button className="msg-action-btn" title="注入" onClick={(e) => { e.stopPropagation(); handleInjectToChat(p.name, p.context?.[0]?.content as string || ""); }}>&#8595;</button>
                      <button className="msg-action-btn" title="编辑" onClick={(e) => { e.stopPropagation(); handleKbEdit(p.id, "prompt", p.name, p.context?.[0]?.content as string || "", p.scope); }}>&#9998;</button>
                      <button className="msg-action-btn" title="删除" onClick={(e) => { e.stopPropagation(); if (!confirm("确定删除此提示词？")) return; prompts.remove(p.id); }}>&#10007;</button>
                    </div>
                  </div>
                )) : (
                  <div style={{ fontSize: 12, color: "#555", padding: "12px 0", textAlign: "center" }}>暂无内容</div>
                );
              })()}
            </div>
          ) : kbCategory === "草稿" ? (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                <button className="btn btn-ghost" style={{ color: "#7c8aff", fontSize: 12, padding: "4px 8px" }} onClick={() => onSetKbAdding(true)}>&#65291; 添加</button>
              </div>
              {session?.drafts && session.drafts.length > 0 ? session.drafts.map((draft) => (
                editingDraftId === draft.id ? (
                  <div key={draft.id} className="kb-editor" style={{ marginBottom: 4 }}>
                    <textarea value={editContent} onChange={(e) => onSetEditContent(e.target.value)}
                      {...pasteSyncProps(() => editContent, onSetEditContent)}
                      placeholder="编辑草稿内容..."
                      style={{ minHeight: 80, width: "100%", background: "#222", border: "1px solid #444", padding: 8, borderRadius: 6, color: "#e8e8e8", fontSize: 12, resize: "vertical", fontFamily: "inherit" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button className="btn btn-primary" style={{ flex: 1, fontSize: 12 }} onClick={() => {
                        useChatStore.getState().updateCurrentSession((s) => { const d = s.drafts?.find((x) => x.id === draft.id); if (d) d.content = editContent; });
                        onSetEditingDraftId(null);
                      }}>保存</button>
                      <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => onSetEditingDraftId(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div key={draft.id} className="kb-item">
                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => { onSetInput(draft.content); onClose(); }}>
                      <div className="kb-item-name">{draft.date}</div>
                      <div className="kb-item-desc" style={{ color: draft.role === "user" ? "#7c8aff" : "#5ac85a" }}>
                        [{draft.role === "user" ? "用户" : "AI"}] {draft.content.slice(0, 60)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button className="msg-action-btn" title="乱序注入" onClick={(e) => { e.stopPropagation(); handleShuffleInject(`草稿 ${draft.date}`, draft.content); }}>&#8635;</button>
                      <button className="msg-action-btn" title="注入" onClick={(e) => { e.stopPropagation(); handleInjectToChat(`草稿 ${draft.date}`, draft.content); }}>&#8595;</button>
                      <button className="msg-action-btn" title="编辑" onClick={(e) => { e.stopPropagation(); onSetEditingDraftId(draft.id); onSetEditContent(draft.content); }}>&#9998;</button>
                      <button className="msg-action-btn" title="删除" onClick={(e) => { e.stopPropagation(); if (!confirm("确定删除此草稿？")) return; useChatStore.getState().deleteDraft(draft.id); }}>&#10007;</button>
                    </div>
                  </div>
                )
              )) : (
                <div style={{ fontSize: 12, color: "#555", padding: "12px 0", textAlign: "center" }}>暂无草稿</div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                <button className="btn btn-ghost" style={{ color: "#7c8aff", fontSize: 12, padding: "4px 8px" }} onClick={() => { onSetKbAdding(true); onSetKbScope("global"); }}>&#65291; 添加</button>
              </div>
              {(() => {
                const filtered = knowledge.getByCategory(kbCategory, currentProjectId);
                return filtered.length > 0 ? filtered.map((item) => (
                  <div key={item.id} className="kb-item">
                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => { onSetInput(item.content); onClose(); }}>
                      <div className="kb-item-name">{item.title}</div>
                      <div className="kb-item-desc">{item.content.slice(0, 60)}</div>
                      <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{item.scope === "global" ? "通用" : "项目"} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button className="msg-action-btn" title="乱序注入" onClick={(e) => { e.stopPropagation(); handleShuffleInject(item.title, item.content); }}>&#8635;</button>
                      <button className="msg-action-btn" title="注入" onClick={(e) => { e.stopPropagation(); handleInjectToChat(item.title, item.content); }}>&#8595;</button>
                      <button className="msg-action-btn" title="编辑" onClick={(e) => { e.stopPropagation(); handleKbEdit(item.id, "knowledge", item.title, item.content, item.scope); }}>&#9998;</button>
                      <button className="msg-action-btn" title="删除" onClick={(e) => { e.stopPropagation(); if (!confirm("确定删除此条目？")) return; knowledge.removeItem(item.id); }}>&#10007;</button>
                    </div>
                  </div>
                )) : (
                  <div style={{ fontSize: 12, color: "#555", padding: "12px 0", textAlign: "center" }}>暂无内容</div>
                );
              })()}
            </div>
          )}</>
        )}
      </div>
    </>
  );
}
