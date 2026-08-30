import os
import re
import shutil

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import BASE_DIR, PROJECT_ROOT, REFERENCE_DIR, STYLE_DIR, PROJ_DIR
from core._core_utils import smart_read_text, atomic_write
from core._core_llm import call_deepseek_api
from core._core_rag import RAGRetriever

class KeywordBaseApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass # 此方法已完全交由 Web API 层通过 run_headless 静默执行

    @staticmethod
    def execute_extraction(original_path, model, log_func, project_name=None):
        try:
            novel_name = os.path.splitext(os.path.basename(original_path))[0]
            words_path = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation", "statistics", "高频词.txt")

            style_dir = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation")
            rag_db_dir = os.path.join(style_dir, "global_rag_db")
            index_path = os.path.join(rag_db_dir, "vector.index")
            chunks_path = os.path.join(rag_db_dir, "chunks.json")

            if not os.path.exists(index_path) or not os.path.exists(chunks_path):
                 log_func("[ERROR] 致命错误：未找到全局 RAG 索引。请先执行 f0 初始化！")
                 return False

            # 1. 读取高频词作为检索源头
            try:
                query_keywords = []
                if os.path.exists(words_path):
                    words_text = smart_read_text(words_path)
                    matches = re.findall(r'(\S+)\(\d+\)', words_text)
                    query_keywords = matches[:150] 
                else:
                    log_func("警告：未找到本地高频词文件，无法进行精准 RAG 检索。")
                    return False
            except Exception as e:
                log_func(f"读取文件失败: {e}")
                return False

            os.makedirs(style_dir, exist_ok=True)
            save_path = os.path.join(style_dir, "positive_words.md")
            
            project_save_path = None
            if project_name:
                project_dir = os.path.join(PROJ_DIR, project_name)
                os.makedirs(project_dir, exist_ok=True)
                project_save_path = os.path.join(project_dir, "positive_words.md")

            # 【优化3】：接入 RAGRetriever
            log_func("正在调用核心层加载全局 RAG 索引...")
            try:
                retriever = RAGRetriever()
                index, chunks = retriever.load_index(index_path, chunks_path)
                log_func(f"已加载索引，包含 {len(chunks)} 个文本块。正在提取上下文...")
                
                # 直接将关键词列表交给 core 的 search 函数进行多线程/批处理检索
                retrieved_chunks = retriever.search(index, chunks, query_keywords, k=6)
                context_text = "\n...\n".join(retrieved_chunks[:40])
                
                log_func(f"成功召回 {len(retrieved_chunks)} 个高相关度片段，即将请求大模型。")
                
            except Exception as e:
                log_func(f"[ERROR] 检索失败: {str(e)}")
                return False

            log_func("正在请求 API 进行词汇清洗与多维分类...")
            
            prompt_header = """【系统指令】
请仔细阅读提供的参考文本片段以及高频词列表，并严格按照以下结构化的维度框架，提取或者整理对应的关键词与细节描述，词与词之间用、隔开。
如果每一个项目没有相关词，请标注“无”。
【强制约束】：注意所有词必须来自参考文本本身，不允许造新词。请使用 Markdown 层级输出。

【分类框架】：
一. 容貌
面容：[描述脸型、轮廓、五官比例等基础特征]
眉眼：[描述眉型、眼型、瞳色、睫毛等细节]
口鼻：[描述鼻型、唇形、唇色、牙齿等细节]
皮肤：[描述肤色、肤质、质感、瑕疵或印记等]
发丝：[描述发型、发色、发质、长度、状态等]
二. 气质
内在底色（清/雅/纯/稳/莽）：[描述角色的核心性格底色与内在氛围]
外在展现（冷/贵/柔/英/媚）：[描述角色给人的第一印象与外放气质]
其他气质：[补充不属于上述分类的特殊气质，如病弱、颓废、神秘等]
三. 身材
整体/身高：[描述整体体型（如高挑、娇小、魁梧）及具体身高视觉感]
肩颈/胸臀/腰背：[描述核心躯干的线条、肌肉状态或体态特征]
手臂/腿足：[描述四肢的长度、粗细、力量感或特殊特征]
四. 服饰
种类：[描述穿着的具体服装款式、件数]
材质：[描述布料质地，如丝绸、棉麻、皮革、粗布等]
状态：[描述服装当前的状况，如整洁、破损、褶皱、湿透等]
配饰：[描述佩戴的首饰、挂件、武器等附属物品]
相关动作：[描述与服饰相关的互动，如整理衣领、拉扯袖口、脱下外套等]
五. 对话与表现
逻辑叙事：[描述其表达的主题、说话逻辑或叙事条理性]
状态行为：[描述当前正在进行的整体动作或行为模式]
语气声音：
- 呼吸叫声：[描述呼吸频率、轻重，或特定的叹息、喘息等]
- 语气言语：[描述说话的口吻，如命令、恳求、嘲讽、温柔等]
- 音色音调音量：[描述声音特质，如沙哑、清脆、低沉，及音量大小]
神态表情：
- 表情：[描述面部整体的喜怒哀乐状态]
-气色：[描述面部红润、苍白、铁青等生理性显色]
- 眉眼动作：[描述挑眉、垂眸、眯眼、眼神躲闪等微动作]
- 口鼻动作：[描述咬唇、撇嘴、嗤鼻等微动作]
情绪心理：
- 心理活动：[描述其内心的真实想法或潜台词]
- 正面情绪：[描述喜悦、期待、安心等积极情绪表现]
- 负面情绪：[描述愤怒、恐惧、悲伤等消极情绪表现]
肢体语言：
- 头颈发丝：[描述点头、歪头、撩拨头发等动作]
- 手臂指尖：[描述手势、握拳、指尖颤抖等动作]
- 躯干核心：[描述挺胸、佝偻、后退、僵硬等躯干动作]
- 腿足脚趾：[描述步伐、抖腿、脚趾蜷缩等下肢动作]
生理细节：
- 体液气味：[描述汗水、泪水、血液，及身上的香气或体味]
- 皮肤肌肉：[描述鸡皮疙瘩、肌肉紧绷、青筋暴起等细节]
- 内脏/神经/呼吸：[描述心跳加速、胃部痉挛、耳鸣等深层生理反应]
- 其他：[其他未分类的生理特征]
五感表现：
- 温度：[描述冷、热、温热、冰凉等感知]
- 触感：[描述粗糙、柔软、刺痛、摩擦等体验]
- 光影：[描述视觉上的明暗变化、色彩对比等]
六. 交互
空间距离：[描述角色间的物理距离及变化，如逼近、退后、并肩]
视线交互：[描述目光的交汇、躲闪、凝视或压迫性注视]
气场碰撞：[描述双方气质和情绪交锋时的氛围感或张力]
七. 环境与氛围
场景：[描述所处的具体物理空间、时间、天气或布景]
氛围：[描述场景整体烘托出的情感基调，如压抑、温馨、肃杀等]

【高频词列表】：
"""
            words_text = smart_read_text(words_path)
            prompt = prompt_header + words_text + "\n\n【经 RAG 检索提取的高相关度参考文本片段】：\n" + context_text

            # 【优化2】：直接调用封装好的 core_llm 函数
            sys_prompt = "你是一个严谨的词汇分析与提取引擎。请严格按照要求输出 Markdown 格式的纯文本列表。"
            result_text = call_deepseek_api(system_prompt=sys_prompt, user_prompt=prompt, model=model, temperature=0.2)
            
            try:
                atomic_write(save_path, result_text, data_type='text')
                msg = f"[INFO] 提取与分类完成！词库文件已原子级落盘至: {save_path}"
                if project_save_path:
                    shutil.copy2(save_path, project_save_path)
                    msg += f"\n已同步备份至项目目录: {project_save_path}"
                log_func(msg)
                return True
            except Exception as e:
                log_func(f"[ERROR] 词库文件落盘失败: {e}")
                raise
            
        except Exception as e:
            log_func(f"[ERROR] 分析失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

def run_headless(target_file, project_name=None, model="deepseek-v4-flash"):
    import sys
    if os.path.isabs(target_file):
        original_path = target_file
    else:
        original_path = os.path.join(REFERENCE_DIR, target_file)
        
    if not os.path.exists(original_path):
        print(f"error: 未找到参考小说原文 {original_path}")
        sys.exit(1)
    
    print(f"开始静默执行词库清洗与多维提取: {original_path}")
    success = KeywordBaseApp.execute_extraction(original_path, model, print, project_name)
    if success:
        print("词库清洗任务成功完成。")
    else:
        sys.exit(1)

if __name__ == "__main__":
    safe_run_app(
        app_class=KeywordBaseApp,
        headless_func=run_headless,
        target_file="",
        project_name="",
        model=""
    )
