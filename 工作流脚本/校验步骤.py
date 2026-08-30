"""正文验收：由指定 LLM 根据项目上下文做语义一致性检查。"""
from __future__ import annotations
from pathlib import Path
from typing import Any
from 共享 import chapter_asset, context, fail, read_text, safe_name, worldview_path
import 结构化JSON

def run(task: str, base: Path, data: dict[str, Any]) -> list[str]:
    if not data.get("chapter"):
        fail("校验缺少章节名")
    chapter = safe_name(data["chapter"], "章节名"); prose = base / "正文" / f"{chapter}.txt"
    content = read_text(prose)
    payload = {"chapter": chapter, "word_count": len(content)}
    ctx = context(base, [prose, chapter_asset(base, chapter, "强制设定锚点.md"), worldview_path(base), base / "知识库" / "语言风格.md"])
    return 结构化JSON.run(task, base, payload, ctx)
