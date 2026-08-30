import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChatStore, useSettingsStore, useProjectStore, useOutlineStore } from "../store";
import { useChat } from "../hooks/useChat";
import { generateId } from "../utils/id";
import { copyToClipboard } from "../utils/text";
import { fullSlopScan, liveHighlightScan, summarizeReport, type LiveHighlight, type SlopReport } from "../services/checker";
import { generateOutlinePrompt } from "../types/outline";
import { TopBar } from "../components/chat/ChatHeader";
import { CheckerBar } from "../components/common/CheckerBar";
import { ChatView } from "../components/chat/ChatView";
import { InputSection } from "../components/chat/InputSection";
import { HistorySidebar } from "../components/chat/HistorySidebar";
import { SettingsPanel } from "../components/settings/SettingsPanel";
import { KnowledgeSheet } from "../components/knowledge/KnowledgeSheet";
import { OutlineConfigSheet } from "../components/knowledge/OutlineConfigSheet";
import { SearchSheet } from "../components/common/SearchSheet";

export function HomePage() {
  // ====== View toggles ======
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showToolPanel, setShowToolPanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showOutlineConfig, setShowOutlineConfig] = useState(false);

  // ====== Knowledge sheet state ======
  const [sheetHeight, setSheetHeight] = useState(55);
  const sheetDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [kbCategory, setKbCategory] = useState("提示词");
  const [kbSearch, setKbSearch] = useState("");
  const [kbScope, setKbScope] = useState<"global" | "project">("global");
  const [kbAdding, setKbAdding] = useState(false);
  const [kbTitle, setKbTitle] = useState("");
  const [kbContent, setKbContent] = useState("");
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [editingKbType, setEditingKbType] = useState<"prompt" | "knowledge" | null>(null);

  // ====== Input state ======
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ====== Edit & delete ======
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const lastDeletedRef = useRef<string | null>(null);

  // ====== Rename ======
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // ====== Slop / scoring ======
  const [toolSlopDetect, setToolSlopDetect] = useState(false);
  const [slopReport, setSlopReport] = useState<SlopReport | null>(null);
  const [slopHighlight, setSlopHighlight] = useState<LiveHighlight | null>(null);
  const [scorePopup, setScorePopup] = useState<{ id: string; score: number; grade: string; hits: number } | null>(null);
  const [slopHighlightOn, setSlopHighlightOn] = useState(() => useSettingsStore.getState().slopHighlightEnabled);
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ====== Collapse messages ======
  const [collapsedMsgIds, setCollapsedMsgIds] = useState<Set<string>>(new Set());

  // ====== Auto retry ======
  const [toolAutoRetry, setToolAutoRetry] = useState(false);
  const [autoRetryMinScore, setAutoRetryMinScore] = useState(7);
  const [autoRetryMaxCount, setAutoRetryMaxCount] = useState(3);
  const [autoRetryScanFreq, setAutoRetryScanFreq] = useState<"once" | "per1k">("once");
  const autoRetryCountRef = useRef(0);
  const streamScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ====== Struct input ======
  const [toolStructInput, setToolStructInput] = useState(false);
  const [structCount, setStructCount] = useState(2);
  const [structInputs, setStructInputs] = useState<string[]>(["", ""]);
  const [structCollapsed, setStructCollapsed] = useState<Set<number>>(new Set());

  // ====== Local rewrite ======
  const [toolLocalRewrite, setToolLocalRewrite] = useState(false);
  const [rewritePrefix, setRewritePrefix] = useState("");
  const [rewriteSuffix, setRewriteSuffix] = useState("");
  const [rewriteShowSuffix, setRewriteShowSuffix] = useState(false);

  // ====== History sidebar ======
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingProjectName, setRenamingProjectName] = useState("");

  // ====== Search highlight (shared between SearchSheet and ChatView) ======
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);

  // ====== Stores ======
  const chatStore = useChatStore();
  const settings = useSettingsStore();
  const projectStore = useProjectStore();
  const outlineStore = useOutlineStore();
  const { sendMessage, retryMessage, stopGeneration, isLoading, checkResults } = useChat();

  const session = chatStore.currentSession();
  const messages = session?.messages || [];
  const prevIsLoading = useRef(isLoading);
  const failedChecks = checkResults.filter((r) => !r.passed);
  const currentProjectId = projectStore.currentProjectId;

  // ====== Native input sync (Android WebView IME) ======
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onNativeInput = () => { if (el.value !== input) setInput(el.value); };
    el.addEventListener("input", onNativeInput);
    const timer = setInterval(() => { if (el.value !== input) setInput(el.value); }, 500);
    return () => { el.removeEventListener("input", onNativeInput); clearInterval(timer); };
  }, [input]);

  // ====== Slop scoring helpers ======
  const clearScorePopup = useCallback(() => {
    setScorePopup(null);
    setSlopHighlightOn(false);
    setSlopHighlight(null);
    if (scoreTimerRef.current) { clearTimeout(scoreTimerRef.current); scoreTimerRef.current = null; }
  }, []);

  const toggleHighlight = useCallback((text: string, msgId: string) => {
    if (scorePopup?.id === msgId) { clearScorePopup(); return; }
    const report = fullSlopScan(text);
    const summary = summarizeReport(report);
    setScorePopup({ id: msgId, score: summary.score, grade: summary.grade, hits: summary.totalHits });
    setSlopHighlightOn(true);
    const hl = liveHighlightScan(text);
    setSlopHighlight(hl.positions.length > 0 ? hl : null);
    // 3秒后自动恢复星星
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    scoreTimerRef.current = setTimeout(() => {
      setScorePopup(null);
      setSlopHighlightOn(false);
      setSlopHighlight(null);
    }, 3000);
  }, [scorePopup, clearScorePopup]);

  // ====== Stream scanning timer (per1k mode) ======
  useEffect(() => {
    if (isLoading && toolSlopDetect && autoRetryScanFreq === "per1k") {
      streamScanTimerRef.current = setInterval(() => {
        const ses = useChatStore.getState().currentSession();
        if (!ses) return;
        const lastMsg = ses.messages[ses.messages.length - 1];
        if (lastMsg?.role === "assistant" && typeof lastMsg.content === "string" && lastMsg.content) {
          setSlopReport(fullSlopScan(lastMsg.content));
          const hl = liveHighlightScan(lastMsg.content);
          setSlopHighlight(hl.positions.length > 0 ? hl : null);
        }
      }, 2000);
      return () => { if (streamScanTimerRef.current) { clearInterval(streamScanTimerRef.current); streamScanTimerRef.current = null; } };
    }
  }, [isLoading, toolSlopDetect, autoRetryScanFreq]);

  // ====== Auto retry on finish ======
  useEffect(() => {
    if (!isLoading && messages.length > 0 && (toolSlopDetect || toolAutoRetry)) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant" && !lastMsg.streaming && typeof lastMsg.content === "string" && lastMsg.content) {
        const report = fullSlopScan(lastMsg.content);
        setSlopReport(report);
        const hl = liveHighlightScan(lastMsg.content);
        setSlopHighlight(hl.positions.length > 0 ? hl : null);
        const score = 10 - report.slopPenalty;
        if (toolAutoRetry && score < autoRetryMinScore && autoRetryCountRef.current < autoRetryMaxCount) {
          autoRetryCountRef.current++;
          // 清除之前的评分弹窗
          clearScorePopup();
          setTimeout(() => {
            const ses = useChatStore.getState().currentSession();
            if (ses) {
              const msgs = ses.messages;
              const last = msgs[msgs.length - 1];
              if (last?.role === "assistant") {
                const idx = msgs.findIndex((m) => m.id === last.id);
                if (idx >= 0) retryMessage(idx);
              }
            }
          }, 200);
        } else { autoRetryCountRef.current = 0; }
      }
    }
  }, [isLoading, messages, toolSlopDetect, toolAutoRetry, autoRetryMinScore, autoRetryMaxCount, retryMessage, clearScorePopup]);

  // ====== Auto collapse previous messages ======
  useEffect(() => {
    const wasLoading = prevIsLoading.current;
    prevIsLoading.current = isLoading;
    // 生成结束时，收起除最新 assistant 外的所有消息
    if (wasLoading && !isLoading && messages.length > 0) {
      setCollapsedMsgIds((prev) => {
        const next = new Set(prev);
        let foundLatest = false;
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m.role === "assistant" && !m.streaming && !foundLatest) {
            foundLatest = true;
            next.delete(m.id);
          } else if (m.content && !m.streaming) {
            next.add(m.id);
          }
        }
        return next;
      });
    }
  }, [isLoading, messages]);

  const toggleCollapse = useCallback((msgId: string) => {
    setCollapsedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      return next;
    });
  }, []);

  // ====== Send ======
  const handleSend = useCallback(async () => {
    if (isLoading) return;
    let finalInput = "";
    if (toolStructInput) {
      const parts = structInputs.filter((s) => s.trim());
      if (parts.length === 0) return;
      finalInput = parts.map((p, i) => `【${String.fromCharCode(65 + i)}】${p.trim()}`).join("\n\n");
      setStructInputs(structInputs.map(() => ""));
    } else if (input.trim()) {
      finalInput = input.trim();
    } else if (!(toolLocalRewrite && rewritePrefix.trim())) { return; }

    if (useOutlineStore.getState().config.enabled) {
      const outlinePrompt = generateOutlinePrompt(useOutlineStore.getState().config);
      if (outlinePrompt) finalInput = outlinePrompt + "\n\n---\n\n" + finalInput;
    }
    if (!useSettingsStore.getState().keepInputAfterSend) setInput("");
    setSlopReport(null); setSlopHighlight(null);
    clearScorePopup();
    autoRetryCountRef.current = 0;
    if (toolLocalRewrite && rewritePrefix.trim()) {
      await sendMessage(finalInput, rewritePrefix.trim(), rewriteSuffix.trim() || undefined);
    } else { await sendMessage(finalInput); }
  }, [input, isLoading, sendMessage, toolStructInput, structInputs, toolLocalRewrite, rewritePrefix, rewriteSuffix]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && settings.enterToSend && !toolStructInput) {
      if (toolLocalRewrite && !rewritePrefix.trim()) return;
      e.preventDefault(); handleSend();
    }
  };

  // ====== Message handlers ======
  const handleRetry = useCallback(async (msgIndex: number) => {
    clearScorePopup();
    await retryMessage(msgIndex);
  }, [retryMessage, clearScorePopup]);

  const switchVersion = (msgId: string, dir: number) => {
    const ses = useChatStore.getState().currentSession();
    if (!ses) return;
    const msg = ses.messages.find((m) => m.id === msgId);
    if (!msg?.versions) return;
    const newIdx = (msg.active_version ?? 0) + dir;
    if (newIdx >= 0 && newIdx < msg.versions.length) {
      useChatStore.getState().setActiveVersion(msgId, newIdx);
    }
  };

  const [copyToast, setCopyToast] = useState("");
  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    setCopyToast(ok ? "已复制" : "复制失败");
    setTimeout(() => setCopyToast(""), 1500);
  };

  const extractDialog = useCallback((text: string): string => {
    const dialogues: string[] = [];
    const cnDQ = text.match(/[\u201c][\s\S]*?[\u201d]/g); if (cnDQ) dialogues.push(...cnDQ);
    const cnSQ = text.match(/[\u2018][\s\S]*?[\u2019]/g); if (cnSQ) dialogues.push(...cnSQ);
    const bracketQ = text.match(/[\u300c][\s\S]*?[\u300d]/g); if (bracketQ) dialogues.push(...bracketQ);
    const bracketQ2 = text.match(/[\u300e][\s\S]*?[\u300f]/g); if (bracketQ2) dialogues.push(...bracketQ2);
    const curlyCheck = text.match(/[\u201c\u201d]/g);
    if (!curlyCheck) { const enQ = text.match(/"[^"\n]{2,300}"/g); if (enQ) dialogues.push(...enQ); }
    return dialogues.join("\n");
  }, []);

  const handleExtractDialog = useCallback((text: string) => {
    const result = extractDialog(text);
    if (!result) return;
    copyToClipboard(result);
  }, [extractDialog]);

  const handleCloneSession = useCallback(() => { chatStore.cloneSession(); }, [chatStore]);

  const handleSaveDraft = useCallback((text: string, role: "user" | "assistant") => {
    useChatStore.getState().addDraft({ id: generateId(), role, content: text, date: new Date().toLocaleString() });
  }, []);

  const startEdit = (msgId: string, content: string) => { setEditingMsgId(msgId); setEditContent(content); };

  const handleDelete = (msgId: string) => { useChatStore.getState().deleteMessage(msgId); setDeleteTarget(null); };

  const saveEdit = () => {
    if (!editingMsgId) return;
    useChatStore.getState().updateCurrentSession((s) => {
      const msg = s.messages.find((m) => m.id === editingMsgId);
      if (msg) { msg.content = editContent; if (msg.versions && msg.active_version !== undefined) msg.versions[msg.active_version].content = editContent; return; }
      const draft = s.drafts?.find((d) => d.id === editingMsgId);
      if (draft) { draft.content = editContent; }
    });
    setEditingMsgId(null);
  };

  const handleSendAfterEdit = useCallback((msgId: string, role: string, content: string) => {
    const sess = useChatStore.getState().currentSession();
    if (!sess) return;
    const idx = sess.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    setEditingMsgId(null);
    if (role === "user") {
      if (idx + 1 < sess.messages.length) {
        retryMessage(idx + 1);
      } else {
        // 用户编辑的是最后一条消息（尚无 bot 回复），直接触发新生成
        sendMessage(content);
      }
    } else {
      // Bot: saveEdit 已保存编辑，regenerateMessage 自动把旧内容归档为旧版本
      retryMessage(idx);
    }
  }, [retryMessage]);

  // ====== Rendering with slop highlight ======
  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages],
  );
  const renderMessageContent = (text: string, msgId: string) => {
    if (!toolSlopDetect || !slopHighlight || slopHighlight.positions.length === 0) return text;
    if (!lastAssistant || lastAssistant.id !== msgId) return text;
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    for (const pos of slopHighlight.positions) {
      if (pos.start > lastEnd) parts.push(text.slice(lastEnd, pos.start));
      parts.push(<span key={`slop-${pos.start}`} style={{ backgroundColor: "rgba(255, 80, 80, 0.35)", borderRadius: 3, padding: "0 2px" }}>{text.slice(pos.start, pos.end)}</span>);
      lastEnd = pos.end;
    }
    if (lastEnd < text.length) parts.push(text.slice(lastEnd));
    return parts;
  };

  // ====== Topbar handlers ======
  const handleStartRename = () => { setRenameValue(session?.topic || ""); setRenamingTitle(true); };
  const handleFinishRename = () => { chatStore.renameSession(renameValue); setRenamingTitle(false); };
  const handleCopySession = async () => {
    const ses = chatStore.currentSession();
    if (!ses || !ses.messages?.length) return;
    const text = ses.messages.filter((m) => m.role === "assistant")
      .map((m) => typeof m.content === "string" ? m.content : (m.versions ? m.versions[m.active_version ?? 0]?.content || "" : ""))
      .filter(Boolean).join("\n\n---\n\n");
    const ok = await copyToClipboard(text);
    setCopyToast(ok ? `已复制 ${ses.messages.length} 条消息` : "复制失败");
    setTimeout(() => setCopyToast(""), 1500);
  };

  const handleNewChat = () => { chatStore.newSession(undefined, currentProjectId); setShowHistory(false); };

  const handleSelectSession = (idx: number) => {
    chatStore.selectSession(idx);
    setShowHistory(false); setEditingMsgId(null); setEditingDraftId(null); setEditContent("");
    setToolLocalRewrite(false); setRewritePrefix(""); setRewriteSuffix(""); setRewriteShowSuffix(false);
    setToolSlopDetect(false); setSlopReport(null); setSlopHighlight(null); clearScorePopup();
    setShowToolPanel(false); setToolStructInput(false); setShowSearch(false);
    setShowOutlineConfig(false); setRenamingTitle(false); setKbAdding(false); setHighlightMsgId(null);
  };

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleNewProject = () => {
    if (!newProjectName.trim()) return;
    const proj = projectStore.createProject(newProjectName.trim());
    setNewProjectName(""); setCreatingProject(false);
    setExpandedProjects((prev) => new Set([...prev, proj.id]));
    chatStore.newSession(undefined, proj.id);
  };

  // ====== Struct input helpers ======
  const adjustStructCount = (n: number) => {
    const count = Math.max(2, Math.min(4, n));
    setStructCount(count);
    setStructInputs((prev) => { const next = [...prev]; while (next.length < count) next.push(""); return next.slice(0, count); });
  };

  const toggleStructCollapse = (idx: number) => {
    setStructCollapsed((prev) => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };

  // ====== Sheet drag ======
  const onSheetDragStart = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    sheetDragRef.current = { startY: e.clientY, startH: sheetHeight };
  }, [sheetHeight]);
  const onSheetDragMove = useCallback((e: React.PointerEvent) => {
    if (!sheetDragRef.current) return;
    const dy = sheetDragRef.current.startY - e.clientY;
    const vh = window.innerHeight / 100;
    setSheetHeight(Math.max(20, Math.min(90, sheetDragRef.current.startH + dy / vh)));
  }, []);
  const onSheetDragEnd = useCallback(() => { sheetDragRef.current = null; }, []);

  // ====== Render ======
  return (
    <div className="app-root">
      <TopBar
        session={session}
        renamingTitle={renamingTitle}
        renameValue={renameValue}
        onToggleHistory={() => setShowHistory(true)}
        onToggleSearch={() => setShowSearch(true)}
        onToggleSettings={() => setShowSettings(true)}
        onCloneSession={handleCloneSession}
        onCopySession={handleCopySession}
        onNewChat={handleNewChat}
        onStartRename={handleStartRename}
        onRenameValueChange={setRenameValue}
        onFinishRename={handleFinishRename}
        onCancelRename={() => setRenamingTitle(false)}
      />

      <CheckerBar failedChecks={failedChecks} toolSlopDetect={toolSlopDetect} slopReport={slopReport} />

      <ChatView
        messages={messages} isLoading={isLoading} editingMsgId={editingMsgId} editContent={editContent}
        deleteTarget={deleteTarget} highlightMsgId={highlightMsgId} scorePopup={scorePopup}
        slopHighlight={slopHighlight} slopHighlightOn={slopHighlightOn} toolSlopDetect={toolSlopDetect}
        collapsedMsgIds={collapsedMsgIds}
        renderMessageContent={renderMessageContent}
        onStopGeneration={stopGeneration} onSwitchVersion={switchVersion} onRetry={handleRetry}
        onCopy={handleCopy} onStartEdit={startEdit} onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingMsgId(null)} onSaveDraft={handleSaveDraft}
        onScoreToggle={toggleHighlight} onExtractDialog={handleExtractDialog}
        onDelete={handleDelete} onSetDeleteTarget={setDeleteTarget}
        onSetEditContent={setEditContent} onSendAfterEdit={handleSendAfterEdit}
        onToggleCollapse={toggleCollapse}
      />

      <InputSection
        input={input} isLoading={isLoading} toolStructInput={toolStructInput}
        structCount={structCount} structInputs={structInputs} structCollapsed={structCollapsed}
        toolLocalRewrite={toolLocalRewrite} rewritePrefix={rewritePrefix} rewriteSuffix={rewriteSuffix}
        rewriteShowSuffix={rewriteShowSuffix} toolSlopDetect={toolSlopDetect} showToolPanel={showToolPanel}
        toolAutoRetry={toolAutoRetry} autoRetryScanFreq={autoRetryScanFreq}
        autoRetryMinScore={autoRetryMinScore} autoRetryMaxCount={autoRetryMaxCount}
        inputRef={inputRef}
        onInputChange={setInput} onSend={handleSend} onKeyDown={handleKeyDown}
        onStopGeneration={stopGeneration}
        onSetShowKnowledge={setShowKnowledge} onSetShowToolPanel={setShowToolPanel}
        onSetShowOutlineConfig={setShowOutlineConfig}
        onSetToolLocalRewrite={setToolLocalRewrite} onSetToolAutoRetry={setToolAutoRetry}
        onSetToolStructInput={setToolStructInput}
        onSetRewritePrefix={setRewritePrefix} onSetRewriteSuffix={setRewriteSuffix}
        onSetRewriteShowSuffix={setRewriteShowSuffix}
        onSetAutoRetryScanFreq={setAutoRetryScanFreq}
        onSetAutoRetryMinScore={setAutoRetryMinScore}
        onSetAutoRetryMaxCount={setAutoRetryMaxCount}
        onStructCountChange={setStructCount}
        onStructInputChange={(idx, v) => { const next = [...structInputs]; next[idx] = v; setStructInputs(next); }}
        onStructCollapseToggle={toggleStructCollapse}
        onSetStructInputs={setStructInputs}
      />

      {showHistory && (
        <HistorySidebar
          expandedProjects={expandedProjects} currentProjectId={currentProjectId}
          renamingProjectId={renamingProjectId} renamingProjectName={renamingProjectName}
          creatingProject={creatingProject} newProjectName={newProjectName}
          onToggleProject={toggleProject} onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onSetCreatingProject={setCreatingProject} onSetNewProjectName={setNewProjectName}
          onNewProject={handleNewProject}
          onStartRenameProject={(id, name) => { setRenamingProjectId(id); setRenamingProjectName(name); }}
          onSetRenamingProjectId={setRenamingProjectId} onSetRenamingProjectName={setRenamingProjectName}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {showKnowledge && (
        <KnowledgeSheet
          sheetHeight={sheetHeight} kbCategory={kbCategory} kbSearch={kbSearch}
          kbScope={kbScope} kbAdding={kbAdding} kbTitle={kbTitle} kbContent={kbContent}
          editingKbId={editingKbId} editingKbType={editingKbType} currentProjectId={currentProjectId}
          lastDeletedRef={lastDeletedRef} input={input} editingDraftId={editingDraftId} editContent={editContent}
          onSetKbCategory={setKbCategory} onSetKbSearch={setKbSearch} onSetKbScope={setKbScope}
          onSetKbAdding={setKbAdding} onSetKbTitle={setKbTitle} onSetKbContent={setKbContent}
          onSetEditingKbId={setEditingKbId} onSetEditingKbType={setEditingKbType}
          onSetEditingDraftId={setEditingDraftId} onSetEditContent={setEditContent}
          onSetInput={setInput} onClose={() => setShowKnowledge(false)}
          onSheetDragStart={onSheetDragStart} onSheetDragMove={onSheetDragMove} onSheetDragEnd={onSheetDragEnd}
        />
      )}

      {showOutlineConfig && <OutlineConfigSheet input={input} onSetInput={setInput} onClose={() => setShowOutlineConfig(false)} />}

      {showSearch && <SearchSheet onClose={() => setShowSearch(false)} onHighlight={setHighlightMsgId} />}

      <style>{`@keyframes searchHighlight { 0% { background: rgba(124,138,255,0.35); } 100% { background: transparent; } }`}</style>
      {copyToast && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "#333", color: "#fff", padding: "8px 20px", borderRadius: 20, fontSize: 14, zIndex: 200, animation: "toastIn 0.2s ease-out" }}>{copyToast}</div>
      )}
    </div>
  );
}
