import os
import json
import faiss
import numpy as np

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import PROJ_DIR
from core._core_utils import smart_read_text, atomic_write
from core._core_rag import RAGRetriever

class ProjectContextIndexerApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass # 此方法已完全交由 Web API 层通过 run_headless 静默执行

    @staticmethod
    def chunk_text(text, max_len=800):
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
        chunks, current_chunk = [], ""
        for p in paragraphs:
            if len(current_chunk) + len(p) <= max_len:
                current_chunk += p + "\n"
            else:
                if current_chunk: chunks.append(current_chunk.strip())
                current_chunk = p + "\n"
        if current_chunk: chunks.append(current_chunk.strip())
        return chunks

    @staticmethod
    def execute_indexing(project_name, log_func):
        target_dir = os.path.join(PROJ_DIR, project_name)
        if not os.path.exists(target_dir):
            log_func(f"[ERROR] 未找到工程目录: {target_dir}")
            return False

        content_dir = os.path.join(target_dir, "content")
        if not os.path.exists(content_dir):
            log_func(f"[WARN] 内容目录不存在，当前项目暂无正文需要索引。")
            return True

        # 读取所有章节并排序，确保逻辑连贯
        chapter_files = sorted([f for f in os.listdir(content_dir) if f.endswith(".txt")])
        if not chapter_files:
            log_func("[INFO] 尚未生成任何小说正文，跳过构建。")
            return True

        log_func(f"正在读取 {len(chapter_files)} 章历史正文数据...")
        all_chunks = []
        for f_name in chapter_files:
            content = smart_read_text(os.path.join(content_dir, f_name))
            if content:
                # 切块并携带章节元数据
                blocks = ProjectContextIndexerApp.chunk_text(content, max_len=1000)
                for block in blocks:
                    all_chunks.append({
                        "text": f"[{f_name.replace('.txt', '')}] {block}",
                        "raw_chunk": block
                    })

        if not all_chunks:
            log_func("[WARN] 提取到的有效文本块为空。")
            return True

        log_func(f"原文已切分为 {len(all_chunks)} 个上下文碎块，开始调用核心层进行向量化...")
        
        context_db_dir = os.path.join(target_dir, "context_rag_db")
        os.makedirs(context_db_dir, exist_ok=True)
        index_path = os.path.join(context_db_dir, "vector.index")
        chunks_path = os.path.join(context_db_dir, "chunks.json")

        try:
            retriever = RAGRetriever()
            embedder = retriever.get_embedder()
            
            chunk_texts = [item["text"] for item in all_chunks]
            embeddings = embedder.encode(chunk_texts, batch_size=8, show_progress_bar=False)
            
            dimension = embeddings.shape[1]
            index = faiss.IndexFlatL2(dimension)
            index.add(np.array(embeddings).astype('float32'))
            
            # 安全原子落盘
            try:
                atomic_write(index_path, index, data_type='faiss')
                atomic_write(chunks_path, all_chunks, data_type='json')
            except Exception as e:
                log_func(f"[ERROR] 向量库落盘失败: {e}")
                return False
                
            log_func(f"[INFO] 动态上下文向量库构建成功！落盘至: {context_db_dir}")
            return True
            
        except Exception as e:
            log_func(f"[ERROR] 向量化构建发生严重异常: {e}")
            import traceback
            traceback.print_exc()
            return False

def run_headless(project_name=""):
    import sys
    if not project_name:
        sys.exit(1)
        
    print(f"开始静默执行工程上下文 RAG 构建: [{project_name}]")
    success = ProjectContextIndexerApp.execute_indexing(project_name, print)
    if not success: sys.exit(1)

if __name__ == "__main__":
    safe_run_app(
        app_class=ProjectContextIndexerApp,
        headless_func=run_headless,
        project_name=""
    )
