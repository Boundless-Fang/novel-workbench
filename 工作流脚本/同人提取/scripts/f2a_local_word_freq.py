import os
import math
from collections import Counter
import jieba

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import BASE_DIR, PROJECT_ROOT, REFERENCE_DIR, STYLE_DIR, PROJ_DIR
from core._core_utils import smart_yield_text, atomic_write

PUNCTUATIONS = set("，。！？；：“”‘’（）【】《》、\n\r \t.!?,-[]")

class WordFreqAnalyzerApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass # 此方法已完全交由 Web API 层通过 run_headless 静默执行

def run_headless(target_file):
    import sys
    if not os.path.exists(target_file):
        sys.exit(1)
        
    novel_name = os.path.splitext(os.path.basename(target_file))[0]
    out_dir = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation", "statistics")
    os.makedirs(out_dir, exist_ok=True)

    word_counts = Counter()
    total_valid_count = 0
    
    for content_chunk in smart_yield_text(target_file):
        chunk_valid_words = []
        for w in jieba.cut(content_chunk):
            w = w.strip()
            if w and w not in PUNCTUATIONS:
                chunk_valid_words.append(w)
        word_counts.update(chunk_valid_words)
        total_valid_count += len(chunk_valid_words)

    if total_valid_count <= 1:
        sys.exit(0)

    unique = len(word_counts)
    log_ttr = math.log10(unique) / math.log10(total_valid_count) if total_valid_count > 1 else 0
    top_n = max(100, min(8000, int(50 * log_ttr * (total_valid_count ** (1/3.0)))))

    counts = word_counts.most_common(top_n)
    report = [f"【高频词列表 (提取前 {top_n} 个)】\n" + "-"*40]
    
    for i in range(0, len(counts), 5):
        chunk = counts[i:i + 5]
        report.append("  ".join([f"{w}({c})" for w, c in chunk]))

    save_path = os.path.join(out_dir, "高频词.txt")
    atomic_write(save_path, "\n".join(report), data_type='text')

if __name__ == "__main__":
    safe_run_app(app_class=WordFreqAnalyzerApp, headless_func=run_headless, target_file="")
