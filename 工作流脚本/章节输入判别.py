"""章节开始前的轻量信息判别：只判断，不生成任何正式文件。"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from LLM配置 import _chat_completion, get_llm_call_stats, parse_json_object, policy_for, set_llm_log_path
from 共享 import log_segment, project_dir


def known_characters(base: Path) -> list[str]:
    cards = base / "知识库" / "角色卡"
    if not cards.exists():
        return []
    names: list[str] = []
    for path in cards.glob("*.md"):
        name = re.sub(r"^角色卡[-：:]?", "", path.stem).strip()
        if name:
            names.append(name)
    return sorted(set(names))


def assess(base: Path, chapter: str, content: str) -> dict[str, object]:
    names = known_characters(base)
    system = """你是小说工作台的章节输入判别器，不创作、不补写剧情。
只判断用户的本章信息是否同时具备以下两个要素：
1. 至少一位已知出场角色：必须能与给出的已知角色名单匹配；未在名单中的新名字不算。
2. 剧情梗概：必须说明本章发生的具体事件或因果推进；只有情绪、氛围、写作要求或角色名单都不算。

只输出 JSON 对象，不要 Markdown 或解释。格式严格为：
{"has_known_character":true,"has_synopsis":true,"characters":["角色名（可附带目的、情绪）"],"core_event":"不超过100字的用户原意概括","missing":[]}

characters 只保留用户明确提到、且名单中存在的角色；不要虚构。core_event 只在 has_synopsis 为 true 时填写，否则为空。missing 只能包含 known_character、synopsis。"""
    payload = {"chapter": chapter, "known_characters": names, "user_input": content}
    raw = _chat_completion(policy_for("compile_anchor", "prepare"), [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
    try:
        result = parse_json_object(raw)
    except ValueError as error:
        raise ValueError("章节信息判别模型没有返回合法 JSON") from error
    if not isinstance(result, dict):
        raise ValueError("章节信息判别模型返回格式错误")
    has_character = result.get("has_known_character") is True
    has_synopsis = result.get("has_synopsis") is True
    characters = [str(item).strip() for item in result.get("characters", []) if str(item).strip()] if isinstance(result.get("characters"), list) else []
    core_event = str(result.get("core_event") or "").strip()[:100] if has_synopsis else ""
    missing = []
    if not has_character:
        missing.append("known_character")
    if not has_synopsis:
        missing.append("synopsis")
    return {"has_known_character": has_character, "has_synopsis": has_synopsis, "characters": characters, "core_event": core_event, "missing": missing}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--chapter", required=True)
    parser.add_argument("--content", default="")
    parser.add_argument("--content_file", default="", help="从文件读取本章信息（超长参数的 Windows 兜底）")
    args = parser.parse_args()
    content = Path(args.content_file).read_text(encoding="utf-8") if args.content_file else args.content
    base = project_dir(args.project)
    # 判别调用与正式步骤一样写入执行记录：放在本章的 jsonl，token 汇总才完整。
    set_llm_log_path(str(base / "运行记录" / "执行记录" / f"章节-{log_segment(args.chapter)}.jsonl"))
    result = assess(base, args.chapter, content.strip())
    print(json.dumps({**result, "usage": get_llm_call_stats()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
