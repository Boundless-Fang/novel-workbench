import React, { useState } from "react";
import { useChatStore, useProjectStore } from "../../store";

interface HistorySidebarProps {
  expandedProjects: Set<string>;
  currentProjectId: string;
  renamingProjectId: string | null;
  renamingProjectName: string;
  creatingProject: boolean;
  newProjectName: string;
  onToggleProject: (id: string) => void;
  onSelectSession: (idx: number) => void;
  onNewChat: () => void;
  onSetCreatingProject: (v: boolean) => void;
  onSetNewProjectName: (v: string) => void;
  onNewProject: (name: string) => void;
  onStartRenameProject: (id: string, name: string) => void;
  onSetRenamingProjectId: (id: string | null) => void;
  onSetRenamingProjectName: (v: string) => void;
  onClose: () => void;
}

export function HistorySidebar({
  expandedProjects, currentProjectId, renamingProjectId, renamingProjectName,
  creatingProject, newProjectName, onToggleProject, onSelectSession, onNewChat,
  onSetCreatingProject, onSetNewProjectName, onNewProject,
  onStartRenameProject, onSetRenamingProjectId, onSetRenamingProjectName, onClose,
}: HistorySidebarProps) {
  const chatStore = useChatStore();
  const projectStore = useProjectStore();

  const handleDeleteProject = (projId: string, projName: string) => {
    if (!confirm(`确定删除项目「${projName}」及其下所有对话？`)) return;
    const pSessions = chatStore.sessions.filter((s) => s.projectId === projId);
    const indices = pSessions
      .map((s) => chatStore.sessions.findIndex((cs) => cs.id === s.id))
      .filter((i) => i >= 0)
      .sort((a, b) => b - a);
    indices.forEach((i) => chatStore.deleteSession(i));
    projectStore.deleteProject(projId);
  };

  const handleFinishRename = (projId: string) => {
    projectStore.renameProject(projId, renamingProjectName);
    onSetRenamingProjectId(null);
  };

  return (
    <>
      <div className="sidebar-overlay" onClick={onClose} />
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>历史</h3>
          <button onClick={onClose}>&#10005;</button>
        </div>
        <div className="sidebar-list">
          {projectStore.projects.map((proj) => {
            const projSessions = chatStore.sessions.filter((s) => s.projectId === proj.id);
            const isExpanded = expandedProjects.has(proj.id);
            const isActive = proj.id === currentProjectId;
            return (
              <div key={proj.id}>
                <div
                  className={`sidebar-item ${isActive ? "active" : ""}`}
                  style={{ fontWeight: "bold", fontSize: 13 }}
                  onClick={() => {
                    onToggleProject(proj.id);
                    projectStore.selectProject(proj.id);
                    const firstSession = projSessions[0];
                    if (firstSession && proj.id !== currentProjectId) {
                      const idx = chatStore.sessions.findIndex((s) => s.id === firstSession.id);
                      if (idx >= 0) chatStore.selectSession(idx);
                    }
                  }}
                >
                  {renamingProjectId === proj.id ? (
                    <input autoFocus value={renamingProjectName}
                      onChange={(e) => onSetRenamingProjectName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleFinishRename(proj.id); if (e.key === "Escape") onSetRenamingProjectId(null); }}
                      onBlur={() => handleFinishRename(proj.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #666", borderRadius: 4, padding: "2px 6px", fontSize: 13, width: 120 }} />
                  ) : (
                    <span>{isExpanded ? "▼ " : "▶ "}{proj.name}</span>
                  )}
                  <span style={{ fontSize: 10, color: "#666" }}>{projSessions.length}</span>
                  {proj.id !== "default" && (
                    <>
                      <button className="sidebar-item-del" style={{ marginRight: 2 }} title="重命名"
                        onClick={(e) => { e.stopPropagation(); onStartRenameProject(proj.id, proj.name); }}>&#9998;</button>
                      <button className="sidebar-item-del" title="删除项目"
                        onClick={(e) => { e.stopPropagation(); handleDeleteProject(proj.id, proj.name); }}>&#10005;</button>
                    </>
                  )}
                </div>
                {isExpanded && projSessions.map((s) => {
                  const idx = chatStore.sessions.findIndex((cs) => cs.id === s.id);
                  return (
                    <div key={s.id}
                      className={`sidebar-item ${idx === chatStore.currentSessionIndex ? "sub-active" : ""} sub-item`}
                      onClick={() => onSelectSession(idx)}
                      style={{ paddingLeft: 24, fontSize: 12 }}>
                      <div className="sidebar-item-info">
                        <div className="sidebar-item-name">{s.topic || "新对话"}</div>
                        <div className="sidebar-item-meta">{s.messages?.length || 0} 条消息</div>
                      </div>
                      <button className="sidebar-item-del"
                        onClick={(e) => { e.stopPropagation(); if (!confirm("确定删除此对话？")) return; chatStore.deleteSession(idx); }}>&#10005;</button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          {creatingProject ? (
            <div style={{ flex: 1, display: "flex", gap: 4 }}>
              <input autoFocus value={newProjectName}
                onChange={(e) => onSetNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onNewProject(newProjectName); if (e.key === "Escape") onSetCreatingProject(false); }}
                placeholder="项目名称"
                style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 4, border: "1px solid #444", background: "#1a1a1a", color: "#fff" }} />
              <button className="btn btn-primary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => onNewProject(newProjectName)}>确定</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => onSetCreatingProject(false)}>取消</button>
            </div>
          ) : (
            <button className="sidebar-new-btn" style={{ flex: 1, fontSize: 12 }} onClick={() => onSetCreatingProject(true)}>&#65291; 项目</button>
          )}
          <button className="sidebar-new-btn" style={{ flex: 1, fontSize: 12 }} onClick={onNewChat}>&#65291; 对话</button>
        </div>
      </div>
    </>
  );
}
