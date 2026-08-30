import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePromptStore } from "../store";
import { pasteSyncProps } from "../utils/text";

export function PromptsPage() {
  const navigate = useNavigate();
  const prompts = usePromptStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const allPrompts = prompts.getAll();

  const startNew = () => {
    setEditName("");
    setEditTemplate("");
    setEditDesc("");
    setIsEditing(true);
  };

  const startEdit = (id: string) => {
    const p = prompts.get(id);
    if (!p) return;
    setEditName(p.name);
    setEditTemplate(p.context?.[0]?.content as string || "");
    setEditDesc(p.description || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editName.trim()) return;
    prompts.create({
      name: editName.trim(),
      context: [{ role: "system", content: editTemplate, id: "", date: "" }],
      description: editDesc.trim(),
      modelConfig: {},
      builtin: false,
    });
    setIsEditing(false);
  };

  return (
    <div className="page">
      <div className="header">
        <span className="header-title">提示词模板</span>
        <button className="header-btn" onClick={startNew}>+</button>
      </div>

      {isEditing ? (
        <div className="prompt-editor">
          <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="模板名称" />
          <input className="form-input" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="模板描述（可选）" />
          <textarea value={editTemplate} onChange={(e) => setEditTemplate(e.target.value)} {...pasteSyncProps(() => editTemplate, setEditTemplate)} placeholder="输入提示词模板，使用 {{input}} 作为用户输入占位符..." />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={handleSave} style={{ flex: 1 }}>保存</button>
            <button className="btn-danger" onClick={() => setIsEditing(false)}>取消</button>
          </div>
        </div>
      ) : (
        <div className="prompt-list">
          {allPrompts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">&#9642;</div>
              <div>还没有保存的模板</div>
              <button className="btn-primary" onClick={startNew}>新建模板</button>
            </div>
          ) : (
            allPrompts.map((p) => (
              <div key={p.id} className="prompt-card" onClick={() => startEdit(p.id)}>
                <div>
                  <div className="prompt-name">{p.name}</div>
                  <div className="prompt-desc">{p.description || "无描述"}</div>
                </div>
                <button className="chat-item-del" onClick={(e) => { e.stopPropagation(); prompts.remove(p.id); }}>✕</button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="bottom-nav">
        <button className="nav-item" onClick={() => navigate("/")}>
          <span className="nav-icon">&#9670;</span>对话
        </button>
        <button className="nav-item active" onClick={() => navigate("/prompts")}>
          <span className="nav-icon">&#9642;</span>模板
        </button>
        <button className="nav-item" onClick={() => navigate("/knowledge")}>
          <span className="nav-icon">&#9671;</span>知识库
        </button>
        <button className="nav-item" onClick={() => navigate("/settings")}>
          <span className="nav-icon">⚙</span>设置
        </button>
      </div>
    </div>
  );
}
