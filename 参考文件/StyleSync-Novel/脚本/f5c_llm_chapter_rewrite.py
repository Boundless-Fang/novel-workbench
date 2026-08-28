import os

from core._core_cli_runner import HeadlessBaseTask, inject_env, safe_run_app
from core._core_config import PROJ_DIR
from core._core_llm import call_deepseek_api
from core._core_utils import atomic_write
from scripts.f5b_llm_novel_generation import NovelGenerationApp

inject_env()


def _join_sections(*parts: str) -> str:
    cleaned = [part.strip() for part in parts if part and part.strip()]
    return "\n\n".join(cleaned)


class ChapterRewriteApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass

    @staticmethod
    def _build_common_context(target_dir, chapter_name, chapter_outline, log_func):
        position_text, structure_text = NovelGenerationApp.parse_outline_layers(chapter_outline)
        explicit_characters = NovelGenerationApp.parse_character_names(position_text)

        world_settings = (
            NovelGenerationApp.read_file_safe(os.path.join(target_dir, "world_settings.md"))
            or "无详细世界观。"
        )
        style_summary = NovelGenerationApp.load_style_summary(target_dir)
        characters_info = NovelGenerationApp.get_filtered_characters(
            target_dir, explicit_characters, chapter_outline, log_func
        )

        content_dir = os.path.join(target_dir, "content")
        os.makedirs(content_dir, exist_ok=True)
        previous_context = NovelGenerationApp.get_previous_context(content_dir, chapter_name)

        rag_context_original, rag_context_project = NovelGenerationApp.build_rag_context(
            target_dir, f"{position_text}\n{structure_text}", log_func
        )
        return {
            "position_text": position_text,
            "structure_text": structure_text,
            "world_settings": world_settings,
            "style_summary": style_summary,
            "characters_info": characters_info,
            "previous_context": previous_context,
            "rag_context_original": rag_context_original,
            "rag_context_project": rag_context_project,
        }

    @staticmethod
    def _build_prompts(mode, context, prefix_text, suffix_text, selected_text):
        system_prompt = f"""你是一个专业的网络小说编辑助手。你的任务不是从零创作整章，而是在既有章节基础上执行局部改写。

你必须严格遵守以下规则：
1. 必须服从 f5a 生成的本章定位和本章结构，不允许擅自改写章节功能或越界推进到下一章。
2. 必须遵守世界观和角色卡，不允许人物明显 OOC，不允许违背底层设定。
3. 文风摘要只作为倾向性约束，不要机械堆砌术语。
4. 输出只能是“需要新生成的那一部分正文”，不要重复保留文本，不要输出解释、标题、标注、分隔线。
5. 与保留文本衔接必须自然，句式、语气和时态要连续。

[文风摘要]
{context["style_summary"]}

[世界观]
{context["world_settings"]}

[角色卡]
{context["characters_info"]}

[RAG - 原著相关片段]
{context["rag_context_original"]}

[RAG - 前文记忆片段]
{context["rag_context_project"]}
"""

        common_user_prompt = f"""[f5a 第一层：本章定位]
{context["position_text"] or "无明确本章定位，请严格依照已有文本语境谨慎改写。"}

[f5a 第二层：本章结构]
{context["structure_text"] or "无明确本章结构，请尽量保持本章现有结构意图。"}

[上一章结尾原文（允许为空）]
{context["previous_context"] or "无上一章结尾原文。"}
"""

        if mode == "prefix":
            user_prompt = f"""{common_user_prompt}

[保留开头原文]
{prefix_text or "无保留开头。"}

[原始待重写后文（仅供参考，可重组，不要照抄）]
{selected_text or "无原始后文参考。"}

任务要求：
1. 紧接“保留开头原文”续写后文。
2. 输出内容不要重复“保留开头原文”。
3. 允许重构后续段落，但必须和保留开头自然衔接。
4. 直接输出新正文。
"""
        else:
            user_prompt = f"""{common_user_prompt}

[保留前缀原文]
{prefix_text or "无保留前缀。"}

[原始待重写中间段（仅供参考，可重组，不要照抄）]
{selected_text or "无原始中间段参考。"}

[保留后缀原文]
{suffix_text or "无保留后缀。"}

任务要求：
1. 在“保留前缀原文”和“保留后缀原文”之间补写新的中间正文。
2. 输出内容不要重复前缀或后缀原文。
3. 新中间段必须同时自然承接前缀，并自然过渡到后缀。
4. 直接输出新正文。
"""

        return system_prompt, user_prompt

    @staticmethod
    def execute_rewrite_preview(
        project_name,
        chapter_name,
        mode,
        original_content,
        prefix_text,
        suffix_text,
        selected_text,
        model,
        thinking,
        reasoning_effort,
        log_func,
    ):
        target_dir = os.path.join(PROJ_DIR, project_name)
        if not os.path.exists(target_dir):
            raise ValueError(f"未找到项目目录: {target_dir}")

        outline_path = os.path.join(target_dir, "chapter_structures", f"{chapter_name}_outline.md")
        chapter_outline = NovelGenerationApp.read_file_safe(outline_path)
        if not chapter_outline:
            raise ValueError(f"未找到本章大纲文件: {outline_path}，请先执行 f5a。")

        context = ChapterRewriteApp._build_common_context(target_dir, chapter_name, chapter_outline, log_func)
        system_prompt, user_prompt = ChapterRewriteApp._build_prompts(
            mode, context, prefix_text, suffix_text, selected_text
        )

        log_func("正在生成 f5c 改写预览...")
        generated_text = call_deepseek_api(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            temperature=0.5,
            thinking=thinking,
            reasoning_effort=reasoning_effort,
        ).strip()

        if mode == "prefix":
            preview_content = _join_sections(prefix_text, generated_text)
        else:
            preview_content = _join_sections(prefix_text, generated_text, suffix_text)

        prompt_dir = os.path.join(target_dir, "chapter_specific_prompts")
        os.makedirs(prompt_dir, exist_ok=True)
        prompt_path = os.path.join(prompt_dir, f"prompt_{chapter_name}_f5c_{mode}.txt")
        prompt_content = (
            f"=== Original Content ===\n{original_content}\n\n"
            f"=== System Prompt ===\n{system_prompt}\n\n=== User Prompt ===\n{user_prompt}\n"
        )
        atomic_write(prompt_path, prompt_content, data_type="text")

        return {
            "status": "success",
            "mode": mode,
            "preview_content": preview_content,
            "generated_content": generated_text,
            "prompt_path": prompt_path,
        }


def run_headless(
    project_name,
    chapter_name,
    mode="prefix",
    original_content="",
    prefix_text="",
    suffix_text="",
    selected_text="",
    model="deepseek-v4-flash",
):
    import sys

    if not project_name or not chapter_name:
        sys.exit(1)

    result = ChapterRewriteApp.execute_rewrite_preview(
        project_name=project_name,
        chapter_name=chapter_name,
        mode=mode,
        original_content=original_content,
        prefix_text=prefix_text,
        suffix_text=suffix_text,
        selected_text=selected_text,
        model=model,
        log_func=lambda msg: print(msg, flush=True),
    )
    if not result.get("preview_content"):
        sys.exit(1)


if __name__ == "__main__":
    safe_run_app(
        app_class=ChapterRewriteApp,
        headless_func=run_headless,
        project_name="",
        chapter_name="",
        mode="prefix",
        original_content="",
        prefix_text="",
        suffix_text="",
        selected_text="",
        model="",
    )
