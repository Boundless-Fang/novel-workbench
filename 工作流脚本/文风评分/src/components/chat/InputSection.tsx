import React, { useState } from "react";
import { useSettingsStore, useChatStore, useOutlineStore } from "../../store";
import { pasteSyncProps } from "../../utils/text";
import { generateOutlinePrompt } from "../../types/outline";
import { REASONING_EFFORT_OPTIONS, ReasoningEffort, SILICONFLOW_MODELS, SILICONFLOW_MODEL_LABELS } from "../../types/api";

const MODELS: Record<string, string[]> = {
  OpenAI: ["gpt-4o-mini", "gpt-4o"],
  DeepSeek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  SiliconFlow: SILICONFLOW_MODELS,
  Anthropic: ["claude-3.5-sonnet"],
  Google: ["gemini-2.0-flash"],
};

interface InputSectionProps {
  input: string;
  isLoading: boolean;
  toolStructInput: boolean;
  structCount: number;
  structInputs: string[];
  structCollapsed: Set<number>;
  toolLocalRewrite: boolean;
  rewritePrefix: string;
  rewriteSuffix: string;
  rewriteShowSuffix: boolean;
  toolSlopDetect: boolean;
  showToolPanel: boolean;
  toolAutoRetry: boolean;
  autoRetryScanFreq: "once" | "per1k";
  autoRetryMinScore: number;
  autoRetryMaxCount: number;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onStopGeneration: () => void;
  onSetShowKnowledge: (v: boolean) => void;
  onSetShowToolPanel: (v: boolean) => void;
  onSetShowOutlineConfig: (v: boolean) => void;
  onSetToolLocalRewrite: (v: boolean) => void;
  onSetToolAutoRetry: (v: boolean) => void;
  onSetToolStructInput: (v: boolean) => void;
  onSetToolSlopDetect?: (v: boolean) => void;
  onSetRewritePrefix: (v: string) => void;
  onSetRewriteSuffix: (v: string) => void;
  onSetRewriteShowSuffix: (v: boolean) => void;
  onSetAutoRetryScanFreq: (v: "once" | "per1k") => void;
  onSetAutoRetryMinScore: (v: number) => void;
  onSetAutoRetryMaxCount: (v: number) => void;
  onStructCountChange: (n: number) => void;
  onStructInputChange: (idx: number, v: string) => void;
  onStructCollapseToggle: (idx: number) => void;
  onSetStructInputs: (v: string[]) => void;
}

export function InputSection({
  input, isLoading, toolStructInput, structCount, structInputs, structCollapsed,
  toolLocalRewrite, rewritePrefix, rewriteSuffix, rewriteShowSuffix,
  toolSlopDetect, showToolPanel, toolAutoRetry, autoRetryScanFreq,
  autoRetryMinScore, autoRetryMaxCount, inputRef,
  onInputChange, onSend, onKeyDown, onStopGeneration,
  onSetShowKnowledge, onSetShowToolPanel, onSetShowOutlineConfig,
  onSetToolLocalRewrite, onSetToolAutoRetry, onSetToolStructInput, onSetToolSlopDetect,
  onSetRewritePrefix, onSetRewriteSuffix, onSetRewriteShowSuffix,
  onSetAutoRetryScanFreq, onSetAutoRetryMinScore, onSetAutoRetryMaxCount,
  onStructCountChange, onStructInputChange, onStructCollapseToggle, onSetStructInputs,
}: InputSectionProps) {
  const settings = useSettingsStore();
  const chatStore = useChatStore();
  const outlineStore = useOutlineStore();
  const session = chatStore.currentSession();
  const providerName = settings.modelConfig.providerName || "DeepSeek";
  const isDeepSeek = providerName === "DeepSeek";
  const isSiliconFlow = providerName === "SiliconFlow";

  const adjustStructCount = (n: number) => {
    onStructCountChange(n);
    const count = Math.max(2, Math.min(4, n));
    const next = [...structInputs];
    while (next.length < count) next.push("");
    onSetStructInputs(next.slice(0, count));
  };

  return (
    <>
      {/* -------- Toolbar -------- */}
      {!toolStructInput && (
        <div className="toolbar">
          <button className="topbar-btn" onClick={() => onSetShowKnowledge(true)} title="知识库" style={{ fontSize: 13, gap: 4 }}>
            <span style={{ fontSize: 15 }}>&#9885;</span> 知识库
            {(session?.chatKnowledge?.length ?? 0) > 0 && (
              <span style={{ fontSize: 10, background: "#5a3a8a", color: "#fff", borderRadius: 10, padding: "0 5px", minWidth: 18, textAlign: "center" }}>{session.chatKnowledge.length}</span>
            )}
          </button>
          <select value={settings.modelConfig.model} onChange={(e) => settings.setModelConfig({ model: e.target.value })} title="模型">
            {(MODELS[providerName] || []).map((m) => <option key={m} value={m}>{SILICONFLOW_MODEL_LABELS[m] || m}</option>)}
          </select>
          {(isDeepSeek || isSiliconFlow) && (
            <span className="toolbar-think-group">
              <button
                className={`toolbar-reasoning-toggle ${settings.modelConfig.thinking ? "active" : ""}`}
                onClick={() => settings.setModelConfig({ thinking: !settings.modelConfig.thinking })}
                title="思考模式：输出最终回答前先生成思维链"
              >
                思考
              </button>
              {isDeepSeek && settings.modelConfig.thinking && (
                <select
                  className="toolbar-reasoning"
                  value={settings.modelConfig.reasoning_effort || "high"}
                  onChange={(e) => settings.setModelConfig({ reasoning_effort: e.target.value as ReasoningEffort })}
                  title="思考强度"
                >
                  {REASONING_EFFORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </span>
          )}

          <div style={{ position: "relative", marginLeft: "auto" }}>
            <button
              className={`topbar-btn ${showToolPanel ? "active" : ""}`}
              onClick={() => onSetShowToolPanel(!showToolPanel)}
              title="工具"
              style={{ fontSize: 13, gap: 4, background: showToolPanel ? "#2d3a5c" : "transparent", borderRadius: 6 }}
            >
              <span style={{ fontSize: 15 }}>{settings.toolDisplay === "icon" ? "\u2692" : ""}</span> 工具
            </button>

            {showToolPanel && (
              <>
                <div className="tool-panel-overlay" onClick={() => onSetShowToolPanel(false)} />
                <div className="tool-panel">
                  <label className="tool-panel-item" onClick={() => { onSetToolLocalRewrite(!toolLocalRewrite); if (toolLocalRewrite) { onSetRewritePrefix(""); onSetRewriteSuffix(""); } }}>
                    <span className={`tool-panel-checkbox ${toolLocalRewrite ? "checked" : ""}`}>{toolLocalRewrite ? "✓" : ""}</span>
                    <span className="tool-panel-label"><span className="tool-panel-icon">&#9998;</span>局部重写</span>
                  </label>

                  <label className="tool-panel-item" onClick={() => onSetToolAutoRetry(!toolAutoRetry)}>
                    <span className={`tool-panel-checkbox ${toolAutoRetry ? "checked" : ""}`}>{toolAutoRetry ? "✓" : ""}</span>
                    <span className="tool-panel-label" style={{ fontSize: 12 }}>
                      <span className="tool-panel-icon">&#8635;</span>自动重试
                    </span>
                  </label>

                  {toolAutoRetry && (
                    <div style={{ padding: "4px 0 4px 24px", fontSize: 11, color: "#aaa", display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>打分频率</span>
                        <select value={autoRetryScanFreq} onChange={(e) => onSetAutoRetryScanFreq(e.target.value as "once" | "per1k")}
                          style={{ background: "#1a1a1a", color: "#ccc", border: "1px solid #444", borderRadius: 4, padding: "2px 4px", fontSize: 11 }}>
                          <option value="once">仅结束时</option>
                          <option value="per1k">持续扫描</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>最低分数</span>
                        <input type="number" min={1} max={10} step={0.5} value={autoRetryMinScore}
                          onChange={(e) => onSetAutoRetryMinScore(Math.max(1, Math.min(10, parseFloat(e.target.value) || 7)))}
                          style={{ width: 42, background: "#1a1a1a", color: "#ccc", border: "1px solid #444", borderRadius: 4, padding: "2px 4px", fontSize: 11, textAlign: "center" }} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>重试上限</span>
                        <input type="number" min={1} max={10} step={1} value={autoRetryMaxCount}
                          onChange={(e) => onSetAutoRetryMaxCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
                          style={{ width: 42, background: "#1a1a1a", color: "#ccc", border: "1px solid #444", borderRadius: 4, padding: "2px 4px", fontSize: 11, textAlign: "center" }} />
                      </div>
                    </div>
                  )}

                  <label className="tool-panel-item" onClick={() => onSetToolStructInput(!toolStructInput)}>
                    <span className={`tool-panel-checkbox ${toolStructInput ? "checked" : ""}`}>{toolStructInput ? "✓" : ""}</span>
                    <span className="tool-panel-label"><span className="tool-panel-icon">&#8862;</span>结构输入</span>
                  </label>

                  <label className="tool-panel-item" onClick={() => outlineStore.setEnabled(!outlineStore.config.enabled)}>
                    <span className={`tool-panel-checkbox ${outlineStore.config.enabled ? "checked" : ""}`}>{outlineStore.config.enabled ? "✓" : ""}</span>
                    <span className="tool-panel-label"><span className="tool-panel-icon">&#9776;</span>大纲模式</span>
                  </label>
                  {outlineStore.config.enabled && (
                    <div style={{ padding: "4px 0 4px 24px", display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px", color: "#a0b0ff" }}
                        onClick={() => { onSetShowOutlineConfig(true); onSetShowToolPanel(false); }}>&#9881; 配置大纲</button>
                      <span style={{ fontSize: 10, color: "#666" }}>模块 {outlineStore.config.modules.length}/10</span>
                    </div>
                  )}
                  <div className="tool-panel-divider" />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* -------- Struct Input -------- */}
      {toolStructInput && (
        <div style={{ flexShrink: 0, padding: "6px 12px", background: "#1a1a1a", borderTop: "1px solid #2a2a2a" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#888" }}>段落:</span>
            {[2, 3, 4].map((n) => (
              <button key={n} onClick={() => adjustStructCount(n)}
                style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: structCount === n ? "#5a3a8a" : "#2a2a2a", color: structCount === n ? "#fff" : "#888", border: "1px solid #444", cursor: "pointer" }}>{n}</button>
            ))}
            <button className="msg-action-btn" style={{ marginLeft: "auto" }} onClick={() => onSetToolStructInput(false)} title="关闭">&#10005;</button>
          </div>
          {structInputs.map((val, idx) => (
            <div key={idx}>
              <div onClick={() => onStructCollapseToggle(idx)}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0", cursor: "pointer", color: "#aaa", fontSize: 11, userSelect: "none" }}>
                <span>{structCollapsed.has(idx) ? "\u25B6" : "\u25BC"}</span>
                <span>段落 {String.fromCharCode(65 + idx)}</span>
              </div>
              {!structCollapsed.has(idx) && (
                <textarea value={val} onChange={(e) => onStructInputChange(idx, e.target.value)}
                  {...pasteSyncProps(() => structInputs[idx], (v) => { const next = [...structInputs]; next[idx] = v; onSetStructInputs(next); })}
                  placeholder={`段落 ${String.fromCharCode(65 + idx)}...`} rows={2}
                  style={{ width: "100%", background: "#1a1a1a", border: "1px solid #444", borderRadius: 4, padding: 4, color: "#e8e8e8", fontSize: 12, resize: "vertical", fontFamily: "inherit", marginBottom: 3 }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* -------- Local Rewrite -------- */}
      {toolLocalRewrite && (
        <div style={{ padding: "6px 12px 0", flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea value={rewritePrefix} onChange={(e) => onSetRewritePrefix(e.target.value)}
            {...pasteSyncProps(() => rewritePrefix, onSetRewritePrefix)}
            placeholder="前缀保留（开头不会被改写）" rows={3}
            style={{ width: "100%", background: "#1a1a1a", border: "1px solid #5a3a8a", borderRadius: 8, padding: 8, color: "#c8a8ff", fontSize: 13, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
          {!rewriteShowSuffix ? (
            <div onClick={() => onSetRewriteShowSuffix(true)} style={{ fontSize: 11, color: "#888", cursor: "pointer", padding: "2px 0" }}>▶ 后缀保留（结尾不会被改写）</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div onClick={() => onSetRewriteShowSuffix(false)} style={{ fontSize: 11, color: "#888", cursor: "pointer", padding: "2px 0" }}>▼ 后缀保留（点击折叠）</div>
              <textarea value={rewriteSuffix} onChange={(e) => onSetRewriteSuffix(e.target.value)}
                {...pasteSyncProps(() => rewriteSuffix, onSetRewriteSuffix)}
                placeholder="后缀保留（结尾不会被改写）" rows={3}
                style={{ width: "100%", background: "#1a1a1a", border: "1px solid #4a6a5a", borderRadius: 8, padding: 8, color: "#a8d8b8", fontSize: 13, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            </div>
          )}
        </div>
      )}

      {/* -------- Input Row -------- */}
      <div className="input-row">
        <textarea ref={inputRef} value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={toolLocalRewrite ? "续写指令 / 待改写中间段..." : "输入消息..."}
          rows={4} />
        {isLoading ? (
          <button className="send-btn stop" onClick={onStopGeneration}>&#9724;</button>
        ) : (
          <button className="send-btn" onClick={onSend} disabled={!input.trim() && !rewritePrefix.trim()}>&#8593;</button>
        )}
      </div>
    </>
  );
}
