# 参考文件索引

这些文件仅作设计与实现参考，未直接接入当前网页。保留来源目录，便于追溯原项目。

## 纯净本地预设

`纯净本地预设/skills/` 是当前项目流程规范的主要依据：

- `novel-init-project`：相对项目根、目录初始化与不覆盖已有内容。
- `novel-normal` 及 stage 1–5：世界观、章节规划、正文、校验的顺序与输入输出。
- `novel-extract-source`：同人原著提取的本地流程。
- `novel-slop`：六类三级词表、SLOP 评分公式与报告字段。

## AI-Novel-Writing-Assistant

`AI-Novel-Writing-Assistant/流程与类型/` 聚焦生产状态与可追溯性：

- `chapter-production-chain.md`：正文热路径、接收闸门、局部修复与资产回灌。
- `novel-fact-ledger.md`、`character-resource-ledger.md`：验收后才回写的事实/角色账本。
- `novel-snapshot-retention.md`：提示词与正文版本快照。
- `pending-review-auto-promotion.md`：待确认状态与自动推进边界。
- `knowledge-and-context-assembly.md`：知识库召回与上下文组装。
- `novelWorkflow.ts`、`task.ts`、`stateProposalResolution.ts`：流程阶段、任务状态、变更提议的数据模型。

## StyleSync-Novel

`StyleSync-Novel/` 提供可借鉴的本地脚本分层，不应直接复制为当前生产实现：

- `文档/technical-design.md`、`evaluation.md`：工作台、分层生成和质量评估的设计依据。
- `脚本/f0`–`f4`：本地文本统计、风格/词库、世界观/角色、设定补全、RAG。
- `脚本/f5a`、`f5b`、`f5c`：章节大纲、正文、章节改写；对应当前的“锚点/配置/台词 → 快照 → 正文”。
- `脚本/f6`、`f7`：剧情推演与文本校验。
- `核心与接口/`：本地路径、LLM/RAG、项目/工作流接口与前端 hook 的实现参考。

## 未复制的内容

- 依赖目录、虚拟环境、数据库、用户小说数据、API 密钥与构建产物。
- AI-Novel-Writing-Assistant 的完整服务层；其依赖和数据库模型较重，当前应按需参考而不是直接搬运。
