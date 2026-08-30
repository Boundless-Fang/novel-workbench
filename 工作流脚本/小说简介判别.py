"""小说资料门禁：判别角色与剧情，并生成受控标签和短简介。"""
from __future__ import annotations

import argparse
import json
import re

from LLM配置 import _chat_completion, policy_for
from 共享 import project_dir


TAG_SCHEMA = {
    "题材": ["都市/现代", "玄幻/仙侠", "超自然/都市奇谭", "西方奇幻", "东方古代/架空历史", "武侠"],
    "受众": ["男频", "女频"],
    "感情线": ["多女主", "单女主", "无女主"],
}


def assess(project: str, content: str) -> dict[str, object]:
    text = content.strip()
    system = """你是小说工作台的简介输入判别器，不创作正文，不补写剧情。
判断输入是否同时具备：
1. 可识别的主角/核心角色名字；
2. 具体剧情或因果推进。

输入通过时，根据用户原意从受控词表选择最贴切的标签；用户无需自行填写标签。
只输出 JSON，格式：
{"has_character":true,"has_synopsis":true,"summary":"不超过100字、包含主角名的简介","tags":{"题材":"","受众":"","感情线":""},"missing":[]}
summary 只能压缩用户明确表达的内容，不得编造。missing 只能包含 character、synopsis。"""
    payload = {"user_input": text, "tag_schema": TAG_SCHEMA, "project": project}
    raw = _chat_completion(policy_for("compile_intro", "prepare"), [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
    try:
        value = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I))
    except json.JSONDecodeError as error:
        raise ValueError("简介判别模型没有返回合法 JSON") from error
    if not isinstance(value, dict):
        raise ValueError("简介判别模型返回格式错误")
    has_character = value.get("has_character") is True
    has_synopsis = value.get("has_synopsis") is True
    summary = str(value.get("summary") or "").strip()[:100] if has_character and has_synopsis else ""
    tags = value.get("tags") if isinstance(value.get("tags"), dict) else {}
    normalized = {key: str(tags.get(key) or "").strip() for key in TAG_SCHEMA}
    missing: list[str] = []
    if not has_character:
        missing.append("character")
    if not has_synopsis:
        missing.append("synopsis")
    if not summary and not missing:
        raise ValueError("简介判别模型没有返回可用简介")
    return {"has_character": has_character, "has_synopsis": has_synopsis, "summary": summary, "tags": normalized, "missing": missing}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--content", required=True)
    args = parser.parse_args()
    project_dir(args.project)  # 与其他工作流保持相同的项目名路径校验。
    print(json.dumps(assess(args.project, args.content), ensure_ascii=False))


if __name__ == "__main__":
    main()
