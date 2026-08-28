import os
import re
import shutil
import json
from collections import Counter
import jieba
import jieba.posseg as pseg
import faiss
import numpy as np
import gc

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import REFERENCE_DIR, STYLE_DIR, PROJ_DIR
from core._core_utils import smart_read_text, atomic_write, safe_faiss_read_index
from core._core_rag import RAGRetriever

class LocalPlotCompressionApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass 

    @staticmethod
    def load_global_vocab(vocab_path):
        vocab_list = []
        if os.path.exists(vocab_path):
            content = smart_read_text(vocab_path)
            matches = re.findall(r'-\s*(.*?)[：:]', content)
            vocab_list = [m.strip() for m in matches if m.strip()]
        return vocab_list

    @staticmethod
    def extract_chunk_keywords(chunk_text, global_vocab, top_n=20):
        keyword_counts = Counter()
        for word in global_vocab:
            count = chunk_text.count(word)
            if count > 0:
                keyword_counts[word] += count
                
        if len(keyword_counts) < top_n // 2:
            sub_chunk_size = 2000
            for i in range(0, len(chunk_text), sub_chunk_size):
                sub_text = chunk_text[i:i+sub_chunk_size]
                try:
                    words = pseg.cut(sub_text)
                    for w, flag in words:
                        if len(w) >= 2 and flag in ['nr', 'ns', 'nt']:
                            keyword_counts[w] += 1
                except Exception:
                    pass
                    
        return [word for word, count in keyword_counts.most_common(top_n)]

    @staticmethod
    def split_by_chapters(text, max_len=10000):
        pattern = r'\n(第[零一二三四五六七八九十百千万\d]+[章卷回节].*?)\n'
        segments = re.split(pattern, "\n" + text)
        
        chunks = []
        current_chunk_text = segments[0] if segments[0].strip() else ""
        current_titles = []
        
        for i in range(1, len(segments), 2):
            title = segments[i].strip()
            content = segments[i+1]
            
            current_titles.append(title)
            current_chunk_text += f"\n\n{title}\n{content}"
            
            if len(current_chunk_text) >= max_len:
                chunks.append({
                    "titles": current_titles,
                    "text": current_chunk_text.strip()
                })
                current_chunk_text = ""
                current_titles = []
                
        if current_chunk_text.strip():
            chunks.append({
                "titles": current_titles if current_titles else ["结尾部分"],
                "text": current_chunk_text.strip()
            })
            
        if not chunks:
            paragraphs = text.split('\n')
            temp_text = ""
            for p in paragraphs:
                temp_text += p + "\n"
                if len(temp_text) >= max_len:
                    chunks.append({"titles": ["无章节片段"], "text": temp_text.strip()})
                    temp_text = ""
            if temp_text.strip():
                chunks.append({"titles": ["无章节片段"], "text": temp_text.strip()})
                
        return chunks

    @staticmethod
    def stream_chapters_blocks(filepath, start_offset, block_size=10000):
        pattern = re.compile(r'^(第[零一二三四五六七八九十百千万\d]+[章卷回节].*?)$')
        
        # 完美套用 core_utils 中的多编码自适应探测逻辑
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
            titles = []
            
            while True:
                line = f.readline()
                if not line:
                    if buffer.strip():
                        yield {"titles": titles if titles else ["无名片段"], "text": buffer.strip()}, f.tell()
                    break
                
                stripped_line = line.strip()
                if pattern.match(stripped_line):
                    titles.append(stripped_line)
                    
                buffer += line
                
                if len(buffer) >= block_size:
                    yield {"titles": titles if titles else ["合并片段"], "text": buffer.strip()}, f.tell()
                    buffer = ""
                    titles = []

    @staticmethod
    def merge_compression_parts(rag_db_dir, outline_path, total_parts, log_func):
        log_func("[INFO] 正在将所有分卷压缩索引与大纲碎片合并...")
        all_mapping = []
        main_index = None
        outline_content = ["# 核心事件与实体分布大纲 (重载流式合成版)\n"]

        for p in range(1, total_parts + 1):
            idx_path = os.path.join(rag_db_dir, f"part_{p}.index")
            map_path = os.path.join(rag_db_dir, f"map_part_{p}.json")
            out_path = os.path.join(rag_db_dir, f"outline_part_{p}.md")
            
            if not os.path.exists(idx_path) or not os.path.exists(map_path):
                continue
                
            with open(map_path, 'r', encoding='utf-8') as f:
                part_map = json.load(f)
                all_mapping.extend(part_map)
                
            part_index = safe_faiss_read_index(idx_path)
            if main_index is None:
                main_index = faiss.IndexFlatL2(part_index.d)
                
            vectors = np.zeros((part_index.ntotal, part_index.d), dtype=np.float32)
            part_index.reconstruct_n(0, part_index.ntotal, vectors)
            main_index.add(vectors)
            
            if os.path.exists(out_path):
                with open(out_path, 'r', encoding='utf-8') as f:
                    outline_content.append(f.read())
            
            del part_index
            del vectors
            gc.collect()

        for i, item in enumerate(all_mapping):
            item["id"] = i

        atomic_write(os.path.join(rag_db_dir, "summary_to_raw_mapping.json"), all_mapping, data_type='json')
        atomic_write(os.path.join(rag_db_dir, "plot_summary.index"), main_index, data_type='faiss')
        atomic_write(outline_path, "\n".join(outline_content), data_type='text')
        
        for p in range(1, total_parts + 1):
            for suffix in [".index", ".json", ".md"]:
                try: os.remove(os.path.join(rag_db_dir, f"part_{p}{suffix}" if suffix == ".index" else (f"map_part_{p}.json" if suffix == ".json" else f"outline_part_{p}.md")))
                except: pass
                
        cp_path = os.path.join(rag_db_dir, "checkpoint.json")
        if os.path.exists(cp_path):
            os.remove(cp_path)
            
        log_func("[INFO] 重载模式大纲合成与 RAG 建立完毕。")

    @staticmethod
    def execute_compression(original_path, chunk_size, log_func, project_name=None):
        novel_name = os.path.splitext(os.path.basename(original_path))[0]
        style_dir = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation")
        os.makedirs(style_dir, exist_ok=True)
        
        vocab_path = os.path.join(style_dir, "exclusive_vocab.md")
        rag_db_dir = os.path.join(style_dir, "hierarchical_rag_db")
        os.makedirs(rag_db_dir, exist_ok=True)
        
        faiss_index_path = os.path.join(rag_db_dir, "plot_summary.index")
        mapping_path = os.path.join(rag_db_dir, "summary_to_raw_mapping.json")
        outline_path = os.path.join(style_dir, "plot_outlines.md")
        
        project_dir = None
        if project_name:
            project_dir = os.path.join(PROJ_DIR, project_name)
            os.makedirs(project_dir, exist_ok=True)

        try:
            full_text = smart_read_text(original_path)
        except Exception as e:
            log_func(f"❌ 读取原文失败: {e}")
            return False

        global_vocab = LocalPlotCompressionApp.load_global_vocab(vocab_path)
        if not global_vocab:
            log_func("[WARN] 警告：未发现 f3a 专属词库，将完全依赖 Jieba 提取本章实体。")

        file_size = os.path.getsize(original_path)
        THRESHOLD_10MB = 10 * 1024 * 1024

        if file_size < THRESHOLD_10MB:
            log_func(f"[INFO] 文本 ({file_size/1024/1024:.2f} MB) 触发高速直通车模式...")
            chunks_data = LocalPlotCompressionApp.split_by_chapters(full_text, max_len=chunk_size)
            
            summaries = []
            mapping_data = []
            outline_content = ["# 核心事件与实体分布大纲 (本地伪摘要版)\n"]
            
            for idx, item in enumerate(chunks_data):
                titles_str = "、".join(item["titles"])
                keywords = LocalPlotCompressionApp.extract_chunk_keywords(item["text"], global_vocab)
                keywords_str = "，".join(keywords)
                
                pseudo_summary = f"包含章节：{titles_str}\n本阶段出场核心实体/高频词：{keywords_str}"
                summaries.append(pseudo_summary)
                
                mapping_data.append({
                    "id": idx,
                    "summary": pseudo_summary,
                    "raw_chunk": item["text"]
                })
                outline_content.append(f"### 叙事块 {idx+1}\n{pseudo_summary}\n")
                
            atomic_write(outline_path, "\n".join(outline_content), data_type='text')
            
            retriever = RAGRetriever()
            embedder = retriever.get_embedder()
            
            summary_embeddings = []
            for i in range(0, len(summaries), 50):
                batch = summaries[i:i+50]
                batch_embs = embedder.encode(batch, batch_size=8, show_progress_bar=False)
                summary_embeddings.extend(batch_embs)
                
            summary_embeddings_np = np.array(summary_embeddings).astype('float32')
            dimension = summary_embeddings_np.shape[1]
            index = faiss.IndexFlatL2(dimension)
            index.add(summary_embeddings_np)
            
            atomic_write(faiss_index_path, index, data_type='faiss')
            atomic_write(mapping_path, mapping_data, data_type='json')
            
        else:
            log_func(f"[WARN] 文本超过 10MB，切入防 OOM 流式提取构建模式...")
            checkpoint_path = os.path.join(rag_db_dir, "checkpoint.json")
            start_offset = 0
            current_part = 1
            global_chunk_idx = 0
            
            if os.path.exists(checkpoint_path):
                try:
                    with open(checkpoint_path, 'r', encoding='utf-8') as f:
                        cp = json.load(f)
                        start_offset = cp.get("offset", 0)
                        current_part = cp.get("part", 1)
                        global_chunk_idx = cp.get("chunk_idx", 0)
                    log_func(f"[INFO] 从游标 {start_offset} (Part {current_part}) 恢复断点续传。")
                except Exception:
                    pass

            retriever = RAGRetriever()
            embedder = retriever.get_embedder()
            
            batch_summaries = []
            batch_mapping = []
            batch_outline = []
            last_offset = start_offset
            
            for block_dict, offset in LocalPlotCompressionApp.stream_chapters_blocks(original_path, start_offset, chunk_size):
                titles_str = "、".join(block_dict["titles"])
                keywords = LocalPlotCompressionApp.extract_chunk_keywords(block_dict["text"], global_vocab)
                keywords_str = "，".join(keywords)
                
                pseudo_summary = f"包含章节：{titles_str}\n本阶段出场核心实体/高频词：{keywords_str}"
                
                batch_summaries.append(pseudo_summary)
                batch_mapping.append({
                    "id": global_chunk_idx,
                    "summary": pseudo_summary,
                    "raw_chunk": block_dict["text"]
                })
                batch_outline.append(f"### 叙事块 {global_chunk_idx+1}\n{pseudo_summary}\n")
                
                global_chunk_idx += 1
                last_offset = offset
                
                if len(batch_summaries) >= 500:
                    log_func(f"-> 正在压缩局部大纲卷宗 (Part {current_part})...")
                    embeddings = embedder.encode(batch_summaries, batch_size=8, show_progress_bar=False)
                    
                    dimension = embeddings.shape[1]
                    part_index = faiss.IndexFlatL2(dimension)
                    part_index.add(np.array(embeddings).astype('float32'))
                    
                    atomic_write(os.path.join(rag_db_dir, f"part_{current_part}.index"), part_index, data_type='faiss')
                    with open(os.path.join(rag_db_dir, f"map_part_{current_part}.json"), 'w', encoding='utf-8') as f:
                        json.dump(batch_mapping, f, ensure_ascii=False, indent=2)
                    with open(os.path.join(rag_db_dir, f"outline_part_{current_part}.md"), 'w', encoding='utf-8') as f:
                        f.write("\n".join(batch_outline))
                        
                    current_part += 1
                    with open(checkpoint_path, 'w', encoding='utf-8') as f:
                        json.dump({"offset": last_offset, "part": current_part, "chunk_idx": global_chunk_idx}, f)
                        
                    del embeddings
                    del part_index
                    del batch_summaries
                    del batch_mapping
                    del batch_outline
                    gc.collect()
                    
                    batch_summaries = []
                    batch_mapping = []
                    batch_outline = []

            if batch_summaries:
                embeddings = embedder.encode(batch_summaries, batch_size=8, show_progress_bar=False)
                dimension = embeddings.shape[1]
                part_index = faiss.IndexFlatL2(dimension)
                part_index.add(np.array(embeddings).astype('float32'))
                
                atomic_write(os.path.join(rag_db_dir, f"part_{current_part}.index"), part_index, data_type='faiss')
                with open(os.path.join(rag_db_dir, f"map_part_{current_part}.json"), 'w', encoding='utf-8') as f:
                    json.dump(batch_mapping, f, ensure_ascii=False, indent=2)
                with open(os.path.join(rag_db_dir, f"outline_part_{current_part}.md"), 'w', encoding='utf-8') as f:
                    f.write("\n".join(batch_outline))
                    
                del embeddings
                del part_index
                gc.collect()

            LocalPlotCompressionApp.merge_compression_parts(rag_db_dir, outline_path, current_part, log_func)

        msg = f"[INFO] 结构压缩与检索库全链完备。\n文件已落盘至: {style_dir}"
        if project_dir:
            p_outline = os.path.join(project_dir, "plot_outlines.md")
            shutil.copy2(outline_path, p_outline)
            
            p_rag_dir = os.path.join(project_dir, "hierarchical_rag_db")
            if os.path.exists(p_rag_dir):
                shutil.rmtree(p_rag_dir)
            shutil.copytree(rag_db_dir, p_rag_dir)
            msg += f"\n已同步大纲与检索库至项目核心目录: {project_dir}"
            
        log_func(msg)
        return True

def run_headless(target_file, project_name=None):
    import sys
    if os.path.isabs(target_file):
        original_path = target_file
    else:
        original_path = os.path.join(REFERENCE_DIR, target_file)
        
    if not os.path.exists(original_path):
        print(f"error: 未找到原文 {original_path}")
        sys.exit(1)
    
    print(f"开始静默执行本地章节合并与检索库构建: {original_path}")
    success = LocalPlotCompressionApp.execute_compression(original_path, 10000, print, project_name)
    if not success: sys.exit(1)

if __name__ == "__main__":
    safe_run_app(
        app_class=LocalPlotCompressionApp,
        headless_func=run_headless,
        target_file="",
        project_name=""
    )