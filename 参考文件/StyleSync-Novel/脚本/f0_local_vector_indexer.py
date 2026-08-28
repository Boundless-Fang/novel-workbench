import os
import sys
import json
import numpy as np
import faiss
import re
import gc

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import REFERENCE_DIR, STYLE_DIR
from core._core_utils import smart_read_text, atomic_write, safe_faiss_read_index
from core._core_rag import RAGRetriever

class GlobalIndexerGUI(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass

    @staticmethod
    def split_by_chapters_smart(text, threshold=2000):
        """
        【核心重构：绝对边界熔断机制】
        阈值严控在 2000 字以内。如果按章节切分后单章依然超标，
        则强制打入 fallback_chunking 进行无尽切割，彻底杜绝 API 400 报错。
        """
        pattern = r'\n(第[零一二三四五六七八九十百千万\d]+[章卷回节].*?)\n'
        matches = list(re.finditer(pattern, "\n" + text))
        
        chunks_metadata = []
        if not matches:
            return GlobalIndexerGUI.fallback_chunking(text, max_len=threshold, overlap=200)

        for i in range(len(matches)):
            start_pos = matches[i].start()
            end_pos = matches[i+1].start() if i + 1 < len(matches) else len(text)
            
            chapter_title = matches[i].group(1).strip()
            chapter_content = text[start_pos:end_pos].strip()
            chapter_len = len(chapter_content)

            if chapter_len <= threshold:
                chunks_metadata.append({
                    "text": chapter_content,
                    "metadata": {"chapter": chapter_title, "index": i}
                })
            else:
                # 触发熔断：章节字数大于安全阈值，使用 fallback_chunking 强行粉碎
                sub_chunks = GlobalIndexerGUI.fallback_chunking(chapter_content, max_len=threshold, overlap=200)
                for part_idx, sub_item in enumerate(sub_chunks):
                    chunks_metadata.append({
                        "text": sub_item["text"],
                        "metadata": {
                            "chapter": chapter_title,
                            "index": i,
                            "part": part_idx + 1
                        }
                    })
        return chunks_metadata

    @staticmethod
    def fallback_chunking(text, max_len=2000, overlap=200):
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
        chunks = []
        current_chunk = ""
        for p in paragraphs:
            # 极端异常兜底：如果单段文字连换行都没有且超过最大阈值，执行无情物理切片
            if len(p) > max_len:
                if current_chunk: 
                    chunks.append(current_chunk.strip())
                    current_chunk = ""
                for i in range(0, len(p), max_len - overlap):
                    slice_text = p[i:i + max_len]
                    if slice_text.strip():
                        chunks.append(slice_text.strip())
                continue

            if len(current_chunk) + len(p) <= max_len:
                current_chunk += p + "\n"
            else:
                if current_chunk: chunks.append(current_chunk.strip())
                current_chunk = current_chunk[-overlap:] + p + "\n" if len(current_chunk) > overlap else p + "\n"
        if current_chunk: chunks.append(current_chunk.strip())
        return [{"text": c, "metadata": {"chapter": "unknown"}} for c in chunks if c.strip()]

    @staticmethod
    def stream_chapters_blocks(filepath, start_offset, block_size=1500000):
        pattern = re.compile(r'^(第[零一二三四五六七八九十百千万\d]+[章卷回节].*?)$')
        
        encodings_to_try = ['utf-8', 'gb18030', 'utf-16']
        target_encoding = 'utf-8'
        for enc in encodings_to_try:
            try:
                with open(filepath, 'r', encoding=enc) as f:
                    f.read(100)
                target_encoding = enc
                break
            except UnicodeDecodeError:
                continue

        with open(filepath, 'r', encoding=target_encoding, errors='ignore') as f:
            f.seek(start_offset)
            buffer = ""
            start_chap = "卷首/开篇"
            current_chap = "卷首/开篇"

            while True:
                current_pos = f.tell()
                line = f.readline()
                
                if not line:
                    if buffer.strip():
                        yield buffer.strip(), current_pos, start_chap, current_chap
                    break

                stripped_line = line.strip()
                is_chapter = bool(pattern.match(stripped_line))

                if is_chapter:
                    if len(buffer) >= block_size:
                        yield buffer.strip(), current_pos, start_chap, current_chap
                        buffer = line
                        start_chap = stripped_line
                        current_chap = stripped_line
                        continue
                    else:
                        current_chap = stripped_line
                        if start_chap == "卷首/开篇":
                            start_chap = stripped_line

                buffer += line

    @staticmethod
    def merge_index_parts(rag_db_dir, total_parts, log_func):
        log_func("[INFO] 正在将所有临时碎片组装为全局向量库...")
        all_chunks = []
        main_index = None

        for p in range(1, total_parts + 1):
            idx_path = os.path.join(rag_db_dir, f"part_{p}.index")
            json_path = os.path.join(rag_db_dir, f"chunks_part_{p}.json")
            
            if not os.path.exists(idx_path) or not os.path.exists(json_path):
                continue
                
            with open(json_path, 'r', encoding='utf-8') as f:
                part_chunks = json.load(f)
                all_chunks.extend(part_chunks)
                
            part_index = safe_faiss_read_index(idx_path)
            if main_index is None:
                main_index = faiss.IndexFlatL2(part_index.d)
            
            vectors = np.zeros((part_index.ntotal, part_index.d), dtype=np.float32)
            part_index.reconstruct_n(0, part_index.ntotal, vectors)
            main_index.add(vectors)
            
            del part_index
            del vectors
            gc.collect()

        final_index_path = os.path.join(rag_db_dir, "vector.index")
        final_chunks_path = os.path.join(rag_db_dir, "chunks.json")
        
        atomic_write(final_chunks_path, all_chunks, data_type='json')
        atomic_write(final_index_path, main_index, data_type='faiss')
        
        for p in range(1, total_parts + 1):
            try:
                os.remove(os.path.join(rag_db_dir, f"part_{p}.index"))
                os.remove(os.path.join(rag_db_dir, f"chunks_part_{p}.json"))
            except OSError:
                pass
        
        cp_path = os.path.join(rag_db_dir, "checkpoint.json")
        if os.path.exists(cp_path):
            os.remove(cp_path)
            
        log_func(f"[INFO] 碎片合并完毕，全局 RAG 索引落盘成功！共包含 {len(all_chunks)} 个文本块。")

    @staticmethod
    def run_indexing(target_file, log_func=print):
        target_file = str(target_file or "").strip()
        if re.search(r'[\r\n\t\x00]', target_file):
            log_func("[ERROR] 输入文件名包含非法控制字符，请重新选择参考文件。")
            return False

        if os.path.isabs(target_file):
            original_path = target_file
        else:
            original_path = os.path.join(REFERENCE_DIR, target_file)

        if not os.path.exists(original_path):
            log_func(f"[ERROR] 未找到目标文件: {original_path}")
            return False

        novel_name = os.path.splitext(os.path.basename(original_path))[0]
        novel_name = re.sub(r'[\r\n\t\x00]', '', novel_name).strip()
        if not novel_name:
            log_func("[ERROR] 目标文件名无效，无法创建风格库目录。")
            return False
        style_dir = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation")
        rag_db_dir = os.path.join(style_dir, "global_rag_db")
        os.makedirs(rag_db_dir, exist_ok=True)

        file_size = os.path.getsize(original_path)
        THRESHOLD_10MB = 10 * 1024 * 1024

        if file_size < THRESHOLD_10MB:
            log_func(f"[INFO] 文件尺寸 ({file_size/1024/1024:.2f} MB) < 10MB，触发内存直通车极速模式...")
            text = smart_read_text(original_path)
            processed_chunks = GlobalIndexerGUI.split_by_chapters_smart(text, threshold=2000)
            chunk_texts = [item["text"] for item in processed_chunks]
            
            retriever = RAGRetriever()
            embedder = retriever.get_embedder()
            embeddings = embedder.encode(chunk_texts, batch_size=8, show_progress_bar=True)

            dimension = embeddings.shape[1]
            index = faiss.IndexFlatL2(dimension)
            index.add(np.array(embeddings).astype('float32'))

            index_path = os.path.join(rag_db_dir, "vector.index")
            chunks_path = os.path.join(rag_db_dir, "chunks.json")
            
            try:
                atomic_write(chunks_path, processed_chunks, data_type='json')
                atomic_write(index_path, index, data_type='faiss')
            except Exception as e:
                log_func(f"[ERROR] 索引文件落盘失败: {e}")
                return False
                
            log_func(f"[INFO] 全局 RAG 索引构建成功，已保存至: {rag_db_dir}")
            return True
            
        else:
            log_func(f"[WARN] 文件尺寸 ({file_size/1024/1024:.2f} MB) >= 10MB，切入防 OOM 的流式语义切割微批次模式...")
            
            checkpoint_path = os.path.join(rag_db_dir, "checkpoint.json")
            start_offset = 0
            current_part = 1
            
            if os.path.exists(checkpoint_path):
                try:
                    with open(checkpoint_path, 'r', encoding='utf-8') as f:
                        cp = json.load(f)
                        start_offset = cp.get("offset", 0)
                        current_part = cp.get("part", 1)
                    log_func(f"[INFO] 检测到中断标记！将从文件分片 Part {current_part} 处恢复处理，跳过已完成算力。")
                except Exception:
                    pass
            
            retriever = RAGRetriever()
            embedder = retriever.get_embedder()
            
            for block_text, offset, start_chap, end_chap in GlobalIndexerGUI.stream_chapters_blocks(original_path, start_offset, block_size=1500000):
                log_func(f"\n=======================================================")
                log_func(f">>> [阶段任务 {current_part}] 正在向量化: 【{start_chap}】 至 【{end_chap}】")
                log_func(f"=======================================================")

                processed_chunks = GlobalIndexerGUI.split_by_chapters_smart(block_text, threshold=2000)
                batch_texts = [item["text"] for item in processed_chunks]
                batch_metadata = [{"text": item["text"], "metadata": {"chapter": f"Part {current_part}", "offset_marker": offset}} for item in processed_chunks]

                embeddings = embedder.encode(batch_texts, batch_size=8, show_progress_bar=True)
                
                dimension = embeddings.shape[1]
                part_index = faiss.IndexFlatL2(dimension)
                part_index.add(np.array(embeddings).astype('float32'))
                
                atomic_write(os.path.join(rag_db_dir, f"part_{current_part}.index"), part_index, data_type='faiss')
                with open(os.path.join(rag_db_dir, f"chunks_part_{current_part}.json"), 'w', encoding='utf-8') as f:
                    json.dump(batch_metadata, f, ensure_ascii=False, indent=2)
                    
                current_part += 1
                with open(checkpoint_path, 'w', encoding='utf-8') as f:
                    json.dump({"offset": offset, "part": current_part}, f)
                    
                del embeddings
                del part_index
                del batch_texts
                del batch_metadata
                del processed_chunks
                gc.collect()
            
            GlobalIndexerGUI.merge_index_parts(rag_db_dir, current_part - 1, log_func)
            return True

def run_headless(target_file):
    if not os.path.exists(target_file):
        print(f"[ERROR] 未找到目标文件: {target_file}")
        sys.exit(1)
        
    success = GlobalIndexerGUI.run_indexing(target_file, log_func=lambda msg: print(msg, flush=True))
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    safe_run_app(app_class=GlobalIndexerGUI, headless_func=run_headless, target_file="")