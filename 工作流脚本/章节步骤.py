"""章节锚点、配置、台词、大纲、快照、正文与改写的真实步骤实现。"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from LLM配置 import generate_markdown, policy_for
from 共享 import asset_cards, chapter_asset, chapter_prose, checked_write, context, fail, read_text, run_reference, safe_name, stage_project, worldview_path, worldview_text
from 步骤定义 import CONFIG_LABELS, CONFIG_MULTIPLE, validate_config_fields
import 结构化JSON

def _chapter(data: dict[str, Any]) -> str: return safe_name(data.get("chapter"), "章节名")
def _chapter_user_input(base: Path, chapter: str) -> Path:
    return base / "运行记录" / "章节输入" / f"{chapter}.md"

def _generate(base: Path, task: str, data: dict[str, Any], path: Path, contract: str, paths: list[Path]) -> list[str]:
    chapter = _chapter(data)
    user_input = _chapter_user_input(base, chapter)
    sources = [user_input, *paths] if user_input.exists() else paths
    checked_write(base, task, path, generate_markdown(step_id=task, fields=data, context=context(base, sources), output_contract=contract)); return [str(path.relative_to(base))]
def _json_generate(base: Path, task: str, data: dict[str, Any], paths: list[Path]) -> list[str]:
    return 结构化JSON.run(task, base, data, context(base, paths))
def _volume_plots(base: Path) -> list[Path]:
    volume_dir = base / "剧情" / "剧情卷"
    return sorted(volume_dir.glob("*.md")) if volume_dir.exists() else []
def run(task: str, base: Path, data: dict[str, Any]) -> list[str]:
    chapter = _chapter(data)
    if task == "compile_anchor":
        cards, relations = asset_cards(base)
        return _json_generate(base, task, data, [base / "知识库" / "小说简介.md", worldview_path(base), *cards, *relations, base / "剧情" / "剧情书.md", *_volume_plots(base), base / "知识库" / "信息账本.md"])
    if task == "compile_config":
        values, dropped = validate_config_fields(data)
        # 与右侧模板一致：十个分组全部存在，未使用的分组留空。
        text = f"# {chapter}配置\n\n" + "\n\n".join(f"## {label}\n" + ("、".join(values[key]) if key in CONFIG_MULTIPLE else str(values[key])) for key, label in CONFIG_LABELS.items())
        if dropped:
            # 输入里无法归一到受控选项的条目：丢弃但显式记录，避免静默丢失用户意图。
            text += "\n\n## 未识别选项\n" + "\n".join(f"- {item}" for item in dropped)
        path = chapter_asset(base, chapter, "配置.md")
        checked_write(base, task, path, text)
        return [str(path.relative_to(base))]
    if task == "compile_dialogue":
        cards, relations = asset_cards(base)
        return _json_generate(base, task, data, [base / "知识库" / "语言风格.md", base / "词汇库" / "对话词库.md", chapter_asset(base, chapter, "强制设定锚点.md"), *cards, *relations])
    if task == "compile_snapshot":
        required = [worldview_path(base), chapter_asset(base, chapter, "强制设定锚点.md"), chapter_asset(base, chapter, "配置.md"), chapter_asset(base, chapter, "台词.md")]
        missing = [str(p.relative_to(base)) for p in required if not p.exists()]
        if missing: fail("不能编译提示词快照，缺少：" + "、".join(missing))
        names = {str(item).strip() for item in data.get("characters", []) if str(item).strip()} if isinstance(data.get("characters", []), list) else set()
        cards = [p for p in (base / "知识库" / "角色卡").glob("*.md") if not names or any(name in p.name for name in names)]
        relations = [p for p in (base / "知识库" / "关系卡").glob("*.md") if not names or any(name in p.name for name in names)]
        join_assets = lambda paths: "\n\n".join(read_text(p) for p in paths) or "无"
        optional_vocab = [("人物词库", base / "词汇库" / "人物词库.md"), ("对话词库", base / "词汇库" / "对话词库.md"), ("通用词库", base / "词汇库" / "通用词库.md"), ("禁用词库", base / "词汇库" / "禁用词库.md")]
        sections = [("本章用户信息", read_text(_chapter_user_input(base, chapter))), ("世界观", worldview_text(base)), ("语言风格", read_text(base / "知识库" / "语言风格.md"))] + [(name, read_text(path)) for name, path in optional_vocab if path.exists()] + [("角色卡", join_assets(cards)), ("关系卡", join_assets(relations)), ("强制设定锚点", read_text(required[1])), ("配置", read_text(required[2])), ("台词", read_text(required[3])), ("禁词表", read_text(base / "知识库" / "禁词表.md") or "无"), ("上一章结尾", data.get("previous_ending", ""))]
        output = chapter_asset(base, chapter, "最终提示词快照.md"); checked_write(base, task, output, "# 最终提示词快照\n\n" + "\n\n".join(f"## {name}\n{text or '无'}" for name, text in sections)); return [str(output.relative_to(base))]
    if task == "generate_prose":
        snapshot = chapter_asset(base, chapter, "最终提示词快照.md")
        if not snapshot.exists(): fail("生成正文前必须存在最终提示词快照")
        return _generate(base, task, data, chapter_prose(base, chapter), "只输出完整正文，不要标题、解释或代码围栏。输入仅为最终提示词快照。人物心理必须写为 [心理内容]；人物对白必须使用中文引号“”；每次场景切换必须单独使用一行 --- 分隔。", [snapshot])
    if task == "rewrite_prose":
        original = chapter_prose(base, chapter)
        if not original.exists(): fail("改写前必须存在正文")
        return _generate(base, task, data, base / "草稿" / f"{chapter}-改写预览.txt", "只输出改写后的完整正文，不要标题、解释或代码围栏；保留本章既定事实。人物心理必须写为 [心理内容]；人物对白必须使用中文引号“”；每次场景切换必须单独使用一行 --- 分隔。", [original, chapter_asset(base, chapter, "强制设定锚点.md"), base / "知识库" / "语言风格.md"])
    fail("章节步骤不支持：" + task)
