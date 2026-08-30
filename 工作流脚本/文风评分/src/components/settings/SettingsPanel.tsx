import React, { useEffect, useState } from "react";
import { useSettingsStore } from "../../store";
import { REASONING_EFFORT_OPTIONS, ReasoningEffort, SILICONFLOW_MODELS, SILICONFLOW_MODEL_LABELS, PROVIDER_LABELS } from "../../types/api";

const MODELS: Record<string, string[]> = {
  OpenAI: ["gpt-4o-mini", "gpt-4o"],
  DeepSeek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  SiliconFlow: SILICONFLOW_MODELS,
  Anthropic: ["claude-3.5-sonnet"],
  Google: ["gemini-2.0-flash"],
};

interface SettingsPanelProps {
  onClose: () => void;
}

interface BuildInfo {
  commit: string;
  date: string;
  branch: string;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useSettingsStore();
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  const provider = settings.modelConfig.providerName || "DeepSeek";
  const isDeepSeek = provider === "DeepSeek";
  const isSiliconFlow = provider === "SiliconFlow";
  const thinkingOn = !!settings.modelConfig.thinking;
  const effort = settings.modelConfig.reasoning_effort || "high";

  useEffect(() => {
    fetch("/build-info.json")
      .then((r) => r.json())
      .then(setBuildInfo)
      .catch(() => {});
  }, []);

  return (
    <div className="settings-panel">
      <div className="topbar">
        <button className="topbar-btn" onClick={onClose}>&larr;</button>
        <span className="topbar-title">设置</span>
      </div>
      <div className="settings-body">
        {/* ===== 外观 ===== */}
        <section className="settings-section">
          <h4 className="settings-section-title">外观</h4>
          <div className="form-group">
            <label className="form-label">主题</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["dark", "light"] as const).map((t) => (
                <button key={t} className={`btn ${settings.theme === t ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1, fontSize: 13 }}
                  onClick={() => { settings.setField("theme", t); document.body.classList.toggle("light", t === "light"); }}>
                  {t === "dark" ? "\u263E 夜间" : "\u2600 日间"}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ===== 模型 ===== */}
        <section className="settings-section">
          <h4 className="settings-section-title">模型</h4>
          <div className="form-group">
            <label className="form-label">服务商</label>
            <select className="form-select" value={provider} onChange={(e) => settings.setProvider(e.target.value as any)}>
              {Object.keys(MODELS).map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">模型</label>
            <select className="form-select" value={settings.modelConfig.model} onChange={(e) => settings.setModelConfig({ model: e.target.value })}>
              {(MODELS[provider] || MODELS["DeepSeek"]).map((m) => <option key={m} value={m}>{SILICONFLOW_MODEL_LABELS[m] || m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">API Key</label>
            <input className="form-input" type="password" value={
              isDeepSeek ? settings.deepseekApiKey :
              isSiliconFlow ? settings.siliconflowApiKey :
              provider === "Anthropic" ? settings.anthropicApiKey :
              provider === "Google" ? settings.googleApiKey : settings.openaiApiKey
            } onChange={(e) => {
              if (isDeepSeek) settings.setField("deepseekApiKey", e.target.value);
              else if (isSiliconFlow) settings.setField("siliconflowApiKey", e.target.value);
              else if (provider === "Anthropic") settings.setField("anthropicApiKey", e.target.value);
              else if (provider === "Google") settings.setField("googleApiKey", e.target.value);
              else settings.setField("openaiApiKey", e.target.value);
            }} placeholder="sk-..." />
          </div>

          <div className="form-group">
            <label className="form-label">API URL</label>
            <input className="form-input" value={
              isDeepSeek ? settings.deepseekUrl :
              isSiliconFlow ? settings.siliconflowUrl :
              provider === "Anthropic" ? settings.anthropicUrl :
              provider === "Google" ? settings.googleUrl : settings.openaiUrl
            } onChange={(e) => {
              if (isDeepSeek) settings.setField("deepseekUrl", e.target.value);
              else if (isSiliconFlow) settings.setField("siliconflowUrl", e.target.value);
              else if (provider === "Anthropic") settings.setField("anthropicUrl", e.target.value);
              else if (provider === "Google") settings.setField("googleUrl", e.target.value);
              else settings.setField("openaiUrl", e.target.value);
            }} placeholder={isSiliconFlow ? "https://api.siliconflow.cn/v1" : "https://..."} />
          </div>

          {(isDeepSeek || isSiliconFlow) && (
            <>
              <div className="form-group">
                <label className="form-label">思考模式</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className={`btn ${thinkingOn ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1, fontSize: 13 }}
                    onClick={() => settings.setModelConfig({ thinking: true })}>开启</button>
                  <button className={`btn ${!thinkingOn ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1, fontSize: 13 }}
                    onClick={() => settings.setModelConfig({ thinking: false })}>关闭</button>
                </div>
                <span className="settings-hint">输出最终回答前先进行推理，提升准确性；思考模式下 temperature 等采样参数不生效</span>
              </div>

              {isDeepSeek && thinkingOn && (
                <div className="form-group">
                  <label className="form-label">思考强度</label>
                  <select className="form-select" value={effort}
                    onChange={(e) => settings.setModelConfig({ reasoning_effort: e.target.value as ReasoningEffort })}>
                    {REASONING_EFFORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}（{o.desc}）</option>
                    ))}
                  </select>
                  <span className="settings-hint">
                    {REASONING_EFFORT_OPTIONS.find((o) => o.value === effort)?.desc || ""}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label className="form-label">Temperature ({settings.modelConfig.temperature})</label>
            <input className="form-input" type="range" min="0" max="2" step="0.1"
              disabled={(isDeepSeek || isSiliconFlow) && thinkingOn}
              style={{ opacity: (isDeepSeek || isSiliconFlow) && thinkingOn ? 0.4 : 1, cursor: (isDeepSeek || isSiliconFlow) && thinkingOn ? "not-allowed" : "pointer" }}
              value={settings.modelConfig.temperature}
              onChange={(e) => settings.setModelConfig({ temperature: parseFloat(e.target.value) })} />
            {(isDeepSeek || isSiliconFlow) && thinkingOn && (
              <span className="settings-hint">思考模式不支持 temperature 等采样参数，该设置不生效</span>
            )}
          </div>
        </section>

        {/* ===== 写作规则 ===== */}
        <section className="settings-section">
          <h4 className="settings-section-title">写作规则</h4>
          <div className="form-group">
            <label className="form-label">全局禁用词</label>
            <input className="form-input" value={settings.globalForbidden} onChange={(e) => settings.setField("globalForbidden", e.target.value)} placeholder="用逗号分隔" />
          </div>
          <div className="form-group">
            <label className="form-label">禁用容差</label>
            <input className="form-input" type="number" value={settings.forbiddenTolerance} onChange={(e) => settings.setField("forbiddenTolerance", parseInt(e.target.value) || 3)} />
          </div>
        </section>

        {/* ===== 界面 ===== */}
        <section className="settings-section">
          <h4 className="settings-section-title">界面</h4>
          <div className="form-group">
            <label className="form-label">工具栏显示</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn ${settings.toolDisplay === "icon" ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1, fontSize: 13 }}
                onClick={() => settings.setField("toolDisplay", "icon")}>图标</button>
              <button className={`btn ${settings.toolDisplay === "text" ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1, fontSize: 13 }}
                onClick={() => settings.setField("toolDisplay", "text")}>文字</button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">删除确认</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { mode: "off" as const, label: "关闭", desc: "直接删除" },
                { mode: "on" as const, label: "开启", desc: "弹窗确认" },
                { mode: "detailed" as const, label: "详细", desc: "逐项设置" },
              ].map(({ mode, label, desc }) => (
                <button key={mode}
                  className={`btn ${settings.deleteConfirm.mode === mode ? "btn-primary" : "btn-ghost"}`}
                  style={{ flex: 1, fontSize: 12, display: "flex", flexDirection: "column", gap: 2, padding: "8px 4px" }}
                  onClick={() => settings.setField("deleteConfirm", { mode, messages: true, sessions: true, knowledge: true })}>
                  <span>{label}</span>
                  <span style={{ fontSize: 10, opacity: 0.7 }}>{desc}</span>
                </button>
              ))}
            </div>
            {settings.deleteConfirm.mode === "detailed" && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { key: "messages" as const, label: "消息" },
                  { key: "sessions" as const, label: "对话" },
                  { key: "knowledge" as const, label: "知识库" },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #222", cursor: "pointer" }} onClick={() => settings.toggleDeleteConfirm(key)}>
                    <span>{label}</span>
                    <input type="checkbox" checked={settings.deleteConfirm[key]} readOnly style={{ accentColor: "#7c8aff", width: 18, height: 18 }} />
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        {buildInfo && (
          <section className="settings-section" style={{ borderTop: "1px solid #2a2a2a" }}>
            <h4 className="settings-section-title">构建版本</h4>
            <div style={{ fontSize: 12, color: "#666", fontFamily: "monospace" }}>
              {buildInfo.commit} · {buildInfo.branch} · {buildInfo.date}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
