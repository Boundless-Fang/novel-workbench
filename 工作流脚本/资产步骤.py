"""世界观、语言风格、角色卡、关系卡、剧情书/卷和信息账本的真实步骤实现。"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from LLM配置 import generate_markdown, policy_for
from 共享 import checked_write, context, fail, read_text, run_reference, safe_name, stage_project, worldview_path
import 结构化JSON

def _generate(base: Path, task: str, data: dict[str, Any], output: Path, contract: str, sources: list[Path]) -> list[str]:
    common = [base / "知识库" / "小说简介.md", base / "运行记录" / "初始化资料.md"]
    checked_write(base, task, output, generate_markdown(step_id=task, fields=data, context=context(base, [*common, *sources]), output_contract=contract))
    return [str(output.relative_to(base))]
def _json(base: Path, task: str, data: dict[str, Any], sources: list[Path]) -> list[str]:
    common = [base / "知识库" / "小说简介.md", base / "运行记录" / "初始化资料.md"]
    return 结构化JSON.run(task, base, data, context(base, [*common, *sources]))
def run(task: str, base: Path, data: dict[str, Any]) -> list[str]:
    if task == "compile_intro":
        summary = str(data.get("summary") or "").strip()
        if len(summary) > 100:
            fail("小说简介不能超过100字")
        return _json(base, task, data, [base / "运行记录" / "初始化资料.md"])
    if task == "generate_worldview":
        return _generate(base, task, data, base / "知识库" / "世界观.md", """# 世界观

## 小说类型

## 世界观基础

## 力量体系

## 势力
- 名称：
- 地位：
- 位置：
- 关键角色：角色名｜势力内身份｜境界/能力

## 资源设定""", [base / "剧情" / "剧情书.md", base / "知识库" / "信息账本.md"])
    if task == "generate_character":
        return _json(base, task, data, [worldview_path(base), base / "知识库" / "信息账本.md", base / "词汇库" / "人物词库.md"])
    if task == "compile_style":
        if not any(data.get(k) for k in ("narrative_rhythm", "tone", "sentence_paragraph", "psychology", "punctuation", "technique", "description", "person", "dialogue", "vocabulary")) and not data.get("user_input"): fail("语言风格至少需要一项")
        return _json(base, task, data, [worldview_path(base), base / "提取" / "原文风格.md"])
    if task == "compile_relation":
        return _json(base, task, data, [worldview_path(base), base / "知识库" / "信息账本.md"])
    if task in {"compile_plot", "compile_volume"}:
        if task == "compile_volume":
            data["kind"] = "volume"
        else:
            data.setdefault("kind", "book")
        return _json(base, task, data, [worldview_path(base), base / "知识库" / "信息账本.md"])
    if task == "compile_ledger":
        if "entries" in data and not isinstance(data.get("entries"), list): fail("entries 必须是数组")
        return _json(base, task, data, [base / "剧情" / "剧情书.md"])
    if task == "generate_characters_batch":
        roster_path = base / "知识库" / "角色名单.json"
        if not roster_path.exists():
            fail("缺少角色名单，请先生成角色名单")
        roster = json.loads(roster_path.read_text(encoding="utf-8"))
        characters = roster.get("characters") or []
        if not characters:
            fail("角色名单为空")
        outputs: list[str] = []
        for char in characters:
            if not isinstance(char, dict) or not str(char.get("name") or "").strip():
                continue
            payload = {"name": str(char["name"]).strip()}
            for key, value in char.items():
                if key != "name" and value not in (None, ""):
                    payload[key] = value
            if data.get("user_input"):
                payload["user_input"] = data["user_input"]
            outputs += _json(base, "generate_character", payload, [worldview_path(base), base / "知识库" / "信息账本.md", base / "词汇库" / "人物词库.md"])
        if not outputs:
            fail("角色名单中没有可生成的角色")
        return outputs
    if task == "generate_relations_batch":
        relations: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        roster_path = base / "知识库" / "角色名单.json"
        if roster_path.exists():
            roster = json.loads(roster_path.read_text(encoding="utf-8"))
            for char in roster.get("characters") or []:
                if not isinstance(char, dict) or not str(char.get("name") or "").strip():
                    continue
                a = str(char["name"]).strip()
                for rel in char.get("relations") or []:
                    if not isinstance(rel, dict) or not str(rel.get("target") or "").strip():
                        continue
                    b = str(rel["target"]).strip()
                    key = tuple(sorted([a, b]))
                    if key in seen:
                        continue
                    seen.add(key)
                    relations.append({"character_a": a, "character_b": b, "relationship": rel.get("relationship") or ""})
        if not relations:
            relation_dir = base / "知识库" / "关系卡"
            if relation_dir.exists():
                for path in sorted(relation_dir.glob("关系卡-*.json")):
                    try:
                        rel = json.loads(path.read_text(encoding="utf-8"))
                    except Exception:
                        continue
                    if not isinstance(rel, dict) or not str(rel.get("character_a") or "").strip() or not str(rel.get("character_b") or "").strip():
                        continue
                    a, b = str(rel["character_a"]).strip(), str(rel["character_b"]).strip()
                    key = tuple(sorted([a, b]))
                    if key in seen:
                        continue
                    seen.add(key)
                    relations.append({"character_a": a, "character_b": b, "relationship": rel.get("关系") or rel.get("relationship") or ""})
        if not relations:
            fail("没有可生成的关系：角色名单中缺少 relations，也没有已有关系卡可更新")
        outputs: list[str] = []
        for rel in relations:
            payload = {"character_a": rel["character_a"], "character_b": rel["character_b"]}
            if rel.get("relationship"):
                payload["relationship"] = rel["relationship"]
            if data.get("user_input"):
                payload["user_input"] = data["user_input"]
            outputs += _json(base, "compile_relation", payload, [worldview_path(base), base / "知识库" / "信息账本.md"])
        return outputs
    fail("资产步骤不支持：" + task)
