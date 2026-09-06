import os
import re
import shutil
import math

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import BASE_DIR, PROJECT_ROOT, REFERENCE_DIR, STYLE_DIR, PROJ_DIR
from core._core_utils import smart_read_text, atomic_write
from core._core_llm import call_deepseek_api
from core._core_rag import RAGRetriever

class CharacterProfileApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass # 此方法已完全交由 Web API 层通过 run_headless 静默执行

    @staticmethod
    def parse_character_names(char_input):
        char_input = char_input.replace('（', '(').replace('）', ')')
        if '(' in char_input and char_input.endswith(')'):
            main_name = char_input.split('(')[0].strip()
            aliases_str = char_input.split('(')[1][:-1]
            aliases = [a.strip() for a in re.split(r'[,，、]', aliases_str) if a.strip()]
            return main_name, [main_name] + aliases
        return char_input.strip(), [char_input.strip()]

    @staticmethod
    def execute_extraction(original_path, character_input, model, log_func, project_name=None):
        try:
            novel_name = os.path.splitext(os.path.basename(original_path))[0]
            main_name, search_keywords = CharacterProfileApp.parse_character_names(character_input)
            
            style_dir = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation")
            rag_db_dir = os.path.join(style_dir, "global_rag_db")
            index_path = os.path.join(rag_db_dir, "vector.index")
            chunks_path = os.path.join(rag_db_dir, "chunks.json")

            if not os.path.exists(index_path) or not os.path.exists(chunks_path):
                 log_func("[ERROR] 致命错误：未找到全局 RAG 索引。请先执行 f0 初始化！")
                 return False

            style_char_dir = os.path.join(style_dir, "character_profiles")
            os.makedirs(style_char_dir, exist_ok=True)
            save_path = os.path.join(style_char_dir, f"{main_name}.md")
            
            project_save_path = None
            if project_name:
                project_dir = os.path.join(PROJ_DIR, project_name, "character_profiles")
                os.makedirs(project_dir, exist_ok=True)
                project_save_path = os.path.join(project_dir, f"{main_name}.md")

            log_func(f"正在加载全局 RAG 索引并定向追踪角色: {search_keywords}")
            try:
                retriever = RAGRetriever()
                index, chunks = retriever.load_index(index_path, chunks_path)
                
                meta_queries = [
                    f"{main_name} 外貌 气质 衣服 长相",
                    f"{main_name} 境界 功法 武器 战斗",
                    f"{main_name} 父母 身世 过去 经历",
                    f"{main_name} 性格 说话 笑道 怒道"
                ]
                all_queries = search_keywords + meta_queries
                
                retrieved_chunks = retriever.search(index, chunks, all_queries, k=8, batch_size=3)
                context_text = "\n...\n".join(retrieved_chunks[:50]) 
                log_func(f"成功召回 {min(len(retrieved_chunks), 50)} 个包含该角色的高相关度片段。")
                
            except Exception as e:
                log_func(f"[ERROR] 向量化或检索失败: {str(e)}")
                return False

            log_func("正在调用大模型生成角色卡片...")
            prompt_header = f"""【系统指令】：
请基于提供的“文本高相关度片段”，为角色【{character_input}】提取并总结信息卡片。
必须严格遵循原文，如果某项在文本中确实没有提及，请填“未知”。必须使用 Markdown 结构输出。

【固定输出板块与格式】：
### 一、 基础属性
- **名字**：
- **人物类型**：（在 男主角、女主角、配角、反派 中选择）
- **人物塑造**：（在 圆形人物/扁平人物 中选择）
- **相关关键词**：（3-5个核心词）

### 二、 相关信息
- **身份**：（社会身份/职业，以及人际关系如“XX的徒弟/XX的妻子”）
- **性格**：
- **外貌/气质/身材/服饰**：
- **主要能力特点/境界**：
- **年龄与主要经历**：

### 三、 价值观
从以下列表中严格选出五个在该角色心中最重要的价值观，并用 `>` 进行排序（例如：复活爱人 > 宗门传承 > 尊严 > 力量 > 生命）：
列表：执念/理想（大道/长生/天下/自由/复活爱人等）、集体（种族/国家/宗门等）/传承、道心/原则/尊严、爱情/爱人、子嗣/父母/师傅/亲人/好友等、恩情/承诺、贞洁/性、自我/生命、力量/资源/金钱/权力等。
- **核心价值观排序**：
- **人物弱点**：
- **相关高频词**：

### 四、 对主要角色的态度
（提取与该角色有互动的其他主要角色，说明对其称呼及好感度。好感度从低到高限选：仇恨、厌恶、冷漠、陌生、好感、亲近、深情）
- **对[角色A]**：称呼为...，态度为[填入好感度]，补充说明...
- **对[角色B]**：...

### 五、 语言习惯与音色
- **语言习惯与音色**：

【文本高相关度片段 (经 RAG 检索提取)】：
"""
            prompt = prompt_header + context_text
            sys_prompt = "你是一个严谨的小说设定整理专家。严格遵守原著，空缺项目填未知，只输出 Markdown。"

            try:
                result_text = call_deepseek_api(system_prompt=sys_prompt, user_prompt=prompt, model=model, temperature=0.2)
                
                # 基础防呆校验
                if "一、 基础属性" not in result_text and "基础属性" not in result_text:
                    log_func(f"[WARN] 警告：[{main_name}] 返回的内容可能缺失了 Markdown 骨架结构，建议人工检查。")

                try:
                    atomic_write(save_path, result_text, data_type='text')
                    msg = f"[INFO] [{main_name}] 构建完成！已原子级落盘至: {save_path}"
                except Exception as e:
                    log_func(f"[ERROR] 文件写入失败: {e}")
                    raise
                if project_save_path:
                    shutil.copy2(save_path, project_save_path)
                    
                log_func(msg)
                return True
            except Exception as e:
                log_func(f"[ERROR] API 调用失败: {str(e)}")
                return False
        except Exception as e:
            log_func(f"[ERROR] 分析失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

def run_headless(target_file, character_list_str, project_name=None, model="deepseek-v4-flash"):
    import sys
    if os.path.isabs(target_file):
        original_path = target_file
    else:
        original_path = os.path.join(REFERENCE_DIR, target_file)
        
    if not os.path.exists(original_path):
        print(f"error: 未找到原文 {original_path}")
        sys.exit(1)
    
    chars = [c.strip() for c in character_list_str.split(',') if c.strip()]
    if not chars:
        print("error: 角色列表为空")
        sys.exit(1)
        
    print(f"开始静默执行 RAG 角色卡批量提取，共 {len(chars)} 个目标...")
    for char_name in chars:
        print(f"-> 提取角色: {char_name}")
        CharacterProfileApp.execute_extraction(original_path, char_name, model, print, project_name)

if __name__ == "__main__":
    safe_run_app(
        app_class=CharacterProfileApp,
        headless_func=run_headless,
        target_file="",
        character_list_str="",
        project_name="",
        model=""
    )
