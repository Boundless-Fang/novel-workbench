"""《完整流程与选择规范》对应的可执行步骤定义与产物格式规则。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

# 与 web/app.js 的右侧“配置｜选择式编辑”共用同一组中文值。
CONFIG_OPTIONS: dict[str, tuple[str, ...]] = {
    "person": ("第一人称", "第三人称"),
    "narrative": ("顺叙", "倒叙", "插叙"),
    "structure": ("铺垫蓄势", "冲突递进", "悬念收束"),
    "event_level": ("主线", "支线", "闲笔"),
    "scene": ("单场景", "多场景"),
    "information": ("背景设定", "场景氛围", "前置剧情", "人物出场", "信息揭示", "身份揭示", "回忆/前情", "冲突", "伏笔", "悬念", "回应/揭示", "对话引入", "场景切换"),
    "changes": ("性格对比", "心理状态", "关系变化", "结尾状态"),
    "events": ("误会", "危机", "反转", "和解"),
    "expression": ("叙述", "描写", "抒情", "议论", "说明"),
    "triggers": ("对话/声响触发", "情绪触发", "对比", "延宕", "因果链"),
}
CONFIG_LABELS = {"person":"叙事视角", "narrative":"叙事结构", "structure":"结构模板", "event_level":"事件评级", "scene":"场景组织", "information":"信息安排", "changes":"人物变化", "events":"事件要素", "expression":"表达方式", "triggers":"行为触发"}
CONFIG_MULTIPLE = {"narrative", "information", "changes", "events", "expression", "triggers"}

STEP_INPUTS: dict[str, dict[str, Any]] = {
    "compile_character_roster": {"required": ["characters"], "properties": {"characters": "角色名数组，每项含 name 和可选 brief"}},
    "generate_characters_batch": {"required": [], "properties": {"characters": "可选的角色名覆盖；缺省读取 知识库/角色名单.json"}},
    "compile_relation_roster": {"required": ["relations"], "properties": {"relations": "关系数组，每项含 character_a、character_b 和可选 brief"}},
    "generate_relations_batch": {"required": [], "properties": {"relations": "可选的关系覆盖；缺省读取 知识库/关系名单.json"}},
    "compile_intro": {"required": ["summary"], "properties": {"summary": "不超过100字、包含主角名和具体剧情的小说简介", "tags": "模型补齐的题材、受众、感情线标签"}},
    "text_stats": {"required": ["source"], "properties": {"source": "原著文件名"}},
    "word_frequency": {"required": ["source"], "properties": {"source": "原著文件名"}},
    "style": {"required": ["source"], "properties": {"source": "原著文件名"}},
    "positive_vocabulary": {"required": ["source"], "properties": {"source": "原著文件名"}},
    "exclusive_vocabulary": {"required": ["source"], "properties": {"source": "原著文件名"}},
    "generate_worldview": {"required": [], "properties": {"genre": "题材", "premise": "世界基础", "power_system": "力量体系", "factions": "势力（名称、地位、位置、关键角色、身份、境界/能力）"}},
    "generate_worldview_json": {"required": [], "properties": {"genre": "题材", "premise": "世界基础", "power_system": "力量体系", "factions": "势力（名称、地位、位置、关键角色、身份、境界/能力）"}},
    "compile_style": {"required": [], "properties": {"narrative_rhythm": "叙事节奏", "tone": "叙事语调", "sentence_paragraph": "句段长度", "psychology": "心理呈现", "punctuation": "标点习惯", "technique": "表现手法、描写角度、修辞、感官倾向", "description": "描写风格", "person": "人称视角", "dialogue": "对话处理", "vocabulary": "词汇策略"}},
    "generate_character": {"required": ["name"], "properties": {"name": "姓名", "importance": "重要性（1–4）", "identity": "身份", "traits": "性格", "values": "价值观", "appearance": "外貌、身材、服饰", "voice": "音色与语言习惯", "goal": "目标", "ability": "能力/境界", "timeline": "经历时间轴"}},
    "compile_relation": {"required": ["character_a", "character_b"], "properties": {"character_a": "角色 A", "character_b": "角色 B", "relationship": "关系", "emotion": "情感"}},
    "compile_plot": {"required": ["kind"], "properties": {"kind": "book 或 volume", "volume": "卷名", "protagonist": "主角", "characters": "卷关键角色", "chapter_range": "章号范围", "mainline": "主线", "plan": "逐章剧情"}},
    "compile_volume": {"required": ["volume"], "properties": {"volume": "卷名", "protagonist": "主角", "characters": "卷关键角色", "chapter_range": "章号范围", "mainline": "主线", "plan": "逐章剧情"}},
    "compile_ledger": {"required": [], "properties": {"entries": "信息条目数组；类型仅限历史、传闻、伏笔"}},
    "compile_anchor": {"required": ["chapter", "characters", "core_event"], "properties": {"chapter": "章节名", "characters": "出场角色、目的和情绪", "core_event": "核心事件（≤100字）", "information_boundary": "信息边界、揭示方式、揭示者、揭示位置", "foreshadowing": "伏笔", "hook": "钩子"}},
    "compile_config": {"required": ["chapter"], "properties": {"chapter": "章节名", "person": "叙事视角，只能选择：第一人称、第三人称", "narrative": "叙事结构，可多选，只能从：顺叙、倒叙、插叙 中选择", "structure": "结构模板，只能选择：铺垫蓄势、冲突递进、悬念收束", "event_level": "事件评级，只能选择：主线、支线、闲笔", "scene": "场景组织，只能选择：单场景、多场景", "information": "信息安排，可多选，只能从：背景设定、场景氛围、前置剧情、人物出场、信息揭示、身份揭示、回忆/前情、冲突、伏笔、悬念、回应/揭示、对话引入、场景切换 中选择", "changes": "人物变化，可多选，只能从：性格对比、心理状态、关系变化、结尾状态 中选择", "events": "事件要素，可多选，只能从：误会、危机、反转、和解 中选择", "expression": "表达方式，可多选，只能从：叙述、描写、抒情、议论、说明 中选择", "triggers": "行为触发，可多选，只能从：对话/声响触发、情绪触发、对比、延宕、因果链 中选择"}},
    "compile_dialogue": {"required": ["chapter", "dialogues"], "properties": {"chapter": "章节名", "dialogues": "台词数组，每项含 character、line、可选 action"}},
    "compile_snapshot": {"required": ["chapter"], "properties": {"chapter": "章节名", "characters": "本章涉及角色名数组（可选；缺省时汇总所有已确认卡）", "previous_ending": "可选的上一章结尾"}},
    "generate_prose": {"required": ["chapter"], "properties": {"chapter": "章节名"}},
    "rewrite_prose": {"required": ["chapter", "instruction"], "properties": {"chapter": "章节名", "instruction": "改写要求", "selected_text": "可选的待改写片段"}},
    "validate": {"required": ["chapter"], "properties": {"chapter": "章节名"}},
}

TASK_MODULES = {
    **{name: "提取步骤" for name in ("text_stats", "word_frequency", "style", "positive_vocabulary", "exclusive_vocabulary")},
    **{name: "资产步骤" for name in ("compile_intro", "generate_worldview", "compile_style", "generate_character", "compile_relation", "compile_plot", "compile_volume", "compile_ledger")},
    **{name: "章节步骤" for name in ("compile_anchor", "compile_config", "compile_dialogue", "compile_snapshot", "generate_prose", "rewrite_prose")},
    "generate_worldview_json": "世界观JSON",
    "compile_character_roster": "结构化JSON",
    "generate_characters_batch": "资产步骤",
    "compile_relation_roster": "结构化JSON",
    "generate_relations_batch": "资产步骤",
    "validate": "校验步骤",
}

FORMAT_RULES: dict[str, tuple[str, ...]] = {
    "compile_intro": ("# 小说简介", "## 简介", "## 标签", "题材", "受众", "感情线"),
    "generate_worldview": ("# 世界观", "小说类型", "世界观基础", "力量体系", "势力", "资源设定"),
    "compile_style": ("# 语言风格", "行文风格", "叙事节奏", "语体色彩", "叙事语调", "描写风格", "格式要求", "人称视角", "句段长度", "心理呈现", "对话处理", "标点习惯", "手法偏好", "表达方式", "表现手法", "描写角度", "修辞手法", "词汇策略", "称谓指代", "雅俗取向", "情绪浓度", "感官倾向"),
    "generate_character": ("# 角色卡：", "性别｜重要性", "身份｜性格｜价值观", "外貌气质｜身材身高｜服饰偏好", "语言习惯｜音色", "主要能力 / 境界", "年龄与经历时间轴"),
    "compile_relation": ("# 关系卡：", "称呼", "关系", "情感", "共同经历", "当前态度"),
    "compile_plot": ("#", "主角", "第 N 卷", "关键角色", "剧情"),
    "compile_volume": ("#", "卷名", "章号范围", "第 X 章", "剧情"),
    "compile_ledger": ("# 信息账本", "历史", "传闻", "伏笔"),
    "compile_anchor": ("#", "强制设定锚点", "出场角色", "目的", "情绪", "核心事件", "信息边界", "揭示方式", "揭示者", "揭示位置", "伏笔", "钩子"),
    "compile_config": ("#", "配置"),
    "compile_dialogue": ("#", "台词"),
    "compile_snapshot": ("# 最终提示词快照", "## 世界观", "## 语言风格", "## 角色卡", "## 关系卡", "## 强制设定锚点", "## 配置", "## 台词", "## 禁词表", "## 上一章结尾"),
    "validate": ("#", "校验报告", "语义校验", "结论"),
}

# 世界观文件允许模型采用自然的同义字段名；只要求核心信息存在，避免纯文案差异阻塞落盘。
FORMAT_ALIASES: dict[tuple[str, str], tuple[str, ...]] = {
    ("generate_worldview", "小说类型"): ("小说类型", "题材", "类型", "小说题材"),
    ("generate_worldview", "世界观基础"): ("世界观基础", "世界基础", "世界设定", "基础设定", "世界观"),
    ("generate_worldview", "力量体系"): ("力量体系", "修炼体系", "战力体系", "能力体系", "境界体系", "实力体系", "修为体系", "力量等级"),
    ("generate_worldview", "势力"): ("势力", "阵营", "组织", "宗门", "种族", "国家", "主要势力", "势力分布"),
    ("generate_worldview", "资源设定"): ("资源设定", "资源", "资源与材料", "资源分布", "资源体系"),
    ("generate_worldview", "势力内身份"): ("势力内身份", "角色身份", "人物身份", "身份/职位", "身份｜", "职位", "职务"),
    ("generate_worldview", "境界/能力"): ("境界/能力", "能力/境界", "境界", "修为", "实力", "能力等级", "力量等级"),
}

def validate_format(task: str, path: Path, text: str) -> list[str]:
    """返回违反规范的原因；无错误代表格式可作为正式资产保存。"""
    if not text.strip():
        return ["产物为空"]
    errors = [f"缺少规定内容：{token}" for token in FORMAT_RULES.get(task, ()) if not any(alias in text for alias in FORMAT_ALIASES.get((task, token), (token,)))]
    if task == "compile_dialogue":
        meaningful = [line for line in text.splitlines() if line.strip() and not line.startswith("#")]
        if not any("“" in line and "”" in line for line in meaningful):
            errors.append("台词必须使用中文引号“”")
        if not any(" + " in line for line in meaningful):
            errors.append("台词每行必须使用「角色名 + “台词”」格式")
    return errors


def _fuzzy_config_match(text: str, allowed: tuple[str, ...]) -> str | None:
    """把模型常见的同义/组合写法归一到受控选项。"""
    text = str(text or "").strip()
    if text in allowed:
        return text
    for opt in allowed:
        if opt in text or text in opt:
            return opt
    aliases: dict[str, tuple[str, ...]] = {
        "铺垫蓄势": ("铺垫", "蓄势"),
        "冲突递进": ("冲突", "递进"),
        "悬念收束": ("悬念", "收束"),
    }
    for opt in allowed:
        if any(alias in text for alias in aliases.get(opt, ())):
            return opt
    return None

def validate_config_fields(data: dict[str, Any]) -> dict[str, list[str] | str]:
    """验证并规范化配置。只允许右侧结构化模板所列的选项；对同义/组合写法做容错归一。"""
    normalized: dict[str, list[str] | str] = {}
    for key, allowed in CONFIG_OPTIONS.items():
        value = data.get(key, []) if key in CONFIG_MULTIPLE else data.get(key, "")
        if value in (None, "", []):
            normalized[key] = [] if key in CONFIG_MULTIPLE else ""
            continue
        raw_items = value if isinstance(value, list) else [value]
        items: list[str] = []
        for item in raw_items:
            if isinstance(item, str) and "、" in item:
                items.extend(part.strip() for part in item.split("、") if part.strip())
            else:
                items.append(item)
        matched: list[str] = []
        for item in items:
            if not isinstance(item, str):
                continue
            hit = _fuzzy_config_match(item, allowed)
            if hit is not None and hit not in matched:
                matched.append(hit)
        if key not in CONFIG_MULTIPLE:
            normalized[key] = matched[0] if matched else ""
        else:
            normalized[key] = matched
    if not any(normalized.values()):
        raise ValueError("配置至少需要选择一个项目")
    return normalized
