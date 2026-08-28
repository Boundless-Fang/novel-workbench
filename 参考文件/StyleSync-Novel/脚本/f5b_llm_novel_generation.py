import os
import re

import numpy as np

from core._core_cli_runner import HeadlessBaseTask, inject_env, safe_run_app
from core._core_config import PROJ_DIR
from core._core_llm import stream_deepseek_api
from core._core_rag import RAGRetriever
from core._core_utils import atomic_write, smart_read_text

inject_env()


DEFAULT_STYLE_GUIDE_WHEN_EMPTY_LEGACY = """零、创作界限
禁止：禁止血腥场面；禁止过度且与情色表达无关的暴力；禁止角色沉溺于绝望、麻木等极端负面情绪；禁止科幻和超越时代的高科技元素的出现；禁止出现疤痕、胎记、妊娠纹等不美观的身体特征描写（除非用户有明确要求）；禁止使用言之无物的议论；禁止使用隐喻与象征的手法。
禁用词汇库：
厌恶，麻木，空洞，诡异，恐怖，恐惧，恶意，残忍，剧痛，痛苦，苦痛，厌弃，恶心，厌恶，绝望，焦虑，麻痹，污秽，毁灭，诡异，毛骨悚然，诡谲，破碎（禁止用来形容声音或者身体），恶毒，撕裂，麻木，毛骨悚然，诡异，恐怖，恐惧，恶意，残忍，脊椎，诡谲，毁灭性，四肢百骸、空洞，破布娃娃（类似的词也不行：人偶、偶人、木偶、布娃娃、娃娃等都不行；角色必须作为鲜活的个体存在），海藻，椎，脊，畜，伤口，恐，惨，骨，含有恐，惨，骨的词，青紫/青紫交加，作呕，不似人声，凄惨，惨叫，尖叫，炸开。绝对避免极端情绪词、避免任何暗示恐怖、残忍、毁灭、非人化或特定医学解剖部位的词汇，维持场景的唯美与感性底色。
一、基础篇幅与结构要求
叙事节奏：采用极慢的推进节奏。每一个动作都需要花费数百字以上进行详尽描写，但是不是机械地堆砌，应该穿插对话、拟声词、多感官描写、男主感受和男女主心理活动、环境交互等内容。
二、视角与叙事立场
人称视角：采用第三人称有限视角，并严格以男主视角为主。
男主视角（感官聚焦）：
极度聚焦于男主角的感官体验。
对他人的感受（如女主角）必须通过客观观察其动作或者具体反应来体现。
严禁使用主观臆测句式，例如“她感觉到……”或“她觉得……”。所有心理状态必须等同于生理反应。
其他辅助视角:
第三人称全知视角描写环境或者交代背景和设定。
第一人称/第三人称女主视角描写心理活动。 
三、描写风格与核心原则
物理感受优先：集中笔墨描写物理层面的感受，而非心理层面的总结。
展示（Showing）而非讲述（Telling）：
直接描写内心独白和具体动作，代替间接说明。
向读者展示角色在做什么，感官接收到了什么，让读者自行体会含义，禁止作者跳出来进行高度概括或议论。
拒绝抽象符号化：
将角色视为活生生的人，而非特定的符号（如恩人、仇人、公主、女王、守护者、献祭者等）。
从角色角度思考行为，避免高高在上、言之无物的议论。
禁止使用“献祭”、“悲壮”、“恩典”等笼统概括性语言。
禁止使用引号或括号来标记这些抽象词汇。
侧重感官与细节：极端侧重具体的生动场景描写、动作描写、细节描写，调动多感官，以及切实具象的比喻和对比手法。
四、语言与词汇运用
词汇丰富度：
一个段落使用多种动作，一种动作需搭配多种多样、丰富且详细的动词。
对话中穿插能够体现人物心理的细致动作或者神态描写
少用概括性、结论性、定义性的语言。
避免陈词滥调：
不要使用“炸开”、“爆发”之类缺乏美感且言之无物的词汇，不要使用“不是……而是”这样言之无物的句式。
禁止空泛的心理或快感描写（如“灭顶的快感”、“灵魂深处”、“一片空白”等）。
必须用具体的身体反应和人物的声音语言等来表现状态。
五、对话与格式规范
格式规范：
心理活动使用`[]`框住。
对话内容和拟声词使用`“”`框住。
切换场景或者时间线（回忆）用单独成段的。。。。。。分割上下文
0、对话和心理感受需自然真实，可以是吐槽、疑问，也可以是通俗自然的感受，甚至是直接的情感宣泄。
对话格式要求
1、与以下搭配：音调/音量/音色变化（比如变调、压低声音）、表情/神态（比如眼神变化、抿唇、皱眉、脸红）、生理细节（比如胸膛起伏、呼吸急促）、肢体语言（比如叉腰、抱胸）、小动作（比如指尖泛白）、拟声词、心理描写等
2、禁止空泛无意义的表达
3、尽量不把情感/情绪词或者形容词单独使用，而是与动作、神态描写等搭配
【最高优先级指令：彻底去旁白化与纯感官流】
目标是让小说聚焦具体的描写（语言动作神态心理等），而非空洞的议论解释说明
一、绝对禁止的句式与逻辑（杀大纲、杀议论）
在此模式下，严禁作者跳出来对画面进行总结、比较或解释。以下句式一经发现，视为违规：
1.禁止比较与定义句式：
“与其说……不如说……”
“（仿佛）不是A，而是B”
“那不是A，也不是B，而是一种C”
“这（它）是一种A，也是一种B”
“这（像）是一场/次/个+[抽象概念]（如：献祭，掠夺，占有，仪式，洗礼等）”
“带着一种……”
2.禁止因果解释与动机说明：
禁止解释动作背后的原因（如：“因为醉酒而……”，“为了发泄而……”，“出于本能……”）。
只写动作本身，不写为什么做这个动作。
3.禁止陈词滥调的心理隐喻：
禁止出现“理智的弦（断了/崩塌）”。
禁止出现“大脑一片空白”、“思维停滞”。
禁止出现“心底升起……”，“灵魂深处……”。
二、绝对禁止的描写词汇（杀形容词、杀抽象）
严禁使用无法被视网膜捕捉或触觉神经感知的抽象词汇。
疯狂的、剧烈的、猛烈的、极致的、极度的、巨大的、彻底的、残忍的、疯狂的、不容置疑的、爆炸性的、绝望的、无助的、难以言喻的、无法形容的、不可思议的、孤注一掷的、带有侵略性的、带有惩罚性的、令人窒息的、下意识的、本能的、狂风骤雨般、
三、禁止抽象与夸张的快感描写：
禁止“……猛地/轰然炸开”。
禁止“……被劈成了两半”。
禁止“灭顶的快感”、“毁灭性的（冲刺/力量）”。
禁止“灵魂深处……”，“直达灵魂”。
禁止“充满了……的（气息/味道/感觉）”。
四、禁止缺乏美感的比喻
绝对禁止：破布娃娃（及人偶、偶人、木偶、断了线的木偶、布娃娃、娃娃等）、濒死的/被抛上岸/砧板上鱼、像一盆冰水、像一把重锤、淬了毒的...、飓风、被抽去骨头的...、祭品、待宰的...、牲畜、最锋利的冰锥、离了水的鱼、重型卡车、灵魂出窍、空白/空白的大脑、行驶的列车/火车、虔诚的...、撞击、山崩地裂、火山爆发、龙卷风、洪流、子弹、炮弹、燎原的火、掠夺、信徒、攻城锤、岩浆、海藻、破碎（形容声音或身体）。
尽量避免：火星、洪流、毒蛇、小船、催化剂、小兽、烟花、爆炸、船桨、划船、攻城略地、开疆拓土、机器/机械的、溺水、容器、每一个毛孔都在叫嚣、五脏六腑都错了位、毒刺、羽毛、拉风箱。
五、禁止陈词滥调
绝对禁止：带着哭腔、仿佛能滴出水来、带着不容置疑的语气"""


DEFAULT_STYLE_GUIDE_WHEN_EMPTY = """零、结构化摘要
叙事节奏：慢节奏 / 快慢交替
语体色彩：自然清晰 / 细腻克制 / 通俗易读
人称视角：第三人称有限视角
句子长度：长短句结合
段落长度：中短段为主，关键描写处可适当延长
表达方式主导：叙述 / 描写
叙事语调标签：克制 / 沉浸 / 稳定
叙事语调说明：以贴近人物处境的旁白推进故事，不频繁跳出场景做作者式总结。
描写风格标签：具象 / 细节驱动 / 画面感
描写风格说明：优先通过动作、神态、对话、环境和感官细节呈现场景，避免空泛概括。
心理呈现方式：动作神态暗示 / 适度内心独白
对话处理方式：直接引语 / 动作穿插 / 提示语克制
标点习惯：常规规范，适度使用省略号和破折号表现停顿与转折
表现手法偏好：顺叙 / 对比 / 烘托
描写角度偏好：视觉 / 听觉 / 触觉 / 动作细节
修辞手法偏好：少量比喻 / 克制修辞
外貌描写偏好：服务人物状态、关系变化或场景氛围，不做孤立堆砌
动作描写偏好：动作应体现人物意图、情绪变化或关系推进
对话/心理偏好：对白推动信息交换、冲突或关系变化；心理描写保持具体，不写空泛情绪标签

一、最高优先级指令
1. 彻底去旁白化与去空泛议论。
2. 正文必须聚焦具体画面，而不是解释画面意义。
3. 禁止作者跳出场景进行总结、定义、比较或抽象升华。
4. 禁止把人物写成符号、工具、祭品、容器、傀儡或抽象概念。
5. 禁止为了追求文风而牺牲剧情清晰度、人物一致性和设定一致性。
6. 如果具体设定、大纲、角色卡与本模板冲突，优先服从具体设定、大纲和角色卡。

二、禁用词库与禁用表达
绝对避免以下类型表达：

### 1. 禁用词汇库
厌恶、麻木、空洞、诡异、恐怖、恐惧、恶意、残忍、剧痛、痛苦、苦痛、厌弃、恶心、绝望、焦虑、麻痹、污秽、毁灭、毛骨悚然、诡谲、恶毒、撕裂、脊椎、毁灭性、四肢百骸、破碎（禁止用来形容声音或者身体）、破布娃娃、海藻、椎、脊、畜、伤口、恐、惨、骨、青紫、青紫交加、作呕、不似人声、凄惨、惨叫、尖叫、炸开。
含有“恐”“惨”“骨”的词也禁止使用。
“破布娃娃”的类似表达也禁止使用，包括：人偶、偶人、木偶、布娃娃、娃娃。
角色必须作为鲜活的个体存在。绝对避免极端情绪词，避免任何暗示恐怖、残忍、毁灭、非人化或特定医学解剖部位的词汇，维持场景的唯美与感性底色。

### 2. 禁止比较与定义句式
禁止出现以下句式：
“与其说……不如说……”
“（仿佛）不是 A，而是 B”
“那不是 A，也不是 B，而是一种 C”
“这（它）是一种 A，也是一种 B”
“这（像）是一场/次/个 + 抽象概念”
其中抽象概念包括但不限于：献祭、掠夺、占有、仪式、洗礼等。
禁止出现：
“带着一种……”

### 3. 禁止因果解释与动机说明
禁止解释动作背后的原因，例如：
“因为醉酒而……”
“为了发泄而……”
“出于本能……”
只写动作本身，不写为什么做这个动作。

### 4. 禁止陈词滥调的心理隐喻
禁止出现：
“理智的弦断了”
“理智的弦崩塌”
“大脑一片空白”
“思维停滞”
“心底升起……”
“灵魂深处……”

### 5. 绝对禁止的描写词汇
严禁使用无法被视网膜捕捉或触觉神经感知的抽象词汇。
禁止使用：
疯狂的、剧烈的、猛烈的、极致的、极度的、巨大的、彻底的、残忍的、不容置疑的、爆炸性的、绝望的、无助的、难以言喻的、无法形容的、不可思议的、孤注一掷的、带有侵略性的、带有惩罚性的、令人窒息的、下意识的、本能的、狂风骤雨般。

### 6. 禁止抽象与夸张的快感描写
禁止出现：
“……猛地炸开”
“……轰然炸开”
“……被劈成了两半”
“灭顶的快感”
“毁灭性的冲刺”
“毁灭性的力量”
“灵魂深处……”
“直达灵魂”
“充满了……的气息”
“充满了……的味道”
“充满了……的感觉”

### 7. 禁止缺乏美感的比喻
绝对禁止：
破布娃娃、人偶、偶人、木偶、断了线的木偶、布娃娃、娃娃、濒死的、被抛上岸、砧板上鱼、像一盆冰水、像一把重锤、淬了毒的、飓风、被抽去骨头的、祭品、待宰的、牲畜、最锋利的冰锥、离了水的鱼、重型卡车、灵魂出窍、空白、空白的大脑、行驶的列车、行驶的火车、虔诚的、撞击、山崩地裂、火山爆发、龙卷风、洪流、子弹、炮弹、燎原的火、掠夺、信徒、攻城锤、岩浆、海藻、破碎（形容声音或身体）。
尽量避免：
火星、洪流、毒蛇、小船、催化剂、催情药、小兽、烟花、爆炸、船桨、划船、攻城略地、开疆拓土、机器、机械的、溺水、容器、每一个毛孔都在叫嚣、五脏六腑都错了位、毒刺、羽毛、拉风箱。

### 8. 禁止陈词滥调
绝对禁止：
带着哭腔
仿佛能滴出水来
带着不容置疑的语气

三、执行原则
1. 对话使用中文引号。
2. 心理活动不强制使用特殊括号，除非上游大纲或项目约定明确要求。
3. 对话不要孤立成信息说明，应与动作、停顿、反应交织。
4. 心理描写不要替代行动，人物最终要通过选择和行为推进场景。
5. 目标是生成具体、稳定、可读、可继续编辑的小说正文。"""


class NovelGenerationApp(HeadlessBaseTask):
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
    def load_style_summary(target_dir):
        style_summary = NovelGenerationApp.read_file_safe(
            os.path.join(target_dir, "features.md"),
            max_len=1800,
        )
        return style_summary or DEFAULT_STYLE_GUIDE_WHEN_EMPTY

    @staticmethod
    def get_chapter_number(name):
        arabic_match = re.search(r"\d+", name or "")
        if arabic_match:
            return int(arabic_match.group(0))

        cn_match = re.search(r"第?([零一二两三四五六七八九十百千万]+)[章节回卷]", name or "")
        if cn_match:
            cn_num = cn_match.group(1)
            cn_map = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
            cn_units = {"十": 10, "百": 100, "千": 1000, "万": 10000}
            result = 0
            tmp = 0
            for char in cn_num:
                if char in cn_units:
                    unit = cn_units[char]
                    if tmp == 0 and unit == 10:
                        tmp = 1
                    result += tmp * unit
                    tmp = 0
                else:
                    tmp = cn_map.get(char, 0)
            result += tmp
            return result
        return 999999

    @staticmethod
    def get_previous_context(content_dir, current_chapter_name):
        if not os.path.exists(content_dir):
            return ""

        chapters = [f for f in os.listdir(content_dir) if f.endswith(".txt")]
        if not chapters:
            return ""

        current_num = NovelGenerationApp.get_chapter_number(current_chapter_name)
        prev_chapters = [f for f in chapters if NovelGenerationApp.get_chapter_number(f) < current_num]
        if not prev_chapters:
            return ""

        prev_chapters.sort(key=NovelGenerationApp.get_chapter_number, reverse=True)
        last_chapter_path = os.path.join(content_dir, prev_chapters[0])
        content = NovelGenerationApp.read_file_safe(last_chapter_path)
        return content[-1000:] if len(content) > 1000 else content

    @staticmethod
    def parse_outline_layers(chapter_outline):
        text = chapter_outline or ""
        position_match = re.search(
            r"#\s*第一层：本章定位\s*(.*?)(?=\n#\s*第二层：本章结构|\Z)",
            text,
            re.S,
        )
        structure_match = re.search(
            r"#\s*第二层：本章结构\s*(.*)",
            text,
            re.S,
        )
        position_text = position_match.group(1).strip() if position_match else ""
        structure_text = structure_match.group(1).strip() if structure_match else ""
        return position_text, structure_text

    @staticmethod
    def parse_position_value(position_text, key):
        pattern = rf"-\s*{re.escape(key)}\s*：\s*(.+)"
        match = re.search(pattern, position_text)
        return match.group(1).strip() if match else ""

    @staticmethod
    def parse_character_names(position_text):
        raw_value = NovelGenerationApp.parse_position_value(position_text, "出场角色")
        if not raw_value:
            return []
        names = re.split(r"[,，、/／\s]+", raw_value)
        return [name.strip() for name in names if name.strip() and name.strip() not in {"无", "未指定"}]

    @staticmethod
    def get_filtered_characters(target_dir, explicit_characters, fallback_text, log_func):
        char_dir = os.path.join(target_dir, "character_profiles")
        if not os.path.exists(char_dir):
            return "无相关角色卡数据。"

        all_char_files = [f for f in os.listdir(char_dir) if f.endswith(".md")]
        relevant_texts = []
        found_names = []
        scan_text = fallback_text or ""

        for f_name in all_char_files:
            char_name_base = os.path.splitext(f_name)[0]
            matched = char_name_base in explicit_characters or char_name_base in scan_text
            if matched:
                content = NovelGenerationApp.read_file_safe(os.path.join(char_dir, f_name))
                if content:
                    relevant_texts.append(content)
                    found_names.append(char_name_base)

        if not relevant_texts:
            log_func("[WARN] 未匹配到明确角色卡，正文将主要依赖世界观和大纲执行。")
            return "本章未匹配到明确角色卡。"

        log_func(f"[INFO] 已注入本章角色卡: {', '.join(found_names)}")
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
    def build_rag_context(target_dir, query_text, log_func):
        rag_context_original = "无原著参考片段。"
        rag_context_project = "无项目记忆片段。"

        try:
            retriever = RAGRetriever()
            embedder = retriever.get_embedder()
            query_vec = embedder.encode([query_text[:1500] if query_text else "本章正文生成"])

            hierarchical_db = os.path.join(target_dir, "hierarchical_rag_db")
            if os.path.exists(hierarchical_db):
                idx_path = os.path.join(hierarchical_db, "plot_summary.index")
                map_path = os.path.join(hierarchical_db, "summary_to_raw_mapping.json")
                res = NovelGenerationApp.retrieve_context(idx_path, map_path, retriever, query_vec, k_limit=2)
                if res:
                    rag_context_original = "\n\n".join(res)

            context_db = os.path.join(target_dir, "context_rag_db")
            if os.path.exists(context_db):
                idx_path = os.path.join(context_db, "vector.index")
                map_path = os.path.join(context_db, "chunks.json")
                res = NovelGenerationApp.retrieve_context(idx_path, map_path, retriever, query_vec, k_limit=4)
                if res:
                    rag_context_project = "\n\n---\n\n".join(res)
        except Exception as e:
            log_func(f"[WARN] f5b RAG 检索失败，已降级继续: {e}")

        return rag_context_original, rag_context_project

    @staticmethod
    def execute_generation(project_name, chapter_name, model, log_func, export_prompt_only=False):
        target_dir = os.path.join(PROJ_DIR, project_name)
        if not os.path.exists(target_dir):
            log_func(f"[ERROR] 未找到项目目录: {target_dir}")
            return False

        outline_path = os.path.join(target_dir, "chapter_structures", f"{chapter_name}_outline.md")
        chapter_outline = NovelGenerationApp.read_file_safe(outline_path)
        if not chapter_outline:
            log_func(f"[ERROR] 未找到本章大纲文件: {outline_path}，请先执行 f5a。")
            return False

        position_text, structure_text = NovelGenerationApp.parse_outline_layers(chapter_outline)
        explicit_characters = NovelGenerationApp.parse_character_names(position_text)

        log_func("正在加载 f5b 生成所需的世界观、角色卡与文风摘要...")
        world_settings = NovelGenerationApp.read_file_safe(os.path.join(target_dir, "world_settings.md")) or "无详细世界观。"
        style_summary = NovelGenerationApp.load_style_summary(target_dir)
        characters_info = NovelGenerationApp.get_filtered_characters(target_dir, explicit_characters, chapter_outline, log_func)

        log_func("正在抽取上一章结尾原文承接点...")
        content_dir = os.path.join(target_dir, "content")
        os.makedirs(content_dir, exist_ok=True)
        previous_context = NovelGenerationApp.get_previous_context(content_dir, chapter_name)

        log_func("正在检索与本章相关的 RAG 参考...")
        rag_context_original, rag_context_project = NovelGenerationApp.build_rag_context(
            target_dir, f"{position_text}\n{structure_text}", log_func
        )

        system_prompt = f"""你是一个专业的网络小说作者。你的任务是基于给定的章节定位与章节结构，生成一章完整、自然、具有网络小说阅读感的正文。

你必须严格遵守以下规则：
1. 必须服从 f5a 生成的本章定位和本章结构，不允许擅自改写章节功能或越界推进到下一章。
2. 必须遵守世界观和角色卡，不允许人物明显 OOC，不允许违背底层设定。
3. 上一章结尾原文用于“句子级承接”，RAG 用于“背景与记忆补充”，两者都不能被忽视。
4. 文风摘要只作为倾向性约束，不要机械堆砌词汇或套用分析术语。
5. 直接输出小说正文，不要输出解释、标题、结构说明或任何额外提示。
6. 正文默认控制在 3000 字左右，可根据大纲中的字数安排自然浮动。

[文风摘要]
{style_summary}

[世界观]
{world_settings}

[角色卡]
{characters_info}

[RAG - 原著相关片段]
{rag_context_original}

[RAG - 前文记忆片段]
{rag_context_project}
"""

        user_prompt = f"""[f5a 第一层：本章定位]
{position_text or "无明确本章定位，请严格依照章节名与整体语境谨慎生成。"}

[f5a 第二层：本章结构]
{structure_text or "无明确本章结构，请尽量按照起承转合组织正文。"}

[上一章结尾原文（允许为空）]
{previous_context or "无上一章结尾原文。"}

请严格按照以上信息生成本章正文。"""

        if export_prompt_only:
            print(f"=== System Prompt ===\n{system_prompt}\n\n=== User Prompt ===\n{user_prompt}")
            return True

        prompt_dir = os.path.join(target_dir, "chapter_specific_prompts")
        os.makedirs(prompt_dir, exist_ok=True)
        prompt_filepath = os.path.join(prompt_dir, f"prompt_{chapter_name}.txt")
        try:
            prompt_content = f"=== System Prompt ===\n{system_prompt}\n\n=== User Prompt ===\n{user_prompt}\n"
            atomic_write(prompt_filepath, prompt_content, data_type="text")
            log_func(f"已将本章最终指令保存至: {prompt_filepath}")
        except Exception as e:
            log_func(f"保存指令文件失败: {str(e)}")

        log_func("\n>> 提示词构建完毕，正在执行流式正文生成...\n")
        output_filepath = os.path.join(content_dir, f"{chapter_name}.txt")
        try:
            full_content = ""
            for chunk in stream_deepseek_api(system_prompt, user_prompt, model, temperature=0.5):
                log_func(chunk, append=True)
                full_content += chunk
            atomic_write(output_filepath, full_content, data_type="text")
            log_func(f"\n\n[INFO] 章节正文生成完毕，已保存至: {output_filepath}")
            return True
        except Exception as e:
            log_func(f"\n[ERROR] 流式生成中断或失败: {str(e)}")
            import traceback

            traceback.print_exc()
            return False


def run_headless(project_name, chapter_name, model="deepseek-v4-flash", export_prompt_only=False):
    import sys

    if not project_name or not chapter_name:
        sys.exit(1)
    if not export_prompt_only:
        print(f"开始静默执行小说流式生成: 项目 [{project_name}] - 章节 [{chapter_name}]")
    success = NovelGenerationApp.execute_generation(
        project_name,
        chapter_name,
        model,
        lambda msg, append=False: print(msg, end="" if append else "\n", flush=True)
        if not export_prompt_only
        else None,
        export_prompt_only=export_prompt_only,
    )
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    safe_run_app(
        app_class=NovelGenerationApp,
        headless_func=run_headless,
        project_name="",
        chapter_name="",
        model="",
    )
