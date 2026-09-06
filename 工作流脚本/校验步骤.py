"""正文验收：由指定 LLM 根据项目上下文做语义一致性检查。"""
from __future__ import annotations
from pathlib import Path
from typing import Any
from 共享 import asset_cards, chapter_asset, chapter_prose, context, fail, read_text, safe_name, worldview_path
import 结构化JSON

def run(task: str, base: Path, data: dict[str, Any]) -> list[str]:
    if not data.get("chapter"):
        fail("校验缺少章节名")
    chapter = safe_name(data["chapter"], "章节名"); prose = chapter_prose(base, chapter)
    content = read_text(prose)
    if not content: fail(f"正文不存在或为空，无法校验：{prose.relative_to(base)}")
    cards, relations = asset_cards(base)
    # 字数按去空白后的字符数统计，换行和缩进不计入。
    payload = {"chapter": chapter, "word_count": len("".join(content.split()))}
    ctx = context(base, [prose, chapter_asset(base, chapter, "强制设定锚点.md"), chapter_asset(base, chapter, "配置.md"), chapter_asset(base, chapter, "台词.md"), chapter_asset(base, chapter, "最终提示词快照.md"), worldview_path(base), *cards, *relations, base / "知识库" / "语言风格.md"])
    return 结构化JSON.run(task, base, payload, ctx)
