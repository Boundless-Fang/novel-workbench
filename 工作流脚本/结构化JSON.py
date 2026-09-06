#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""固定格式资产的统一 JSON 生成与 Markdown 渲染。

原则：
- 每个步骤生成两个文件：`xxx.json`（结构化源，网页隐藏）和 `xxx.md`（可读版，网页显示）。
- 使用 LLM 直接生成 JSON，不再依赖 Markdown 标题词做硬校验。
- 台词格式固定为：
  <角色名> + “<台词>”
  <角色名> + “ [心声]”
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from LLM配置 import generate_json
from 共享 import context, safe_name

TASK_JSON_SCHEMAS: dict[str, dict[str, Any]] = {
    "compile_character_roster": {
        "characters": [
            {
                "name": "角色名；若用户未提供名字，必须根据身份/描述自动取名；取名避免俗套，少用月/清/雪/紫/璃等常见字",
                "brief": "角色简介：身份、性格、目标等",
                "relations": [
                    {"target": "关联角色名", "relationship": "关系描述（如夫妻、交易同盟、敌对）"}
                ]
            }
        ]
    },
    "compile_relation_roster": {
        "relations": [
            {"character_a": "角色A", "character_b": "角色B", "brief": "关系简述（可选）"}
        ]
    },
    "compile_intro": {
        "summary": "不超过100字、包含主角名和具体剧情的小说简介",
        "tags": {"题材": "题材标签", "受众": "男频/女频", "感情线": "多女主/单女主/无女主"},
    },
    "compile_style": {
        "行文风格": {"叙事节奏": "", "语体色彩": "", "叙事语调": "", "描写风格": ""},
        "格式要求": {"人称视角": "", "句段长度": "", "心理呈现": "", "对话处理": "", "标点习惯": ""},
        "手法偏好": {"表达方式": "", "表现手法": "", "描写角度": "", "修辞手法": ""},
        "词汇策略": {"称谓指代": "", "雅俗取向": "", "情绪浓度": "", "感官倾向": ""},
    },
    "generate_character": {
        "name": "角色名",
        "importance": "1-4",
        "gender": "性别",
        "age": "年龄",
        "identity": "身份",
        "personality": "性格",
        "values": "价值观",
        "appearance": "外貌、身材、服饰偏好",
        "voice": "音色与语言习惯",
        "ability": "能力/境界",
        "timeline": "经历时间轴",
    },
    "compile_relation": {
        "character_a": "角色 A",
        "character_b": "角色 B",
        "称呼": "彼此称呼",
        "关系": "关系类型",
        "情感": "情感状态",
        "共同经历": "塑造关系的关键事件",
        "当前态度": "当前态度",
    },
    "compile_plot": {
        "kind": "book",
        "protagonist": "主角",
        "mainline": "主线梗概",
        "volumes": [{"name": "第 N 卷", "key_characters": "卷关键角色", "plot": "本卷剧情"}],
    },
    "compile_volume": {
        "kind": "volume",
        "volume": "卷名",
        "protagonist": "主角",
        "characters": "卷关键角色",
        "chapter_range": "章号范围",
        "chapters": [{"chapter": "第 X 章", "plot": "本章剧情"}],
    },
    "compile_ledger": {
        "entries": [
            {"type": "历史/传闻/伏笔", "content": "内容", "source": "来源/章节", "status": "已确认/待验证/已回收"}
        ]
    },
    "compile_anchor": {
        "chapter": "章节名",
        "出场角色": [{"name": "角色名", "purpose": "目的", "emotion": "情绪"}],
        "核心事件": "不多于100字",
        "信息边界": {"可揭示": "", "不可揭示": "", "揭示方式": "", "揭示者": "", "揭示位置": ""},
        "伏笔": "",
        "钩子": "",
    },
    "compile_dialogue": {
        "chapter": "章节名",
        "dialogues": [
            {"character": "角色名", "line": "只能写两类：1) 角色实际说出的台词（不加方括号）；2) 角色内心独白，格式为 [心声内容]，例如 [她心里一紧]。禁止写场景、动作、神态、旁白、叙述。"}
        ],
    },
    "validate": {
        "chapter": "章节名",
        "word_count": 0,
        "semantic_checks": [
            {"item": "锚点落实", "result": "通过/需修复", "note": ""},
            {"item": "设定一致性", "result": "通过/需修复", "note": ""},
            {"item": "角色一致性", "result": "通过/需修复", "note": ""},
            {"item": "剧情连贯性", "result": "通过/需修复", "note": ""},
            {"item": "文风与表达", "result": "通过/需修复", "note": ""},
        ],
        "conclusion": "通过/需修复",
        "issues": ["问题清单"],
    },
}


def output_paths(task: str, base: Path, data: dict[str, Any]) -> tuple[Path, Path]:
    """返回 (json_path, md_path)。"""
    if task == "compile_character_roster":
        folder, stem = base / "知识库", "角色名单"
    elif task == "compile_relation_roster":
        folder, stem = base / "知识库", "关系名单"
    elif task == "compile_intro":
        folder, stem = base / "知识库", "小说简介"
    elif task == "compile_style":
        folder, stem = base / "知识库", "语言风格"
    elif task == "generate_character":
        folder = base / "知识库" / "角色卡"
        stem = f"角色卡-{safe_name(data.get('name'), '角色名')}"
    elif task == "compile_relation":
        folder = base / "知识库" / "关系卡"
        a = safe_name(data.get("character_a"), "角色 A")
        b = safe_name(data.get("character_b"), "角色 B")
        stem = f"关系卡-{a}-{b}"
    elif task == "compile_plot":
        folder, stem = base / "剧情", "剧情书"
    elif task == "compile_volume":
        folder = base / "剧情" / "剧情卷"
        stem = safe_name(data.get("volume"), "卷名")
    elif task == "compile_ledger":
        folder, stem = base / "知识库", "信息账本"
    elif task == "compile_anchor":
        folder = base / "提示词" / safe_name(data.get("chapter"), "章节名")
        stem = "强制设定锚点"
    elif task == "compile_dialogue":
        folder = base / "提示词" / safe_name(data.get("chapter"), "章节名")
        stem = "台词"
    elif task == "validate":
        folder = base / "提示词" / safe_name(data.get("chapter"), "章节名")
        stem = "校验报告"
    else:
        raise ValueError(f"结构化 JSON 不支持任务：{task}")
    return folder / f"{stem}.json", folder / f"{stem}.md"


def render_markdown(task: str, data: dict[str, Any]) -> str:
    if task == "compile_character_roster":
        lines = ["# 角色名单", ""]
        for char in data.get("characters") or []:
            if not isinstance(char, dict):
                continue
            name = char.get("name") or "未命名"
            brief = char.get("brief") or ""
            lines.append(f"## {name}")
            lines.append(f"- 简介：{brief or '待补充'}")
            relations = char.get("relations") or []
            if relations:
                lines.append("- 关系：")
                for rel in relations:
                    if isinstance(rel, dict):
                        target = rel.get("target") or "待补充"
                        relationship = rel.get("relationship") or "待补充"
                        lines.append(f"  - {target}：{relationship}")
            lines.append("")
        return "\n".join(lines)
    if task == "compile_relation_roster":
        lines = ["# 关系名单", ""]
        for rel in data.get("relations") or []:
            if not isinstance(rel, dict):
                continue
            a = rel.get("character_a") or "角色A"
            b = rel.get("character_b") or "角色B"
            brief = rel.get("brief") or ""
            lines.append(f"- {a} ↔ {b}：{brief}" if brief else f"- {a} ↔ {b}")
        return "\n".join(lines)
    if task == "compile_intro":
        tags = data.get("tags") or {}
        return (
            "# 小说简介\n\n## 简介\n"
            f"{data.get('summary') or '待补充'}\n\n## 标签\n"
            f"- 题材：{tags.get('题材') or '待补充'}\n"
            f"- 受众：{tags.get('受众') or '待补充'}\n"
            f"- 感情线：{tags.get('感情线') or '待补充'}\n"
        )
    if task == "compile_style":
        lines = ["# 语言风格", ""]
        for group, label in [("行文风格", "行文风格"), ("格式要求", "格式要求"), ("手法偏好", "手法偏好"), ("词汇策略", "词汇策略")]:
            lines.append(f"## {label}")
            items = data.get(group) or {}
            if isinstance(items, dict):
                for key, value in items.items():
                    lines.append(f"- {key}：{value or '待补充'}")
            lines.append("")
        return "\n".join(lines)
    if task == "generate_character":
        return (
            f"# 角色卡：{data.get('name') or '未命名'}\n\n"
            f"- 性别｜重要性：{data.get('gender') or '待补充'}｜{data.get('importance') or '待补充'}\n"
            f"- 身份｜性格｜价值观：{data.get('identity') or '待补充'}｜{data.get('personality') or '待补充'}｜{data.get('values') or '待补充'}\n"
            f"- 外貌气质｜身材身高｜服饰偏好：{data.get('appearance') or '待补充'}\n"
            f"- 语言习惯｜音色：{data.get('voice') or '待补充'}\n"
            f"- 主要能力 / 境界：{data.get('ability') or '待补充'}\n"
            f"- 年龄与经历时间轴：{data.get('timeline') or '待补充'}\n"
        )
    if task == "compile_relation":
        return (
            f"# 关系卡：{data.get('character_a') or '角色A'} — {data.get('character_b') or '角色B'}\n\n"
            f"- 称呼：{data.get('称呼') or '待补充'}\n"
            f"- 关系：{data.get('关系') or '待补充'}\n"
            f"- 情感：{data.get('情感') or '待补充'}\n"
            f"- 共同经历：{data.get('共同经历') or '待补充'}\n"
            f"- 当前态度：{data.get('当前态度') or '待补充'}\n"
        )
    if task == "compile_plot":
        lines = ["# 剧情书", "", f"- 主角：{data.get('protagonist') or '待补充'}", f"- 主线：{data.get('mainline') or '待补充'}", ""]
        for vol in data.get("volumes") or []:
            if not isinstance(vol, dict):
                continue
            lines.append(f"## {vol.get('name') or '第 N 卷'}")
            lines.append(f"- 关键角色：{vol.get('key_characters') or '待补充'}")
            lines.append(f"- 剧情：{vol.get('plot') or '待补充'}")
            lines.append("")
        return "\n".join(lines)
    if task == "compile_volume":
        lines = [f"# {data.get('volume') or '剧情卷'}", "", f"- 卷名：{data.get('volume') or '待补充'}", f"- 主角：{data.get('protagonist') or '待补充'}", f"- 关键角色：{data.get('characters') or '待补充'}", f"- 章号范围：{data.get('chapter_range') or '待补充'}", ""]
        for ch in data.get("chapters") or []:
            if not isinstance(ch, dict):
                continue
            lines.append(f"## {ch.get('chapter') or '第 X 章'}")
            lines.append(f"- 剧情：{ch.get('plot') or '待补充'}")
            lines.append("")
        return "\n".join(lines)
    if task == "compile_ledger":
        lines = ["# 信息账本", ""]
        for entry in data.get("entries") or []:
            if not isinstance(entry, dict):
                continue
            lines.append(f"- {entry.get('type') or '条目'}：{entry.get('content') or '待补充'}（来源：{entry.get('source') or '待补充'}；状态：{entry.get('status') or '待补充'}）")
        return "\n".join(lines)
    if task == "compile_anchor":
        lines = [f"# {data.get('chapter') or ''}强制设定锚点", ""]
        lines.append("## 出场角色")
        for char in data.get("出场角色") or []:
            if isinstance(char, dict):
                lines.append(f"- {char.get('name') or '未命名'}（目的：{char.get('purpose') or '待补充'}；情绪：{char.get('emotion') or '待补充'}）")
        lines.append("")
        lines.append(f"## 核心事件\n{data.get('核心事件') or '待补充'}")
        boundary = data.get("信息边界") or {}
        lines.append("\n## 信息边界")
        for key in ("可揭示", "不可揭示", "揭示方式", "揭示者", "揭示位置"):
            lines.append(f"- {key}：{boundary.get(key) or '待补充'}" if isinstance(boundary, dict) else f"- {key}：待补充")
        lines.append("")
        lines.append(f"## 伏笔\n{data.get('伏笔') or '待补充'}")
        lines.append(f"\n## 钩子\n{data.get('钩子') or '待补充'}")
        return "\n".join(lines)
    if task == "compile_dialogue":
        lines = [f"# {data.get('chapter') or ''}台词", ""]
        for dlg in data.get("dialogues") or []:
            if not isinstance(dlg, dict):
                continue
            line = dlg.get('line') or ''; lines.append(f"{dlg.get('character') or '角色'} + “{(' ' + line) if line.strip().startswith('[') else line}”")
        return "\n".join(lines)
    if task == "validate":
        lines = [f"# {data.get('chapter') or ''}校验报告", "", f"- 字数：{data.get('word_count') or 0}", "", "## 语义校验"]
        for check in data.get("semantic_checks") or []:
            if isinstance(check, dict):
                note = f"（{check.get('note')}）" if check.get("note") else ""
                lines.append(f"- {check.get('item') or '检查项'}：{check.get('result') or '待补充'}{note}")
        lines.append("")
        lines.append(f"## 结论\n- 结果：{data.get('conclusion') or '待补充'}")
        issues = data.get("issues") or []
        if issues:
            lines.append("- 问题清单：")
            for issue in issues:
                lines.append(f"  - {issue}")
        return "\n".join(lines)
    raise ValueError(f"结构化 JSON 不支持渲染任务：{task}")


def run(task: str, base: Path, data: dict[str, Any], context: str) -> list[str]:
    """生成 JSON 源文件 + Markdown 可读版，返回 [md, json] 相对路径。"""
    if task not in TASK_JSON_SCHEMAS:
        raise ValueError(f"结构化 JSON 不支持任务：{task}")

    schema = TASK_JSON_SCHEMAS[task]
    payload = generate_json(step_id=task, fields=data, context=context, json_schema=schema)

    # 补齐用于路径/渲染但不一定由 LLM 回填的身份字段
    for key in ("chapter", "name", "character_a", "character_b", "volume", "kind"):
        if key in data and key not in payload:
            payload[key] = data[key]

    json_path, md_path = output_paths(task, base, payload)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(task, payload), encoding="utf-8")
    return [str(md_path.relative_to(base)), str(json_path.relative_to(base))]


def run_engine(task: str, base: Path, data: dict[str, Any]) -> list[str]:
    """工作流引擎入口：用通用项目上下文生成结构化资产。"""
    ctx = context(base, [
        base / "知识库" / "小说简介.md",
        base / "运行记录" / "初始化资料.md",
        base / "知识库" / "世界观.md",
        base / "知识库" / "信息账本.md",
        base / "剧情" / "剧情书.md",
    ])
    return run(task, base, data, ctx)
