import React, { useEffect, useState } from "react";
import { useOutlineStore } from "../../store";
import { generateOutlinePrompt, loadOutlineOverrides, GLOBAL_OPTIONS, EXPRESSION_TYPES, MODULE_FUNCTION_CATEGORIES, STRUCTURE_TEMPLATE_MODULES } from "../../types/outline";
import { pasteSyncProps } from "../../utils/text";

interface OutlineConfigSheetProps {
  input: string;
  onSetInput: (v: string) => void;
  onClose: () => void;
}

export function OutlineConfigSheet({ input, onSetInput, onClose }: OutlineConfigSheetProps) {
  const outlineStore = useOutlineStore();
  const [outlineTab, setOutlineTab] = useState<"global" | "modules">("global");
  // 打开时加载本地扩展模板（public/prompts-local.json，公开构建时不存在则回退内置模板）
  const [, setOverridesReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    loadOutlineOverrides().then(() => { if (mounted) setOverridesReady(true); });
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-sheet outline-config-sheet" style={{ position: "absolute", bottom: 0, zIndex: 90, maxHeight: "85vh", width: "100%" }}>
        <div style={{ padding: "4px 0", display: "flex", justifyContent: "center" }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: "#444", margin: "4px 0 8px" }} />
        </div>
        <div className="modal-title" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
          大纲配置
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button className="topbar-btn" onClick={() => {
              const prompt = generateOutlinePrompt(outlineStore.config);
              if (prompt) { onSetInput(prompt); onClose(); }
            }} title="生成大纲 prompt 到输入框" style={{ fontSize: 12 }}>生成 Prompt</button>
            <button className="topbar-btn" onClick={onClose} title="关闭">&#10005;</button>
          </div>
        </div>
        <div className="outline-config-tabs" style={{ display: "flex", borderBottom: "1px solid #2a2a2a", padding: "0 16px" }}>
          <button className={`outline-tab ${outlineTab === "global" ? "active" : ""}`}
            style={{ flex: 1, padding: "8px 0", background: "none", border: "none", color: outlineTab === "global" ? "#a0b0ff" : "#666", fontSize: 13, borderBottom: outlineTab === "global" ? "2px solid #7c8aff" : "2px solid transparent", cursor: "pointer", fontWeight: outlineTab === "global" ? 600 : 400 }}
            onClick={() => setOutlineTab("global")}>全局设置</button>
          <button className={`outline-tab ${outlineTab === "modules" ? "active" : ""}`}
            style={{ flex: 1, padding: "8px 0", background: "none", border: "none", color: outlineTab === "modules" ? "#a0b0ff" : "#666", fontSize: 13, borderBottom: outlineTab === "modules" ? "2px solid #7c8aff" : "2px solid transparent", cursor: "pointer", fontWeight: outlineTab === "modules" ? 600 : 400 }}
            onClick={() => setOutlineTab("modules")}>模块 ({outlineStore.config.modules.length})</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {outlineTab === "global" ? (
            <>
              <OutlineOptionSection title="【人称】 单选" options={GLOBAL_OPTIONS.person} selected={outlineStore.config.global.person}
                onToggle={(opt) => outlineStore.updateGlobal((g) => { g.person = g.person === opt ? "" : opt; })} />
              <OutlineOptionSection title="【开头叙事】 多选" options={GLOBAL_OPTIONS.openingNarrative} selected={outlineStore.config.global.openingNarrative}
                onToggle={(opt) => outlineStore.updateGlobal((g) => { const idx = g.openingNarrative.indexOf(opt); idx >= 0 ? g.openingNarrative.splice(idx, 1) : g.openingNarrative.push(opt); })} multi />
              <OutlineOptionSection title="【结构模板】 单选" options={GLOBAL_OPTIONS.structureTemplate} selected={outlineStore.config.global.structureTemplate}
                onToggle={(opt) => {
                  const newVal = outlineStore.config.global.structureTemplate === opt ? "" : opt;
                  outlineStore.updateGlobal((g) => { g.structureTemplate = newVal; });
                  if (newVal && STRUCTURE_TEMPLATE_MODULES[newVal]) {
                    outlineStore.applyTemplateModules(newVal);
                  }
                }} />
              <OutlineOptionSection title="【事件评级】 单选" options={GLOBAL_OPTIONS.eventRating} selected={outlineStore.config.global.eventRating}
                onToggle={(opt) => outlineStore.updateGlobal((g) => { g.eventRating = g.eventRating === opt ? "" : opt; })} />
              <OutlineOptionSection title="【主要视角】 单选" options={GLOBAL_OPTIONS.mainPOV} selected={outlineStore.config.global.mainPOV}
                onToggle={(opt) => outlineStore.updateGlobal((g) => { g.mainPOV = g.mainPOV === opt ? "" : opt; })} />
              <OutlineOptionSection title="【登场角色】 多选" options={GLOBAL_OPTIONS.characters} selected={outlineStore.config.global.characters}
                onToggle={(opt) => outlineStore.updateGlobal((g) => { const idx = g.characters.indexOf(opt); idx >= 0 ? g.characters.splice(idx, 1) : g.characters.push(opt); })} multi />
              <OutlineOptionSection title="【场景】 单选" options={GLOBAL_OPTIONS.sceneCount} selected={outlineStore.config.global.sceneCount}
                onToggle={(opt) => outlineStore.updateGlobal((g) => { g.sceneCount = g.sceneCount === opt ? "" : opt; })} />
            </>
          ) : (
            <>
              {outlineStore.config.modules.map((mod, i) => (
                <div key={mod.id} className="outline-module-card" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <div className="outline-module-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="module-index" style={{ fontSize: 13, fontWeight: 600, color: "#7c8aff" }}>模块 {i + 1}</span>
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: mod.required ? "#3d1f1f" : "#1f2d3d", color: mod.required ? "#f87171" : "#60a5fa", cursor: "pointer", userSelect: "none" }}
                        onClick={() => outlineStore.updateModule(mod.id, (m) => { m.required = !m.required; })}
                        title="点击切换必选/可选">
                        {mod.required ? "必选" : "可选"}
                      </span>
                    </div>
                    <button className="module-remove" onClick={() => outlineStore.removeModule(mod.id)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12 }}>&#10005;</button>
                  </div>
                  <div className="cfg-row">
                    <span className="cfg-label">剧情概括</span>
                    <input className="cfg-input" value={mod.summary} onChange={(e) => outlineStore.updateModule(mod.id, (m) => { m.summary = e.target.value; })}
                      placeholder="简要概括..." style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 4, padding: "4px 8px", color: "#ccc", fontSize: 12 }} />
                  </div>
                  <div className="cfg-row">
                    <span className="cfg-label">模块作用 (多选)</span>
                    <div className="cfg-opts-scroll" style={{ maxHeight: "none" }}>
                      {Object.entries(MODULE_FUNCTION_CATEGORIES).map(([cat, subCats]) => (
                        <React.Fragment key={cat}>
                          <div style={{ width: "100%", fontSize: 11, color: "#7c8aff", fontWeight: 600, margin: "4px 0 2px", paddingTop: 4, borderTop: "1px solid #2a2a2a" }}>{cat}</div>
                          {Object.entries(subCats).map(([subCat, items]) => (
                            <React.Fragment key={subCat}>
                              <div style={{ width: "100%", fontSize: 11, color: "#888", margin: "3px 0" }}>{subCat}</div>
                              {items.map((fn) => {
                                const sel = mod.functions.includes(fn);
                                return (
                                  <div key={fn} className={`cfg-opt ${sel ? "selected" : ""}`} style={{ fontSize: 11, padding: "3px 8px" }}
                                    onClick={() => outlineStore.updateModule(mod.id, (m) => { const idx = m.functions.indexOf(fn); idx >= 0 ? m.functions.splice(idx, 1) : m.functions.push(fn); })}>
                                    <span className="cfg-check">{sel ? "☑" : "☐"}</span> {fn}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div className="cfg-row">
                    <span className="cfg-label">表达方式 (多选)</span>
                    <div className="cfg-opts">
                      {EXPRESSION_TYPES.map((exp) => {
                        const sel = mod.expressions.includes(exp);
                        return (
                          <div key={exp} className={`cfg-opt ${sel ? "selected" : ""}`}
                            onClick={() => outlineStore.updateModule(mod.id, (m) => { const idx = m.expressions.indexOf(exp); idx >= 0 ? m.expressions.splice(idx, 1) : m.expressions.push(exp); })}>
                            <span className="cfg-check">{sel ? "☑" : "☐"}</span> {exp}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="cfg-row">
                    <span className="cfg-label">相关对话</span>
                    <textarea className="cfg-input cfg-textarea" value={mod.dialogue} onChange={(e) => outlineStore.updateModule(mod.id, (m) => { m.dialogue = e.target.value; })}
                      {...pasteSyncProps(() => mod.dialogue, (v) => outlineStore.updateModule(mod.id, (m) => { m.dialogue = v; }))}
                      placeholder="角色对话内容..." rows={2}
                      style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 4, padding: "4px 8px", color: "#ccc", fontSize: 12, resize: "vertical" }} />
                  </div>
                </div>
              ))}
              <button className="outline-config-add-btn" disabled={outlineStore.config.modules.length >= 10}
                onClick={() => outlineStore.addModule()}
                style={{ width: "100%", padding: 10, borderRadius: 8, background: "#2d3a5c", color: "#a0b0ff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                &#65291; 添加模块 ({outlineStore.config.modules.length}/10)
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function OutlineOptionSection({
  title, options, selected, onToggle, multi,
}: {
  title: string; options: string[]; selected: string | string[]; onToggle: (opt: string) => void; multi?: boolean;
}) {
  const isMulti = !!multi;
  const isSelected = (opt: string) => isMulti ? (selected as string[]).includes(opt) : selected === opt;
  return (
    <div className="cfg-section">
      <div className="cfg-section-title">{title}</div>
      <div className="cfg-opts">
        {options.map((opt) => {
          const sel = isSelected(opt);
          return (
            <div key={opt} className={`cfg-opt ${sel ? "selected" : ""}`} onClick={() => onToggle(opt)}>
              <span className="cfg-check">{sel ? "☑" : "☐"}</span> {opt}
            </div>
          );
        })}
      </div>
    </div>
  );
}
