export interface OutlineGlobalConfig {
  person: string;
  openingNarrative: string[];
  structureTemplate: string;
  eventRating: string;
  mainPOV: string;
  characters: string[];
  sceneCount: string;
}

export interface OutlineModule {
  id: string;
  summary: string;
  functions: string[];
  expressions: string[];
  dialogue: string;
  required: boolean;
}

export interface OutlineConfig {
  enabled: boolean;
  global: OutlineGlobalConfig;
  modules: OutlineModule[];
}

export const DEFAULT_OUTLINE_GLOBAL: OutlineGlobalConfig = {
  person: "第三人称",
  openingNarrative: ["顺叙"],
  structureTemplate: "铺垫蓄势结构",
  eventRating: "主线事件",
  mainPOV: "主角",
  characters: ["主角"],
  sceneCount: "单",
};

export const EXPRESSION_TYPES = ["叙述", "描写", "抒情", "议论", "说明"];

// ===== 内置通用模板（上传版默认值） =====
// 进阶/扩展模板通过 public/prompts-local.json 在运行时合并注入，
// 该文件被 .gitignore 忽略，因此不会进入公开仓库与别人构建的 APK。

export const MODULE_FUNCTION_CATEGORIES: Record<string, Record<string, string[]>> = {
  "叙事架构": {
    "背景设定": ["世界规则/体系", "势力格局/阵营关系", "时代/环境背景"],
    "场景氛围": ["时间·时间段", "地点·由大及小", "地点·具体场景名", "氛围", "环境细节"],
    "前置剧情": ["上一章/段落的直接衔接", "此前已发生但未展示的事件概述", "角色当前状态简述", "大背景补充"],
    "人物出场": ["主角", "配角", "群像"],
    "情节推进": ["事件铺垫", "冲突升级", "转折点", "收束"],
    "对话引入": ["对话作为场景开场", "对话中的信息交代", "对话中的冲突/张力", "对话揭示人物关系", "对话推动情节转折"],
    "切换场景": ["时间跳跃切换", "空间位移切换", "视角切换", "平行交叉剪辑", "前后对比并置"],
  },
  "表现手法": {
    "铺垫伏笔": ["名称/符号埋伏", "设定前置提示", "角色的无心之语", "跨章细节呼应"],
    "悬念设置": ["信息不匹配", "信息不明确", "异常细节累积", "打断"],
    "呼应揭晓": ["前文伏笔收束解答", "未回答问题的确认", "推翻式揭晓", "揭晓同时植入新悬念"],
    "对比反差": ["角色自身的对比", "认知与现实的对比", "角色间的对比/竞争", "身份与行为反差", "空间/场景对比"],
    "记忆/往事": ["美好回忆", "人物前史", "历史/传说", "他人所述", "当下感官触发"],
  },
  "节奏控制": {
    "情绪递进": ["紧张感递增", "情绪起伏", "节奏变换"],
    "铺垫蓄势": ["渐进铺垫", "延迟揭示", "反差呈现"],
    "结尾收束": ["暗示", "完结", "悬念", "角色位移", "双线交汇"],
  },
};

export const GLOBAL_OPTIONS = {
  person: ["第一人称", "第三人称", "混合"],
  openingNarrative: ["顺叙", "倒叙", "插叙", "预叙", "楔子"],
  structureTemplate: ["铺垫蓄势结构", "冲突递进结构", "多线并行结构", "悬念收束结构", "环环相扣结构"],
  eventRating: ["主线事件", "支线事件", "闲笔事件"],
  mainPOV: ["主角", "配角", "全知视角"],
  characters: ["主角", "配角"],
  sceneCount: ["单", "双", "多"],
};

export const STRUCTURE_TEMPLATE_MODULES: Record<string, { name: string; required: boolean }[]> = {
  "铺垫蓄势结构": [
    { name: "场景氛围", required: true }, { name: "前置剧情", required: true }, { name: "人物出场", required: true },
    { name: "铺垫伏笔", required: true }, { name: "悬念设置", required: true }, { name: "结尾收束", required: true },
  ],
  "冲突递进结构": [
    { name: "场景氛围", required: true }, { name: "人物出场", required: true }, { name: "情节推进", required: true },
    { name: "对比反差", required: true }, { name: "呼应揭晓", required: true }, { name: "结尾收束", required: true },
  ],
  "多线并行结构": [
    { name: "前置剧情", required: true }, { name: "场景氛围", required: true }, { name: "切换场景", required: false },
    { name: "人物出场", required: true }, { name: "情节推进", required: true }, { name: "结尾收束", required: true },
  ],
  "悬念收束结构": [
    { name: "场景氛围", required: true }, { name: "人物出场", required: true }, { name: "悬念设置", required: true },
    { name: "呼应揭晓", required: true }, { name: "对比反差", required: true }, { name: "结尾收束", required: true },
  ],
  "环环相扣结构": [
    { name: "场景氛围", required: true }, { name: "前置剧情", required: true }, { name: "情节推进", required: true },
    { name: "对比反差", required: true }, { name: "呼应揭晓", required: false }, { name: "结尾收束", required: true },
  ],
};

// ===== 本地扩展加载 =====
// public/prompts-local.json（已被 .gitignore 忽略，仅存在于本地构建产物中）：
// 若存在，则用其中的扩展数据整体替换上方对应字段；不存在（如 clone 下来的公开仓库）
// 则保持内置通用模板不变。
export interface OutlineOverrides {
  moduleFunctionCategories?: Record<string, Record<string, string[]>>;
  structureTemplates?: string[];
  structureTemplateModules?: Record<string, { name: string; required: boolean }[]>;
  mainPOV?: string[];
  characters?: string[];
  defaultCharacters?: string[];
}

let loadPromise: Promise<void> | null = null;

export function loadOutlineOverrides(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetch("/prompts-local.json", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as OutlineOverrides;

      if (data.moduleFunctionCategories) {
        for (const k of Object.keys(MODULE_FUNCTION_CATEGORIES)) delete MODULE_FUNCTION_CATEGORIES[k];
        Object.assign(MODULE_FUNCTION_CATEGORIES, data.moduleFunctionCategories);
      }
      if (data.structureTemplates) {
        GLOBAL_OPTIONS.structureTemplate = data.structureTemplates;
      }
      if (data.structureTemplateModules) {
        for (const k of Object.keys(STRUCTURE_TEMPLATE_MODULES)) delete STRUCTURE_TEMPLATE_MODULES[k];
        Object.assign(STRUCTURE_TEMPLATE_MODULES, data.structureTemplateModules);
      }
      if (data.mainPOV) {
        GLOBAL_OPTIONS.mainPOV = data.mainPOV;
      }
      if (data.characters) {
        GLOBAL_OPTIONS.characters = data.characters;
      }
      if (data.defaultCharacters) {
        DEFAULT_OUTLINE_GLOBAL.characters = data.defaultCharacters;
      }
    } catch {
      // 本地扩展文件缺失（公开构建）时静默回退到内置通用模板
    }
  })();
  return loadPromise;
}

export function generateOutlinePrompt(config: OutlineConfig): string {
  if (!config.enabled) return "";

  const g = config.global;
  const parts: string[] = ["请严格按照以下大纲配置输出小说内容：", "", "## 全局设置"];

  parts.push(`- 人称：${g.person}`);
  if (g.openingNarrative.length > 0) {
    parts.push(`- 开头叙事：${g.openingNarrative.join("、")}`);
  }
  parts.push(`- 结构模板：${g.structureTemplate}`);
  parts.push(`- 事件评级：${g.eventRating}`);
  parts.push(`- 主要视角：${g.mainPOV}`);
  parts.push(`- 登场角色：${g.characters.join("、")}`);
  parts.push(`- 场景：${g.sceneCount}`);

  if (config.modules.length > 0) {
    parts.push("", "## 模块大纲");
    config.modules.forEach((mod, i) => {
      parts.push(`### 模块${i + 1}：${mod.summary || "（待填写）"}${mod.required ? "【必选】" : "【可选】"}`);
      if (mod.functions.length > 0) {
        parts.push(`- 模块作用：${mod.functions.join("、")}`);
      }
      if (mod.expressions.length > 0) {
        parts.push(`- 表达方式：${mod.expressions.join("、")}`);
      }
      if (mod.dialogue.trim()) {
        parts.push(`- 相关对话：${mod.dialogue.trim()}`);
      }
    });
  }

  parts.push("", "请根据每个模块的要求，依次输出对应内容。");
  return parts.join("\n");
}
