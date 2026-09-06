import json
import os

import numpy as np

from core._core_cli_runner import HeadlessBaseTask, inject_env, safe_run_app
from core._core_config import PROJ_DIR
from core._core_llm import call_deepseek_api_json_object
from core._core_rag import RAGRetriever
from core._core_utils import atomic_write, smart_read_text

inject_env()

EVENT_STAGE_OPTIONS = ["无指定", "事件开端", "事件推进", "事件高潮", "事件收束", "日常", "单章事件"]
NOVEL_STAGE_OPTIONS = ["无指定", "前期", "中期", "后期"]
CHAPTER_FUNCTION_OPTIONS = [
    "主线推进",
    "引出人物",
    "前情回顾",
    "角色互动",
    "打斗对抗",
    "身份揭示",
    "埋下伏笔",
    "回收伏笔",
    "设定展开",
    "情绪过渡",
]
PERSON_OPTIONS = ["无指定", "第一人称", "有限制第三人称", "无限制第三人称"]
PERSPECTIVE_OPTIONS = ["无指定", "男主视角", "女主视角", "中立视角"]
SCENE_SWITCH_OPTIONS = ["无指定", "无", "一次", "多次"]
PACE_OPTIONS = ["无指定", "慢", "中", "快"]
NARRATIVE_OPTIONS = ["无指定", "顺叙", "倒叙", "插叙", "补叙", "分叙"]
DEPICTION_OPTIONS = ["对话与互动", "叙事与动作", "反应与侧写", "解释与说明", "环境与外貌"]
DRIVE_OPTIONS = ["无指定", "场景", "动作", "对话", "反应", "说明", "心理", "外貌"]
REVEAL_OPTIONS = ["无指定", "无", "直接揭示", "延迟揭示", "假设揭示", "对话中带出", "他人反应带出"]

F5A_OUTLINE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "position": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "event_stage": {"type": "string", "enum": EVENT_STAGE_OPTIONS[1:]},
                "novel_stage": {"type": "string", "enum": NOVEL_STAGE_OPTIONS[1:]},
                "chapter_functions": {
                    "type": "array",
                    "items": {"type": "string", "enum": CHAPTER_FUNCTION_OPTIONS},
                    "minItems": 1,
                    "maxItems": 3,
                },
                "chapter_brief": {"type": "string"},
                "chapter_boundary": {"type": "string"},
                "person": {"type": "string", "enum": PERSON_OPTIONS[1:]},
                "perspective": {"type": "string", "enum": PERSPECTIVE_OPTIONS[1:]},
                "characters": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "target_words": {"type": "string"},
                "scene_switch": {"type": "string", "enum": SCENE_SWITCH_OPTIONS[1:]},
                "narrative": {"type": "string", "enum": NARRATIVE_OPTIONS[1:]},
                "pace": {"type": "string", "enum": PACE_OPTIONS[1:]},
                "ban": {"type": "string"},
            },
            "required": [
                "event_stage",
                "novel_stage",
                "chapter_functions",
                "chapter_brief",
                "chapter_boundary",
                "person",
                "perspective",
                "characters",
                "target_words",
                "scene_switch",
                "narrative",
                "pace",
                "ban",
            ],
        },
        "structure": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "opening": {"$ref": "#/$defs/stage"},
                "buildup": {"$ref": "#/$defs/stage"},
                "climax": {"$ref": "#/$defs/stage"},
                "ending": {"$ref": "#/$defs/stage"},
            },
            "required": ["opening", "buildup", "climax", "ending"],
        },
    },
    "required": ["position", "structure"],
    "$defs": {
        "stage": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "content": {"type": "string"},
                "ban": {"type": "string"},
                "narrative": {"type": "string", "enum": NARRATIVE_OPTIONS[1:]},
                "depiction": {
                    "type": "array",
                    "items": {"type": "string", "enum": DEPICTION_OPTIONS},
                    "minItems": 1,
                    "maxItems": 3,
                },
                "drive": {"type": "string", "enum": DRIVE_OPTIONS[1:]},
                "word_ratio": {"type": "string"},
                "reveal": {"type": "string", "enum": REVEAL_OPTIONS[1:]},
                "foreshadowing": {"type": "string"},
            },
            "required": [
                "content",
                "ban",
                "narrative",
                "depiction",
                "drive",
                "word_ratio",
                "reveal",
                "foreshadowing",
            ],
        }
    },
}


class ChapterOutlineApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass

    @staticmethod
    def read_file_safe(filepath, max_len=None):
        if os.path.exists(filepath):
            try:
                return smart_read_text(filepath, max_len=max_len)
            except Exception:
                return ""
        return ""

    @staticmethod
    def create_default_stage():
        return {
            "content": "",
            "ban": "无指定",
            "narrative": "无指定",
            "depiction": [],
            "drive": "无指定",
            "word_ratio": "",
            "reveal": "无指定",
            "foreshadowing": "无指定",
        }

    @staticmethod
    def normalize_stage(stage):
        data = dict(stage or {})
        depiction = data.get("depiction") or []
        if not isinstance(depiction, list):
            depiction = [depiction]
        return {
            "content": str(data.get("content") or "").strip(),
            "ban": str(data.get("ban") or "无指定").strip() or "无指定",
            "narrative": str(data.get("narrative") or "无指定").strip() or "无指定",
            "depiction": [str(item).strip() for item in depiction if str(item).strip()],
            "drive": str(data.get("drive") or "无指定").strip() or "无指定",
            "word_ratio": str(data.get("word_ratio") or "").strip(),
            "reveal": str(data.get("reveal") or "无指定").strip() or "无指定",
            "foreshadowing": str(data.get("foreshadowing") or "无指定").strip() or "无指定",
        }

    @staticmethod
    def normalize_outline_payload(chapter_payload):
        if isinstance(chapter_payload, dict):
            data = dict(chapter_payload)
        else:
            text = str(chapter_payload).strip()
            data = {"chapter_brief": text, "brief": text}

        brief = str(
            data.get("chapter_brief")
            or data.get("brief")
            or data.get("summary")
            or ""
        ).strip()

        structure = data.get("structure") or {}
        return {
            "raw": data,
            "brief": brief or "无明确梗概，请根据系统输入谨慎生成本章骨架。",
            "boundary": str(
                data.get("chapter_boundary")
                or data.get("boundary")
                or "未提供明确边界，默认停在本章核心事件完成后的首个自然悬停点。"
            ).strip(),
            "stage": str(data.get("event_stage") or data.get("stage") or "无指定").strip(),
            "novel_stage": str(data.get("novel_stage") or "无指定").strip(),
            "functions": data.get("chapter_functions") or data.get("functions") or [],
            "person": str(data.get("person") or "无指定").strip(),
            "perspective": str(data.get("perspective") or "无指定").strip(),
            "characters": data.get("characters") or data.get("cast") or [],
            "target_words": str(data.get("target_words") or data.get("word_count") or "3000字左右").strip(),
            "scene_switch": str(data.get("scene_switch") or "无指定").strip(),
            "narrative": str(data.get("narrative") or data.get("narrative_mode") or "无指定").strip(),
            "pace": str(data.get("pace") or data.get("narrative_pace") or "无指定").strip(),
            "ban": str(data.get("ban") or data.get("forbidden") or data.get("chapter_ban") or "无指定").strip(),
            "structure": {
                "opening": ChapterOutlineApp.normalize_stage(structure.get("opening")),
                "buildup": ChapterOutlineApp.normalize_stage(structure.get("buildup")),
                "climax": ChapterOutlineApp.normalize_stage(structure.get("climax")),
                "ending": ChapterOutlineApp.normalize_stage(structure.get("ending")),
            },
        }

    @staticmethod
    def format_choice_list(value, default="无指定"):
        if isinstance(value, (list, tuple, set)):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return " / ".join(cleaned) if cleaned else default
        text = str(value).strip()
        return text or default

    @staticmethod
    def _pick_enum(value, options, fallback):
        cleaned = str(value or "").strip()
        return cleaned if cleaned in options else fallback

    @staticmethod
    def _pick_multi(value, options):
        cleaned = [str(item).strip() for item in (value or []) if str(item).strip() in options]
        deduped = []
        for item in cleaned:
            if item not in deduped:
                deduped.append(item)
        return deduped

    @staticmethod
    def normalize_llm_outline(result):
        position = dict(result.get("position") or {})
        structure = dict(result.get("structure") or {})

        def normalize_stage_result(stage_data):
            stage = ChapterOutlineApp.normalize_stage(stage_data)
            stage["narrative"] = ChapterOutlineApp._pick_enum(stage["narrative"], NARRATIVE_OPTIONS[1:], "顺叙")
            stage["depiction"] = ChapterOutlineApp._pick_multi(stage["depiction"], DEPICTION_OPTIONS)[:3] or ["叙事与动作"]
            stage["drive"] = ChapterOutlineApp._pick_enum(stage["drive"], DRIVE_OPTIONS[1:], "场景")
            stage["reveal"] = ChapterOutlineApp._pick_enum(stage["reveal"], REVEAL_OPTIONS[1:], "无")
            if stage["ban"] == "无指定":
                stage["ban"] = "无"
            if stage["foreshadowing"] == "无指定":
                stage["foreshadowing"] = "无"
            return stage

        normalized = {
            "position": {
                "event_stage": ChapterOutlineApp._pick_enum(position.get("event_stage"), EVENT_STAGE_OPTIONS[1:], "事件推进"),
                "novel_stage": ChapterOutlineApp._pick_enum(position.get("novel_stage"), NOVEL_STAGE_OPTIONS[1:], "中期"),
                "chapter_functions": ChapterOutlineApp._pick_multi(position.get("chapter_functions"), CHAPTER_FUNCTION_OPTIONS)[:3] or ["主线推进"],
                "chapter_brief": str(position.get("chapter_brief") or "").strip() or "本章围绕核心事件推进，并在自然收束处停住。",
                "chapter_boundary": str(position.get("chapter_boundary") or "").strip() or "停在本章核心事件完成后的首个自然悬停点。",
                "person": ChapterOutlineApp._pick_enum(position.get("person"), PERSON_OPTIONS[1:], "有限制第三人称"),
                "perspective": ChapterOutlineApp._pick_enum(position.get("perspective"), PERSPECTIVE_OPTIONS[1:], "中立视角"),
                "characters": [str(item).strip() for item in (position.get("characters") or []) if str(item).strip()],
                "target_words": str(position.get("target_words") or "").strip() or "3000字左右",
                "scene_switch": ChapterOutlineApp._pick_enum(position.get("scene_switch"), SCENE_SWITCH_OPTIONS[1:], "一次"),
                "narrative": ChapterOutlineApp._pick_enum(position.get("narrative"), NARRATIVE_OPTIONS[1:], "顺叙"),
                "pace": ChapterOutlineApp._pick_enum(position.get("pace"), PACE_OPTIONS[1:], "中"),
                "ban": str(position.get("ban") or "").strip() or "无",
            },
            "structure": {
                "opening": normalize_stage_result(structure.get("opening")),
                "buildup": normalize_stage_result(structure.get("buildup")),
                "climax": normalize_stage_result(structure.get("climax")),
                "ending": normalize_stage_result(structure.get("ending")),
            },
        }
        return normalized

    @staticmethod
    def render_markdown_outline(outline):
        position = outline["position"]
        structure = outline["structure"]

        stage_blocks = [
            ("1. 开端 / 承接", structure["opening"]),
            ("2. 铺垫 / 延展", structure["buildup"]),
            ("3. 高潮 / 爽点", structure["climax"]),
            ("4. 钩子 / 结尾", structure["ending"]),
        ]

        lines = [
            "# 第一层：本章定位",
            f"- 所处阶段：{position['event_stage']}",
            f"- 小说位置：{position['novel_stage']}",
            f"- 本章功能：{ChapterOutlineApp.format_choice_list(position['chapter_functions'])}",
            f"- 本章梗概：{position['chapter_brief']}",
            f"- 本章边界：{position['chapter_boundary']}",
            f"- 人称：{position['person']}",
            f"- 视角：{position['perspective']}",
            f"- 出场角色：{ChapterOutlineApp.format_choice_list(position['characters'], default='无明确角色')}",
            f"- 字数：{position['target_words']}",
            f"- 场景切换：{position['scene_switch']}",
            f"- 叙事方式：{position['narrative']}",
            f"- 叙事节奏：{position['pace']}",
            f"- 本章禁止事项：{position['ban']}",
            "",
            "# 第二层：本章结构",
            "",
        ]

        for title, stage in stage_blocks:
            lines.extend(
                [
                    f"## {title}",
                    f"- 本章内容：{stage['content'] or '未指定'}",
                    f"- 禁止事项：{stage['ban']}",
                    f"- 叙述手法：{stage['narrative']}",
                    f"- 描写手法：{ChapterOutlineApp.format_choice_list(stage['depiction'])}",
                    f"- 推进方式：{stage['drive']}",
                    f"- 字数占比：{stage['word_ratio'] or '未指定'}",
                    f"- 信息揭示：{stage['reveal']}",
                    f"- 伏笔/铺垫：{stage['foreshadowing']}",
                    "",
                ]
            )

        return "\n".join(lines).strip() + "\n"

    @staticmethod
    def get_filtered_characters(target_dir, chapter_data, log_func):
        char_dir = os.path.join(target_dir, "character_profiles")
        if not os.path.exists(char_dir):
            return "无相关角色卡数据。"

        scan_text = "\n".join(
            [
                chapter_data["brief"],
                ChapterOutlineApp.format_choice_list(chapter_data["characters"], default=""),
            ]
        )
        all_char_files = [f for f in os.listdir(char_dir) if f.endswith(".md")]
        relevant_texts = []
        found_names = []

        explicit_characters = [str(item).strip() for item in chapter_data["characters"] if str(item).strip()]
        for f_name in all_char_files:
            char_name_base = os.path.splitext(f_name)[0]
            matched = char_name_base in explicit_characters or char_name_base in scan_text
            if matched:
                content = ChapterOutlineApp.read_file_safe(os.path.join(char_dir, f_name))
                if content:
                    relevant_texts.append(content)
                    found_names.append(char_name_base)

        if not relevant_texts:
            log_func("[INFO] 未检测到明确出场角色，f5a 将只依据世界观与剧情压缩信息生成大纲。")
            return "本章未匹配到明确角色卡，可仅依据世界观与剧情压缩信息生成。"

        log_func(f"[INFO] f5a 已注入角色卡: {', '.join(found_names)}")
        return "\n\n---\n\n".join(relevant_texts)

    @staticmethod
    def retrieve_context(index_path, chunks_path, retriever, query_vec, k_limit):
        try:
            index, chunks = retriever.load_index(index_path, chunks_path)
            distances, indices = index.search(np.array(query_vec).astype("float32"), k=k_limit)
            retrieved_data = []
            for idx in indices[0]:
                if idx != -1 and idx < len(chunks):
                    chunk_item = chunks[idx]
                    if isinstance(chunk_item, dict):
                        retrieved_data.append(
                            chunk_item.get("summary", chunk_item.get("raw_chunk", chunk_item.get("text", "")))
                        )
                    else:
                        retrieved_data.append(chunk_item)
            return retrieved_data
        except Exception:
            return []

    @staticmethod
    def render_stage_reference(title, stage_data):
        depiction = ChapterOutlineApp.format_choice_list(stage_data["depiction"], default="未指定")
        return (
            f"## {title}\n"
            f"- 本章内容：{stage_data['content'] or '未指定'}\n"
            f"- 禁止事项：{stage_data['ban']}\n"
            f"- 叙述手法：{stage_data['narrative']}\n"
            f"- 描写手法：{depiction}\n"
            f"- 推进方式：{stage_data['drive']}\n"
            f"- 字数占比：{stage_data['word_ratio'] or '未指定'}\n"
            f"- 信息揭示：{stage_data['reveal']}\n"
            f"- 伏笔/铺垫：{stage_data['foreshadowing']}\n"
        )

    @staticmethod
    def execute_generation(project_name, chapter_payload, chapter_name, model, log_func):
        target_dir = os.path.join(PROJ_DIR, project_name)
        if not os.path.exists(target_dir):
            log_func(f"[ERROR] 未找到项目目录: {target_dir}")
            return False

        outlines_dir = os.path.join(target_dir, "chapter_structures")
        os.makedirs(outlines_dir, exist_ok=True)
        save_path = os.path.join(outlines_dir, f"{chapter_name}_outline.md")
        chapter_data = ChapterOutlineApp.normalize_outline_payload(chapter_payload)

        world_settings = ChapterOutlineApp.read_file_safe(os.path.join(target_dir, "world_settings.md")) or "无详细世界观。"
        characters_info = ChapterOutlineApp.get_filtered_characters(target_dir, chapter_data, log_func)
        plot_outline_summary = (
            ChapterOutlineApp.read_file_safe(os.path.join(target_dir, "plot_outlines.md"), max_len=4000)
            or "无剧情压缩结果，可在缺失时正常运行。"
        )

        rag_context_original = "无原著背景库参考。"
        rag_context_project = "无前文剧情记忆。"
        try:
            retriever = RAGRetriever()
            embedder = retriever.get_embedder()
            query_vec = embedder.encode([chapter_data["brief"]])

            hierarchical_db = os.path.join(target_dir, "hierarchical_rag_db")
            if os.path.exists(hierarchical_db):
                idx_path = os.path.join(hierarchical_db, "plot_summary.index")
                map_path = os.path.join(hierarchical_db, "summary_to_raw_mapping.json")
                res = ChapterOutlineApp.retrieve_context(idx_path, map_path, retriever, query_vec, k_limit=2)
                if res:
                    rag_context_original = "\n\n".join(res)

            context_db = os.path.join(target_dir, "context_rag_db")
            if os.path.exists(context_db):
                idx_path = os.path.join(context_db, "vector.index")
                map_path = os.path.join(context_db, "chunks.json")
                res = ChapterOutlineApp.retrieve_context(idx_path, map_path, retriever, query_vec, k_limit=4)
                if res:
                    rag_context_project = "\n\n---\n\n".join(res)
        except Exception as e:
            log_func(f"[WARN] f5a 检索参考片段失败，已降级继续: {e}")

        structure_reference = "\n".join(
            [
                ChapterOutlineApp.render_stage_reference("1. 开端 / 承接", chapter_data["structure"]["opening"]),
                ChapterOutlineApp.render_stage_reference("2. 铺垫 / 延展", chapter_data["structure"]["buildup"]),
                ChapterOutlineApp.render_stage_reference("3. 高潮 / 爽点", chapter_data["structure"]["climax"]),
                ChapterOutlineApp.render_stage_reference("4. 钩子 / 结尾", chapter_data["structure"]["ending"]),
            ]
        )

        sys_prompt = """你是一个专业的长篇小说章节策划助手。你的任务不是直接写正文，而是基于系统提供的背景信息与用户提供的本章意图，生成一份“可执行的章节大纲骨架”，供后续正文生成模块使用。

你的职责是：
1. 先判断并明确本章在整卷/整本书中的位置与功能。
2. 再根据本章功能与用户意图，设计本章的内部结构。
3. 输出清晰、可执行、可直接交给正文生成模块使用的章节骨架。

你必须遵守以下总规则：

【规则一：本章定位优先】
第一层“本章定位”优先级高于第二层“本章结构”。如果两者冲突，必须以“本章定位”为准。

【规则二：阶段强度允许浮动】
“高潮 / 爽点”“钩子 / 结尾”是结构槽位，不代表每章都必须强烈爆发。
如果本章不适合出现明显高潮或强钩子，可以弱化该阶段，但不能缺失结构上的收束、转接或后续牵引作用。

【规则三：禁止擅自越界】
必须严格停在用户给定的本章边界内。
禁止擅自推进到下一章应承担的关键剧情。
禁止引入用户未授权的重要新设定、关键新人物或重大剧情结果。
禁止让人物行为明显违背既有设定。

【规则四：结构优先于信息堆砌】
你生成的是章节骨架，不是总结报告，也不是策划汇报。
不要只罗列信息点，必须体现本章展开顺序、信息显露顺序、冲突推进顺序和收尾方式。

【规则五：选项约束】
所有枚举字段必须严格从候选项中选择，不得自造类别，不得改写选项名称。

【规则六：输出格式】
你必须只输出符合给定 JSON Schema 的 JSON 对象。
不要输出 Markdown，不要输出解释、寒暄、分析过程、提示词说明或任何额外备注。"""

        user_input = f"""请根据以下信息，为本章生成一份“可执行的章节大纲骨架”。

默认所有带固定选项的字段只能从选项中选择。只有标注“（允许发挥）”的字段允许自由填写。

---
# 系统输入（背景信息）

## 世界观
{world_settings}

## 角色信息卡
{characters_info}

## f4b 剧情压缩结果 / 摘要结果（如果为空允许正常运行）
{plot_outline_summary}

## 相关片段（少量 RAG 片段）
[原著参考片段]
{rag_context_original}

[前文记忆片段]
{rag_context_project}

---
# 用户输入（本章意图）

## 本章梗概
{chapter_data["brief"]}

## 本章边界
{chapter_data["boundary"]}

---
# 参考定位（如果用户未完整提供，可结合系统输入补全，但枚举项仍只能从给定选项中选择）
- 所处阶段：{chapter_data["stage"]}
- 小说位置：{chapter_data["novel_stage"]}
- 本章功能：{ChapterOutlineApp.format_choice_list(chapter_data["functions"])}
- 人称：{chapter_data["person"]}
- 视角：{chapter_data["perspective"]}
- 出场角色：{ChapterOutlineApp.format_choice_list(chapter_data["characters"])}
- 字数：{chapter_data["target_words"]}
- 场景切换：{chapter_data["scene_switch"]}
- 叙事方式：{chapter_data["narrative"]}
- 叙事节奏：{chapter_data["pace"]}
- 本章禁止事项：{chapter_data["ban"]}

---
# 参考结构偏好（如用户未填写，则由你结合本章定位自行补全）
{structure_reference}

---
# JSON 输出要求
1. 必须输出一个 JSON 对象，顶层包含 position 和 structure 两个字段。
2. 枚举字段必须从候选项里严格选择。
3. 当用户填写“无指定”或未提供信息时，你需要结合背景信息自动补全为最合理的选项，而不是返回“无指定”。
4. 字段内容要尽量具体、可执行，便于后续正文生成直接使用。

---
# 额外要求
1. 不要把所有阶段写得同样饱满，本章定位决定结构强弱。
2. 如果本章是推进、过渡、互动、铺垫类章节，高潮和钩子可以弱化，但不能缺失结构功能。
3. 如果本章是高潮、揭示、对抗类章节，则必须保证高潮或揭示真正发生，而不是停留在空泛铺陈。
4. 外貌描写、身份介绍、设定说明优先自然嵌入场景、动作、对话、反应中。
5. 大纲必须可执行，能够直接交给正文生成模块使用。"""

        json_contract = f"""

---
# JSON 输出硬约束
1. 只输出一个合法 JSON 对象，不要输出 Markdown，不要输出解释，不要输出代码块。
2. 顶层必须包含 `position` 和 `structure` 两个键。
3. `position` 必须包含这些键：
`event_stage`, `novel_stage`, `chapter_functions`, `chapter_brief`, `chapter_boundary`, `person`, `perspective`, `characters`, `target_words`, `scene_switch`, `narrative`, `pace`, `ban`
4. `structure` 必须包含这些键：
`opening`, `buildup`, `climax`, `ending`
5. 每个阶段对象必须包含这些键：
`content`, `ban`, `narrative`, `depiction`, `drive`, `word_ratio`, `reveal`, `foreshadowing`
6. 所有字段都必须填写，禁止返回 null，禁止省略字段。
7. `chapter_functions`、`characters`、`depiction` 必须是数组。
8. 如果用户给的是“无指定”，你必须根据上下文自动补全为具体值，不要直接输出“无指定”。

# 枚举候选值
- event_stage: {", ".join(EVENT_STAGE_OPTIONS[1:])}
- novel_stage: {", ".join(NOVEL_STAGE_OPTIONS[1:])}
- chapter_functions: {", ".join(CHAPTER_FUNCTION_OPTIONS)}
- person: {", ".join(PERSON_OPTIONS[1:])}
- perspective: {", ".join(PERSPECTIVE_OPTIONS[1:])}
- scene_switch: {", ".join(SCENE_SWITCH_OPTIONS[1:])}
- narrative: {", ".join(NARRATIVE_OPTIONS[1:])}
- pace: {", ".join(PACE_OPTIONS[1:])}
- depiction: {", ".join(DEPICTION_OPTIONS)}
- drive: {", ".join(DRIVE_OPTIONS[1:])}
- reveal: {", ".join(REVEAL_OPTIONS[1:])}
"""

        try:
            log_func("正在连接 DeepSeek 执行 JSON 大纲推演...")
            result_json = call_deepseek_api_json_object(
                system_prompt=sys_prompt,
                user_prompt=user_input + json_contract,
                model=model,
                temperature=0.6,
            )
            normalized_outline = ChapterOutlineApp.normalize_llm_outline(result_json)
            result_text = ChapterOutlineApp.render_markdown_outline(normalized_outline)
            atomic_write(save_path, result_text, data_type="text")
            log_func(f"[INFO] 章节大纲生成成功，已保存至: {save_path}")
            return True
        except Exception as e:
            log_func(f"[ERROR] 接口请求失败: {str(e)}")
            return False


def run_headless(project_name, chapter_name, chapter_brief_json, model="deepseek-v4-flash"):
    import base64
    import sys

    try:
        if chapter_brief_json.startswith("b64:"):
            chapter_brief_json = base64.b64decode(chapter_brief_json[4:]).decode("utf-8")
        chapter_brief = json.loads(chapter_brief_json)
    except Exception:
        chapter_brief = chapter_brief_json

    if not project_name or not chapter_name:
        sys.exit(1)

    print(f"静默生成大纲中: {project_name} - {chapter_name}")
    success = ChapterOutlineApp.execute_generation(project_name, chapter_brief, chapter_name, model, print)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    safe_run_app(
        app_class=ChapterOutlineApp,
        headless_func=run_headless,
        project_name="",
        chapter_name="",
        chapter_brief_json="",
        model="",
    )
