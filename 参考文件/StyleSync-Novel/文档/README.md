# StyleSync-Novel

StyleSync-Novel 是一个面向小说创作场景的 AI 原型项目。它不是“一键出文”工具，而是把创作过程拆成若干可控环节，用来验证长篇创作中的风格控制、设定整理、章节规划、正文生成和局部修改。

## 使用前需要准备

启动前请先确认：

1. 已安装 Python 3.11 或 3.12
2. 已准备 `DEEPSEEK_API_KEY`
3. 如需使用 embedding / RAG / 检索相关流程，已准备 `SILICONFLOW_API_KEY`
4. 建议在常见中国大陆网络环境下使用；如果页面样式、图标或脚本加载不完整，请先检查网络连接

`.env.example` 示例：

```env
DEEPSEEK_API_KEY=your_deepseek_key
SILICONFLOW_API_KEY=your_siliconflow_key
DEFAULT_CHAT_MODEL=deepseek-v4-flash
DEFAULT_EMBEDDING_MODEL=BAAI/bge-m3
```

## 当前已实现功能

- 风格分析
- 词汇库建立
- 世界观提取
- 角色信息卡提取
- 设定补全
- 章节大纲生成
- 正文生成
- 章内局部修改
- 工作台内的提示词注入与微调

## 项目流程

1. 项目初始化与素材准备
2. 风格分析与词汇整理
3. 世界观 / 人物信息提取
4. 设定补全
5. 章节大纲生成
6. 正文生成
7. 章内局部修改
8. 工作台微调

## 目录结构

```text
StyleSync-Novel/
├─ style_imitation_code/
│  ├─ api/
│  ├─ core/
│  ├─ frontend/
│  ├─ scripts/
│  └─ main.py
├─ docs/
├─ tests/
├─ dictionaries/
├─ reference_novels/
├─ text_style_imitation/
├─ novel_projects/
├─ requirements.txt
└─ README.md
```

## 快速启动

### 1. 创建虚拟环境并安装依赖

```powershell
py -3.11 -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
```

### 2. 配置 `.env`

```powershell
Copy-Item .env.example .env
```

然后填写所需的 API Key。

### 3. 启动项目

```powershell
python style_imitation_code/main.py
```

默认访问：

- <http://127.0.0.1:8000>

## 测试

```powershell
python -m pytest tests
```

如需图形化测试入口，可运行：

```powershell
python tests/0_test_runner_gui.py
```
