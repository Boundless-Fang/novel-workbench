import os
import json
import shutil

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import BASE_DIR, PROJECT_ROOT, REFERENCE_DIR, STYLE_DIR, PROJ_DIR
from core._core_llm import call_deepseek_api
from core._core_utils import atomic_write, smart_read_text
from core._core_rag import RAGRetriever

class SettingCompletionApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass

    @staticmethod
    def execute_completion(original_path, mode, json_data, model, log_func, project_name=None):
        log_func(f"正在进行【{mode}】模式设定推演 (柔性多源聚合版)...")
        
        target_dir = PROJ_DIR
        if project_name:
            target_dir = os.path.join(PROJ_DIR, project_name)
            try:
                os.makedirs(target_dir, exist_ok=True)
            except OSError as e:
                log_func(f"[ERROR] 创建项目目录失败: {str(e)}")
                return False

        # 1. 尝试进行 RAG 检索 (柔性降级，解除硬性阻塞)
        context_text = "无原著参考文本。"
        if original_path and str(original_path).strip():
            novel_name = os.path.splitext(os.path.basename(original_path))[0]
            style_dir = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation")
            rag_db_dir = os.path.join(style_dir, "global_rag_db")
            
            index_path = os.path.join(rag_db_dir, "vector.index")
            chunks_path = os.path.join(rag_db_dir, "chunks.json")

            if os.path.exists(index_path) and os.path.exists(chunks_path):
                log_func("检测到参考小说 RAG 索引，尝试加载...")
                try:
                    retriever = RAGRetriever()
                    index, chunks = retriever.load_index(index_path, chunks_path)
                    log_func(f"已加载索引，包含 {len(chunks)} 个文本块。")

                    queries = []
                    if mode == "worldview":
                        for key, value in json_data.items():
                            if value and str(value).strip():
                                 queries.append(str(value).strip())
                        queries.extend(["世界观", "力量体系", "境界", "宗门", "历史", "传说", "地图", "势力"])
                        
                    elif mode == "character":
                        char_name = json_data.get("name", "")
                        if char_name:
                            queries.append(char_name)
                            queries.extend([
                                f"{char_name} 外貌", f"{char_name} 性格", f"{char_name} 身份", 
                                f"{char_name} 说话", f"{char_name} 战斗", f"{char_name} 经历"
                            ])
                        for key, value in json_data.items():
                            if value and str(value).strip() and key != "name":
                                queries.append(str(value).strip())

                    if queries:
                        log_func(f"正在基于 {len(queries)} 个关键信息点进行 RAG 检索...")
                        retrieved_chunks = retriever.search(index, chunks, queries, k=5, batch_size=5)
                        if retrieved_chunks:
                            context_text = "\n...\n".join(retrieved_chunks[:40])
                            log_func(f"成功召回 {min(len(retrieved_chunks), 40)} 个高相关度片段。")
                        else:
                            log_func("[WARN] RAG 检索未命中有效片段。")
                except (OSError, RuntimeError, ValueError) as e:
                    log_func(f"[WARN] RAG 模块发生异常，已降级忽略: {str(e)}")
            else:
                log_func("[INFO] 未检测到参考小说 RAG 索引，系统进入无参考推演模式。")
        else:
            log_func("[INFO] 未提供参考原文路径，系统进入纯原创推演模式。")

        # 2. 收集本地已有设定上下文矩阵 (核心新增逻辑)
        local_settings_context = ""
        log_func("正在扫描当前工程的已有设定...")
        try:
            ws_path = os.path.join(target_dir, "world_settings.md")
            if os.path.exists(ws_path):
                ws_content = smart_read_text(ws_path)
                if ws_content and len(ws_content.strip()) > 10:
                    local_settings_context += f"【世界观设定】:\n{ws_content}\n\n"

            char_dir = os.path.join(target_dir, "character_profiles")
            if os.path.exists(char_dir):
                char_files = [f for f in os.listdir(char_dir) if f.endswith(".md")]
                for cf in char_files:
                    cf_path = os.path.join(char_dir, cf)
                    cf_content = smart_read_text(cf_path)
                    if cf_content and len(cf_content.strip()) > 10:
                        # 截断单张角色卡长度，保留核心信息，防止触发 OOM
                        local_settings_context += f"【角色卡 - {cf.replace('.md', '')}】:\n{cf_content[:800]}\n\n"

            if not local_settings_context.strip():
                local_settings_context = "暂无本地设定数据。"
            else:
                # 整体截断保护，防止大模型 Context 溢出
                if len(local_settings_context) > 15000:
                    local_settings_context = local_settings_context[:15000] + "\n...[设定数据过长，已执行安全截断]"
                log_func("已成功提取本地工程上下文矩阵。")
        except (OSError, ValueError) as e:
            log_func(f"[WARN] 本地设定提取由于底层 I/O 异常中断，已忽略: {str(e)}")
            local_settings_context = "暂无本地设定数据。"

        # 3. 终极空载校验 (防呆拦截)
        valid_json_values = [v for k, v in json_data.items() if v and str(v).strip()]
        if not valid_json_values and context_text == "无原著参考文本。" and local_settings_context == "暂无本地设定数据。":
            log_func("[ERROR] 系统拦截：缺乏任何可供推演的上下文基准（无有效前端输入、无参考原著、无本地设定），拒绝执行推演。")
            return False

        # 4. 动态构建 Prompt 提示词
        if mode == "worldview":
            save_path = os.path.join(target_dir, "world_settings.md")
            prompt_header = """【系统指令】：
用户提供了小说的部分世界观设定。请你阅读参考文本以及本地已有设定，结合用户已给出的设定，将其余空缺部分补全。
如果有无法从文本中得出的信息，请基于小说的基础逻辑进行合理推演，并在补全项后标注“（推演补全）”。
必须输出完整的 Markdown 结构。

【当前工程已有本地设定】：
{local_context}

【参考原文片段 (RAG 检索)】：
{rag_context}

【用户已提供的设定】：
"""
            prompt = prompt_header.format(local_context=local_settings_context, rag_context=context_text) + json.dumps(json_data, ensure_ascii=False, indent=2)

        elif mode == "character":
            char_name = json_data.get("name", "未知角色")
            char_dir = os.path.join(target_dir, "character_profiles")
            try:
                os.makedirs(char_dir, exist_ok=True)
            except OSError as e:
                log_func(f"[ERROR] 角色目录创建失败: {str(e)}")
                return False
                
            save_path = os.path.join(char_dir, f"{char_name}.md")
            prompt_header = f"""【系统指令】：
用户提供了角色【{char_name}】的部分设定。请结合已有设定和原文片段，补全该角色缺失的信息（包括未填写的相关信息、价值观排序、语言习惯等）。
必须严格遵循本地已有世界观，如果在文本中确实没有提及，请填“未知”。必须使用标准的 Markdown 结构输出全套角色信息卡。

【当前工程已有本地设定】：
{{local_context}}

【参考原文片段 (RAG 检索)】：
{{rag_context}}

【用户已提供的部分设定】：
"""
            prompt = prompt_header.format(local_context=local_settings_context, rag_context=context_text) + json.dumps(json_data, ensure_ascii=False, indent=2)

        sys_prompt = "你是一个严谨的设定补全专家。只允许输出 Markdown 格式的纯文本。"

        try:
            result_text = call_deepseek_api(system_prompt=sys_prompt, user_prompt=prompt, model=model, temperature=0.4)
            atomic_write(save_path, result_text, data_type='text')
            log_func(f"[INFO] 补全完成！文件已原子级落盘至: {save_path}")
            return True
        except RuntimeError as e:
            log_func(f"[ERROR] LLM API 调用或底层处理失败: {str(e)}")
            return False

def run_headless(target_file, mode, json_data, project_name=None, model="deepseek-v4-flash"):
    import sys
    import base64
    
    # 健壮性防线一：拦截空载 payload
    if not json_data or not str(json_data).strip():
        print("[ERROR] 业务级拦截：接收到的表单数据为空，拒绝执行大模型推演。")
        sys.exit(1)

    if isinstance(json_data, str):
        # 健壮性防线二：安全解码 Base64 负载
        if json_data.startswith("b64:"):
            try:
                json_data = base64.b64decode(json_data[4:]).decode('utf-8')
            except Exception as e:
                print(f"[ERROR] 业务级拦截：Base64 负载解码失败 ({str(e)})")
                sys.exit(1)
                
        # 健壮性防线三：安全捕获 JSON 解析异常，防止进程裸崩
        try:
            json_data = json.loads(json_data)
        except json.JSONDecodeError as e:
            print(f"[ERROR] 业务级拦截：前端传入的数据结构损坏或解析失败 ({str(e)})")
            sys.exit(1)
            
    # 健壮性防线四：确保最终传递给大模型的是合法的字典结构
    if not isinstance(json_data, dict):
        print("[ERROR] 业务级拦截：表单数据结构非法，要求为字典 (dict) 结构。")
        sys.exit(1)
        
    print(f"开始静默执行设定补全 (模式: {mode})")
    success = SettingCompletionApp.execute_completion(target_file, mode, json_data, model, print, project_name)
    if not success: 
        sys.exit(1)

if __name__ == "__main__":
    safe_run_app(
        app_class=SettingCompletionApp,
        headless_func=run_headless,
        target_file="",
        mode="",
        json_data="",
        project_name="",
        model=""
    )
