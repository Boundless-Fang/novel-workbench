/**
 * ============================================================
 *  InkFlow - 框架中枢
 *  本文件是整个项目的框架入口，定义所有模块的依赖关系
 * ============================================================
 *
 *  架构总览:
 *
 *  页面层 (pages/)
 *    HomePage      → 对话列表
 *    ChatPage      → 核心聊天 (调用 useChat hook)
 *    PromptsPage   → 【新功能】提示词模板管理
 *    KnowledgePage → 知识库
 *    SettingsPage  → API/模型配置
 *         │
 *         ▼ 调用
 *  组件层 (components/)
 *    chat/         → ChatList, ChatMessage, ChatInput, ChatHeader
 *    prompts/      → PromptList, PromptEditor, PromptCard 【新功能】
 *    knowledge/    → KnowledgeList, KnowledgeItem
 *    settings/     → ApiSettings, ModelSettings
 *    common/       → Modal, Button, Markdown
 *         │
 *         ▼ 调用
 *  Hook 层 (hooks/)
 *    useChat       → 聊天逻辑 (调用 api/client + checker)
 *    useChecker    → 【新功能】内容检测 (调用 checker/)
 *    useDebounce   → 防抖工具
 *         │
 *         ▼ 调用
 *  服务层 (services/)
 *    api/          → LLM API 直连 (OpenAI/Claude/DeepSeek/SiliconFlow/Gemini)
 *    checker/      → 【新功能】重复检索 / 禁用词 / 开头检索
 *    storage/      → IndexedDB 本地持久化
 *    sync/         → 【需服务器】云端同步
 *         │
 *         ▼ 依赖
 *  数据层 (store/)
 *    chatStore     → 对话状态
 *    promptStore   → 提示词模板 (继承 NextChat Mask 设计)
 *    knowledgeStore→ 知识库
 *    settingsStore → 配置 (API Key, 模型参数)
 *    checkerStore  → 【新功能】检测规则
 *
 *  类型层 (types/)
 *    chat / prompt / knowledge / checker / api
 *
 *  工具层 (utils/)
 *    token / template / text / similarity / id
 *
 * ============================================================
 *  API Key 流转 (纯客户端，不经过服务器):
 *   用户填入 → settingsStore → api/client → 直接请求 LLM 提供商
 *
 * ============================================================
 *  【需服务器标注】
 *  - services/sync/sync.ts  云端同步
 *  - .env.template 中的 VITE_SYNC_SERVER_URL / WEBDAV
 *
 *  其余全部功能均为纯客户端实现
 * ============================================================
 */

export { useChatStore } from "./chatStore";
export { usePromptStore } from "./promptStore";
export { useKnowledgeStore } from "./knowledgeStore";
export { useSettingsStore } from "./settingsStore";
export { useCheckerStore } from "./checkerStore";
export { useProjectStore } from "./projectStore";
export { useOutlineStore } from "./outlineStore";

export type { ChatSession, ChatMessage } from "../types/chat";
export type { PromptTemplate } from "../types/prompt";
export type { KnowledgeItem } from "../types/knowledge";
export type { CheckerRule, CheckResult } from "../types/checker";
export type { LLMConfig, ChatOptions } from "../types/api";
export type { Project } from "../types/project";
