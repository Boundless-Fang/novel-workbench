"""无模型的完整流程集成验证。

用途：验证《完整流程与选择规范.md》中当前已实现的流程能否按顺序跑通，
同时检查规范中声明、但没有对应可执行任务的阶段。

不读取或修改现有小说；运行时只会在“小说项目”下建立一个临时原创项目，
结束后立即删除。所有 LLM 和同人提取参考脚本都会被替身实现取代，因此不会
发送 API 请求，也不会消耗额度。

运行：
  python 验证完整流程.py
  python 验证完整流程.py --strict-spec
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import patch

import 资产步骤
import 提取步骤
import 章节步骤
import 校验步骤
import 工作流引擎
import 结构化JSON
from 共享 import PROJECTS_ROOT
from 步骤定义 import TASK_MODULES, validate_format


CHAPTER = "第1章：验证"
REQUIRED_UPDATE_TARGETS = ("剧情卷", "世界观", "语言风格", "角色卡", "关系卡", "信息账本")


def fixture(step_id: str, output_contract: str, **_: Any) -> str:
    """返回能通过当前格式门禁的确定性产物；完全替代 LLM。"""
    if step_id in {"generate_prose", "rewrite_prose"}:
        return "[验证角色思考]\n\n验证角色说：“流程验证通过。”\n\n---\n\n场景切换后继续。"
    if step_id == "compile_dialogue":
        return f"# {CHAPTER}台词\n\n验证角色 + “流程验证通过。”\n\n心理状态使用 [] 标记。"
    if step_id == "validate":
        return f"# {CHAPTER}校验报告\n\n## 语义校验\n- 锚点落实：通过\n\n## 结论\n- 结果：通过"
    return output_contract


def json_fixture(step_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    """返回能通过结构化 JSON 渲染的确定性产物；完全替代 LLM。"""
    if step_id == "compile_character_roster":
        return {"characters": [
            {"name": "验证角色", "brief": "调查员", "relations": [{"target": "验证同伴", "relationship": "搭档"}]},
            {"name": "验证同伴", "brief": "记者", "relations": [{"target": "验证角色", "relationship": "搭档"}]}
        ]}
    if step_id == "compile_intro":
        return {"summary": "验证角色为调查异常事件而踏上旅程。", "tags": {"题材": "超自然/都市奇谭", "受众": "女频", "感情线": "单女主"}}
    if step_id == "compile_style":
        return {"行文风格": {"叙事节奏": "平稳", "语体色彩": "书面", "叙事语调": "克制", "描写风格": "简洁"}, "格式要求": {"人称视角": "第三人称", "句段长度": "中等", "心理呈现": "[]", "对话处理": "引号", "标点习惯": "常规"}, "手法偏好": {"表达方式": "叙述", "表现手法": "白描", "描写角度": "全知", "修辞手法": "少用"}, "词汇策略": {"称谓指代": "称呼", "雅俗取向": "雅", "情绪浓度": "中", "感官倾向": "视觉"}}
    if step_id == "generate_character":
        return {"name": fields.get("name"), "importance": "3", "gender": "女", "age": "20", "identity": "调查员", "personality": "冷静", "values": "真相", "appearance": "普通", "voice": "清冷", "ability": "观察", "timeline": "无"}
    if step_id == "compile_relation":
        return {"character_a": fields.get("character_a"), "character_b": fields.get("character_b"), "称呼": "搭档", "关系": "同伴", "情感": "信任", "共同经历": "查案", "当前态度": "合作"}
    if step_id == "compile_plot":
        return {"kind": "book", "protagonist": fields.get("protagonist") or "验证角色", "mainline": fields.get("mainline") or "调查异常事件", "volumes": []}
    if step_id == "compile_volume":
        return {"kind": "volume", "volume": fields.get("volume"), "protagonist": fields.get("protagonist") or "验证角色", "characters": "验证角色", "chapter_range": "第1章", "chapters": []}
    if step_id == "compile_ledger":
        return {"entries": []}
    if step_id == "compile_anchor":
        return {"chapter": fields.get("chapter"), "出场角色": [{"name": "验证角色", "purpose": "调查", "emotion": "冷静"}], "核心事件": "发现线索。", "信息边界": {"可揭示": "线索", "不可揭示": "来源", "揭示方式": "对话", "揭示者": "验证角色", "揭示位置": "现场"}, "伏笔": "旧照片", "钩子": "新日期"}
    if step_id == "compile_dialogue":
        return {"chapter": fields.get("chapter"), "dialogues": [{"character": "验证角色", "line": "流程验证通过。"}]}
    if step_id == "validate":
        return {"chapter": fields.get("chapter"), "word_count": 0, "semantic_checks": [{"item": "锚点落实", "result": "通过", "note": ""}], "conclusion": "通过", "issues": []}
    return {"ok": True}


def fake_extract(task: str, base: Path, data: dict[str, Any]) -> list[str]:
    """替代外部同人提取，仍验证任务路由、输入与项目内产物路径。"""
    source = base / "原著" / str(data["source"])
    if not source.exists():
        raise ValueError("原著文件不存在")
    names = {
        "text_stats": "原文统计.txt",
        "word_frequency": "高频词.txt",
        "style": "原文风格.md",
        "positive_vocabulary": "正向词库.md",
        "exclusive_vocabulary": "专属词库.md",
    }
    output = base / "提取" / names[task]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(f"# {names[task]}\n\n验证来源：{source.name}\n", encoding="utf-8")
    return [str(output.relative_to(base))]


def invoke(base: Path, task: str, payload: dict[str, Any]) -> list[str]:
    """经由引擎的字段解析与任务路由执行，确保不是绕过工作流的单元测试。"""
    fields = 工作流引擎.resolve_input(base, task, "structured", json.dumps(payload, ensure_ascii=False), "", True)
    return 工作流引擎.RUNNERS[TASK_MODULES[task]](task, base, fields)


def assert_outputs(base: Path, task: str, outputs: list[str]) -> None:
    if not outputs:
        raise AssertionError(f"{task} 没有返回产物")
    for relative in outputs:
        if relative in {"通过", "需修复"}:
            continue
        path = base / relative
        if not path.is_file():
            raise AssertionError(f"{task} 返回的产物不存在：{relative}")
        if relative.lower().endswith(".json") or task in 结构化JSON.TASK_JSON_SCHEMAS:
            continue
        errors = validate_format(task, path, path.read_text(encoding="utf-8"))
        if errors:
            raise AssertionError(f"{task} 产物未通过格式门禁：{'；'.join(errors)}")


def verify_supported_flow(base: Path) -> list[str]:
    """按规范顺序走同人提取、初始化、章节、校验和改写分支。"""
    records: list[str] = []
    calls = [
        # 同人提取分支；原创项目的 UI 会跳过这些任务。
        ("text_stats", {"source": "原著.txt"}),
        ("word_frequency", {"source": "原著.txt"}),
        ("style", {"source": "原著.txt"}),
        ("positive_vocabulary", {"source": "原著.txt"}),
        ("exclusive_vocabulary", {"source": "原著.txt"}),
        ("compile_intro", {"summary": "验证角色为调查异常事件而踏上旅程。", "tags": {"题材": "超自然/都市奇谭", "受众": "女频", "感情线": "单女主"}}),
        ("generate_worldview", {"genre": "悬疑", "premise": "验证用世界"}),
        ("compile_style", {"tone": "克制"}),
        ("compile_character_roster", {"characters": [{"name": "验证角色"}, {"name": "验证同伴"}]}),
        ("generate_characters_batch", {}),
        ("generate_relations_batch", {}),
        ("compile_plot", {"kind": "book", "protagonist": "验证角色", "mainline": "调查异常事件"}),
        ("compile_volume", {"volume": "第1卷：验证", "protagonist": "验证角色", "mainline": "完成流程验证"}),
        ("compile_ledger", {"entries": []}),
        ("compile_anchor", {"chapter": CHAPTER, "characters": ["验证角色（调查、冷静）"], "core_event": "验证角色发现关键线索。", "information_boundary": "不公开线索来源。", "foreshadowing": "旧照片", "hook": "照片背面出现新日期。"}),
        ("compile_config", {"chapter": CHAPTER, "person": "第三人称", "information": ["人物出场", "伏笔"]}),
        ("compile_dialogue", {"chapter": CHAPTER, "dialogues": [{"character": "验证角色", "line": "继续调查。"}]}),
        ("compile_snapshot", {"chapter": CHAPTER, "characters": ["验证角色"], "previous_ending": "无"}),
        ("generate_prose", {"chapter": CHAPTER}),
        ("validate", {"chapter": CHAPTER}),
        ("rewrite_prose", {"chapter": CHAPTER, "instruction": "保持事实，优化节奏。"}),
    ]
    for task, payload in calls:
        outputs = invoke(base, task, payload)
        assert_outputs(base, task, outputs)
        records.append(f"PASS {task}: {', '.join(outputs)}")
    return records


def verify_guards(base: Path) -> list[str]:
    records: list[str] = []
    try:
        invoke(base, "compile_anchor", {"chapter": CHAPTER, "characters": ["验证角色"]})
    except ValueError as error:
        if "core_event" not in str(error):
            raise AssertionError(f"锚点缺字段的错误信息不正确：{error}")
        records.append("PASS 锚点缺少 core_event 被拒绝")
    else:
        raise AssertionError("锚点缺少 core_event 仍被执行")
    try:
        invoke(base, "compile_config", {"chapter": CHAPTER, "person": "全知视角"})
    except ValueError:
        records.append("PASS 非法配置枚举被拒绝")
    else:
        raise AssertionError("非法配置枚举仍被接受")
    return records


def verify_spec_gap() -> str | None:
    """把规范中的“校验后资产更新”与当前可执行任务对照。"""
    update_tasks = [task for task in TASK_MODULES if "update" in task or "increment" in task]
    if update_tasks:
        return None
    return "规范要求校验后更新“{}”，但 TASK_MODULES 中没有资产增量更新任务。".format("、".join(REQUIRED_UPDATE_TARGETS))


def main() -> int:
    parser = argparse.ArgumentParser(description="小说工作台完整流程无模型验证")
    parser.add_argument("--strict-spec", action="store_true", help="将规范与实现不一致视为失败")
    args = parser.parse_args()
    project_name = f"原创-流程验证-{uuid.uuid4().hex[:8]}"
    base = PROJECTS_ROOT / project_name
    base.mkdir(parents=True, exist_ok=False)
    for folder in ("原著", "提取", "知识库/角色卡", "知识库/关系卡", "词汇库", "剧情/剧情卷", "提示词", "正文", "草稿", "运行记录"):
        (base / folder).mkdir(parents=True, exist_ok=True)
    (base / "原著" / "原著.txt").write_text("验证用原著文本。", encoding="utf-8")
    # 快照会读取这四类词库；放入最小资料以验证路径拼装。
    for name in ("人物词库.md", "对话词库.md", "通用词库.md", "禁用词库.md"):
        (base / "词汇库" / name).write_text(f"# {name[:-3]}\n", encoding="utf-8")

    try:
        with patch.dict(工作流引擎.RUNNERS, {"提取步骤": fake_extract}), patch.object(资产步骤, "generate_markdown", fixture), patch.object(章节步骤, "generate_markdown", fixture), patch.object(结构化JSON, "generate_json", side_effect=lambda **kwargs: json_fixture(kwargs.get("step_id", ""), kwargs.get("fields", {}))):
            records = verify_supported_flow(base) + verify_guards(base)
        for record in records:
            print(record)
        gap = verify_spec_gap()
        if gap:
            prefix = "FAIL" if args.strict_spec else "WARN"
            print(f"{prefix} 规范断层：{gap}")
            return 1 if args.strict_spec else 0
        print("PASS 规范与任务定义一致")
        return 0
    except Exception as error:
        print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    finally:
        shutil.rmtree(base, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
