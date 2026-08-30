"""唯一命令入口：解析两种输入、检查字段、调度真实步骤模块、记录失败。"""
from __future__ import annotations
import argparse, json
from datetime import datetime
from pathlib import Path
from typing import Any
from LLM配置 import get_llm_call_stats, input_to_fields, set_llm_log_path
from 共享 import fail, project_dir
from 步骤定义 import STEP_INPUTS, TASK_MODULES
import 资产步骤, 章节步骤, 提取步骤, 校验步骤, 世界观JSON, 结构化JSON

RUNNERS = {"资产步骤": 资产步骤.run, "章节步骤": 章节步骤.run, "提取步骤": 提取步骤.run, "校验步骤": 校验步骤.run, "世界观JSON": 世界观JSON.run, "结构化JSON": 结构化JSON.run_engine}

# 这些任务直接把自然语言/补充信息交给生成模型，不再先做一次“输入整理”LLM 调用。
DIRECT_GENERATION_TASKS = set(结构化JSON.TASK_JSON_SCHEMAS.keys()) | {"generate_worldview_json", "generate_characters_batch", "generate_relations_batch", "compile_snapshot"}
def _payload(raw: str) -> dict[str, Any]:
    try: value = json.loads(raw or "{}")
    except json.JSONDecodeError as error: fail(f"script_input 不是合法 JSON：{error.msg}")
    if not isinstance(value, dict): fail("script_input 必须是 JSON 对象")
    return value
def _has(value: Any) -> bool: return value not in (None, "", [], {})
def _record_missing(base: Path, task: str, source: str, fields: dict[str, Any], missing: list[str]) -> None:
    path = base / "运行记录" / "待补充" / f"{task}.json"; path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"task":task, "created_at":datetime.now().isoformat(), "source":source, "parsed_fields":fields, "missing_fields":missing, "status":"needs_input"}, ensure_ascii=False, indent=2), encoding="utf-8")
def resolve_input(base: Path, task: str, mode: str, structured: str, natural: str, complete: bool) -> dict[str, Any]:
    definition = STEP_INPUTS.get(task)
    if not definition: fail("未知流程任务：" + task)
    if task in DIRECT_GENERATION_TASKS:
        if mode == "natural":
            if not natural.strip(): fail("自然语言输入不能为空")
            return {"user_input": natural.strip(), "user_supplement": ""}
        fields = _payload(structured)
        if complete:
            source = "structured_complete"
        else:
            supplement = str(fields.get("user_supplement") or "").strip()
            result: dict[str, Any] = {"user_input": fields, "user_supplement": supplement}
            for key in ("chapter", "name", "character_a", "character_b", "volume", "kind", "characters", "previous_ending"):
                if _has(fields.get(key)):
                    result[key] = fields[key]
            return result
    elif mode == "natural":
        if not natural.strip(): fail("自然语言输入不能为空")
        fields, source = input_to_fields(step_id=task, user_input=natural.strip(), input_kind="natural", schema_hint=definition, project_hint=base.name), "natural"
    elif mode == "structured":
        fields, source = _payload(structured), "structured_complete" if complete else "structured_incomplete"
        if not complete:
            supplement = str(fields.get("user_supplement") or "").strip()
            fields = input_to_fields(step_id=task, user_input=fields, input_kind=source, schema_hint=definition, project_hint=base.name)
            if supplement:
                fields["user_supplement"] = supplement
    else: fail("input_mode 只能是 natural 或 structured")
    missing = [key for key in definition["required"] if not _has(fields.get(key))]
    if missing: _record_missing(base, task, source, fields, missing); fail("当前步骤缺少字段：" + "、".join(missing))
    return fields
CHAPTER_TASKS = {"compile_anchor", "compile_config", "compile_dialogue", "compile_snapshot", "generate_prose", "rewrite_prose", "validate"}
def _safe_segment(value: Any) -> str:
    import re
    return re.sub(r'[\\/:*?"<>|]', '_', str(value or "").strip()) or "未知"

def main() -> None:
    parser = argparse.ArgumentParser(description="小说工作台工作流引擎")
    parser.add_argument("--task", required=True); parser.add_argument("--project", required=True)
    parser.add_argument("--input_mode", default="structured", choices=["natural", "structured"]); parser.add_argument("--input", default="{}")
    parser.add_argument("--natural_input", default=""); parser.add_argument("--input_complete", action="store_true")
    args = parser.parse_args(); base = project_dir(args.project)
    exec_dir = base / "运行记录" / "执行记录"
    if args.task in CHAPTER_TASKS:
        try: raw_input = json.loads(args.input or "{}") if args.input else {}
        except json.JSONDecodeError: raw_input = {}
        chapter = raw_input.get("chapter") or ""
        log_name = f"章节-{_safe_segment(chapter)}.jsonl"
    else:
        log_name = "初始化.jsonl"
    set_llm_log_path(str(exec_dir / log_name))
    data = resolve_input(base, args.task, args.input_mode, args.input, args.natural_input, args.input_complete)
    module = TASK_MODULES.get(args.task)
    if not module: fail("未知流程任务：" + args.task)
    outputs = RUNNERS[module](args.task, base, data)
    usage = get_llm_call_stats()
    print(json.dumps({"ok": True, "outputs": outputs, "usage": usage}, ensure_ascii=False))
if __name__ == "__main__":
    try: main()
    except Exception as error: print(json.dumps({"ok":False, "error":str(error), "usage": get_llm_call_stats()}, ensure_ascii=False), file=__import__("sys").stderr); raise SystemExit(1)
