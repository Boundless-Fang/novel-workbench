import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettingsStore } from "../store";
import { SILICONFLOW_MODELS, SILICONFLOW_MODEL_LABELS, PROVIDER_LABELS } from "../types/api";

const PROVIDERS = ["OpenAI", "DeepSeek", "SiliconFlow", "Anthropic", "Google"];
const MODELS: Record<string, string[]> = {
  OpenAI: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
  DeepSeek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  SiliconFlow: SILICONFLOW_MODELS,
  Anthropic: ["claude-3.5-sonnet", "claude-3-opus"],
  Google: ["gemini-2.0-flash", "gemini-1.5-pro"],
};

export function SettingsPage() {
  const navigate = useNavigate();
  const settings = useSettingsStore();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    settings.markUpdate();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="page">
      <div className="header">
        <button className="header-btn" onClick={() => navigate(-1)}>←</button>
        <span className="header-title">设置</span>
        <button className="header-btn" onClick={handleSave} style={{ fontSize: "14px" }}>{saved ? "✓" : "保存"}</button>
      </div>

      <div className="settings-form">
        <div className="form-group">
          <label className="form-label">AI 提供商</label>
          <select
            className="form-select"
            value={settings.modelConfig.providerName || "OpenAI"}
            onChange={(e) => settings.setProvider(e.target.value as any)}
          >
            {PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">API Key ({settings.modelConfig.providerName || "OpenAI"})</label>
          <input
            className="form-input"
            type="password"
            value={
              settings.modelConfig.providerName === "DeepSeek" ? settings.deepseekApiKey :
              settings.modelConfig.providerName === "SiliconFlow" ? settings.siliconflowApiKey :
              settings.modelConfig.providerName === "Anthropic" ? settings.anthropicApiKey :
              settings.modelConfig.providerName === "Google" ? settings.googleApiKey :
              settings.openaiApiKey
            }
            onChange={(e) => {
              const provider = settings.modelConfig.providerName;
              if (provider === "DeepSeek") settings.setField("deepseekApiKey", e.target.value);
              else if (provider === "SiliconFlow") settings.setField("siliconflowApiKey", e.target.value);
              else if (provider === "Anthropic") settings.setField("anthropicApiKey", e.target.value);
              else if (provider === "Google") settings.setField("googleApiKey", e.target.value);
              else settings.setField("openaiApiKey", e.target.value);
            }}
            placeholder="sk-..."
          />
        </div>

        <div className="form-group">
          <label className="form-label">API URL</label>
          <input
            className="form-input"
            value={
              settings.modelConfig.providerName === "DeepSeek" ? settings.deepseekUrl :
              settings.modelConfig.providerName === "SiliconFlow" ? settings.siliconflowUrl :
              settings.modelConfig.providerName === "Anthropic" ? settings.anthropicUrl :
              settings.modelConfig.providerName === "Google" ? settings.googleUrl :
              settings.openaiUrl
            }
            onChange={(e) => {
              const provider = settings.modelConfig.providerName;
              if (provider === "DeepSeek") settings.setField("deepseekUrl", e.target.value);
              else if (provider === "SiliconFlow") settings.setField("siliconflowUrl", e.target.value);
              else if (provider === "Anthropic") settings.setField("anthropicUrl", e.target.value);
              else if (provider === "Google") settings.setField("googleUrl", e.target.value);
              else settings.setField("openaiUrl", e.target.value);
            }}
            placeholder="https://api.siliconflow.cn/v1"
          />
        </div>

        <div className="form-group">
          <label className="form-label">模型</label>
          <select
            className="form-select"
            value={settings.modelConfig.model}
            onChange={(e) => settings.setModelConfig({ model: e.target.value })}
          >
            {(MODELS[settings.modelConfig.providerName || "OpenAI"] || MODELS["OpenAI"]).map((m) => (
              <option key={m} value={m}>{SILICONFLOW_MODEL_LABELS[m] || m}</option>
            ))}
          </select>
        </div>

        {/* DeepSeek 思考模式 — 从 StyleSync-Novel 借鉴 */}
        {(settings.modelConfig.providerName === "DeepSeek" || settings.modelConfig.providerName === "SiliconFlow") && (
          <>
            <div className="form-group">
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.modelConfig.thinking || false}
                  onChange={(e) => settings.setModelConfig({ thinking: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                思考模式
              </label>
            </div>
            {settings.modelConfig.providerName === "DeepSeek" && settings.modelConfig.thinking && (
              <div className="form-group">
                <label className="form-label">思考强度</label>
                <select
                  className="form-select"
                  value={settings.modelConfig.reasoning_effort || "high"}
                  onChange={(e) => settings.setModelConfig({ reasoning_effort: e.target.value as "low" | "high" | "xhigh" | "max" })}
                >
                  <option value="low">low (低思考)</option>
                  <option value="high">high (标准思考)</option>
                  <option value="xhigh">xhigh (深度思考)</option>
                  <option value="max">max (极致思考)</option>
                </select>
              </div>
            )}
          </>
        )}

        <div className="form-group">
          <label className="form-label">Temperature ({settings.modelConfig.temperature})</label>
          <input
            className="form-input"
            type="range" min="0" max="2" step="0.1"
            value={settings.modelConfig.temperature}
            onChange={(e) => settings.setModelConfig({ temperature: parseFloat(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">全局禁用词 (逗号分隔)</label>
          <input
            className="form-input"
            value={settings.globalForbidden}
            onChange={(e) => settings.setField("globalForbidden", e.target.value)}
            placeholder="例如: 违规词1, 违规词2"
          />
        </div>

        <div className="form-group">
          <label className="form-label">禁用词容忍度 (命中后自动停止)</label>
          <input
            className="form-input"
            type="number" min="1" max="100"
            value={settings.forbiddenTolerance}
            onChange={(e) => settings.setField("forbiddenTolerance", parseInt(e.target.value) || 3)}
          />
        </div>
      </div>

      <div className="bottom-nav">
        <button className="nav-item" onClick={() => navigate("/")}>
          <span className="nav-icon">&#9670;</span>对话
        </button>
        <button className="nav-item" onClick={() => navigate("/prompts")}>
          <span className="nav-icon">&#9642;</span>模板
        </button>
        <button className="nav-item" onClick={() => navigate("/knowledge")}>
          <span className="nav-icon">&#9671;</span>知识库
        </button>
        <button className="nav-item active" onClick={() => navigate("/settings")}>
          <span className="nav-icon">⚙</span>设置
        </button>
      </div>
    </div>
  );
}
