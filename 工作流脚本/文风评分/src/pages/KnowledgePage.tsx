import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useKnowledgeStore } from "../store";
import { pasteSyncProps } from "../utils/text";

export function KnowledgePage() {
  const navigate = useNavigate();
  const store = useKnowledgeStore();
  const items = store.items;
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleAdd = () => {
    if (!title.trim() || !content.trim()) return;
    store.addItem({ title: title.trim(), content: content.trim(), scope: "global" });
    setTitle("");
    setContent("");
    setIsAdding(false);
  };

  return (
    <div className="page">
      <div className="header">
        <span className="header-title">知识库</span>
        <button className="header-btn" onClick={() => { setIsAdding(true); }}>+</button>
      </div>

      {isAdding ? (
        <div className="prompt-editor">
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="条目标题" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} {...pasteSyncProps(() => content, setContent)} placeholder="条目内容（将用于重复检索比对）" />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={handleAdd} style={{ flex: 1 }}>添加</button>
            <button className="btn-danger" onClick={() => setIsAdding(false)}>取消</button>
          </div>
        </div>
      ) : (
        <div className="prompt-list">
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">&#9671;</div>
              <div>还没有知识库条目</div>
              <div style={{ fontSize: 12, color: "#888" }}>添加已有文本用于重复检索比对</div>
              <button className="btn-primary" onClick={() => setIsAdding(true)}>添加条目</button>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="prompt-card">
                <div>
                  <div className="prompt-name">{item.title}</div>
                  <div className="prompt-desc">{item.content.slice(0, 50)}...</div>
                </div>
                <button className="chat-item-del" onClick={() => store.removeItem(item.id)}>✕</button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="bottom-nav">
        <button className="nav-item" onClick={() => navigate("/")}>
          <span className="nav-icon">&#9670;</span>对话
        </button>
        <button className="nav-item" onClick={() => navigate("/prompts")}>
          <span className="nav-icon">&#9642;</span>模板
        </button>
        <button className="nav-item active" onClick={() => navigate("/knowledge")}>
          <span className="nav-icon">&#9671;</span>知识库
        </button>
        <button className="nav-item" onClick={() => navigate("/settings")}>
          <span className="nav-icon">⚙</span>设置
        </button>
      </div>
    </div>
  );
}
