---
name: novel-conventions
description: 小说写作模式通用约定：相对路径规则（<项目>/、<inkflow>/）与模型配置（生成模型、检查模型、思考档）。所有 novel 写作 skill 中"见 novel-conventions《通用约定·X》"的条目以本 skill 为准。
---

# 小说写作模式通用约定

## 通用约定

### 路径
- 所有 skill 内路径均为相对路径，不出现绝对路径。
- `脚本/`：写作工具脚本目录（novel_flow.py / novel_project.py / 检索工具.py / extract_source_info.py 等），位于本仓库 `.local-presets/novel-scripts/`；执行时用绝对路径指向该目录。
- `<项目>/`：当前小说项目文件夹（`原创-<作品名>` / `同人-<作品名>`）；对话所在文件夹即项目时以当前目录为准。
- `<inkflow>/`：InkFlow 工程根目录（Slop 规则表与评测脚本所在地）。

### 模型
- 生成模型：`deepseek-v4-pro`，思考 high；可在项目配置中覆盖。
- 检查模型：`deepseek-v4-flash`，思考开启，`reasoning_effort=low`。
- 各环节统一按此执行，各 stage SKILL.md 不单独声明模型。

## 通用说明

- 所有环节必读项目级 `<项目>/知识库/强制设定锚点.md`（模板见各流程入口 skill 的 `shared/强制设定锚点.md`）；
- 各 stage 优先用 `脚本/novel_flow.py <stage> … --mode normal` 执行；脚本不可用或参数不符时，按各 stage SKILL.md 用文件编辑工具与持久 shell 手工完成；
- 公共输入（锚点、①产物）只在 novel-normal skill《公共输入》声明一次，各 stage 不再重复列出；
- 路径与模型只在本 skill 维护一处，改动无需触碰其他 skill。
