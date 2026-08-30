import os
import re
import shutil
import math
import statistics
from collections import Counter
import jieba
import jieba.posseg as pseg

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import BASE_DIR, PROJECT_ROOT, REFERENCE_DIR, STYLE_DIR, PROJ_DIR
from core._core_utils import smart_read_text, smart_yield_text, atomic_write

PUNCTUATIONS = set("，。！？；：“”‘’（）【】《》、\n\r \t.!?,-[]")

class WelfordStats:
    """
    Welford's Online Algorithm (流式统计算法)
    用于在不保存全量数组的情况下，动态且极低内存地计算样本的数量、平均值与总体标准差。
    """
    def __init__(self):
        self.count = 0
        self.mean = 0.0
        self.m2 = 0.0

    def update(self, val):
        self.count += 1
        delta = val - self.mean
        self.mean += delta / self.count
        delta2 = val - self.mean
        self.m2 += delta * delta2

    def variance(self):
        if self.count < 1: 
            return 0.0
        return self.m2 / self.count

    def std_dev(self):
        return math.sqrt(self.variance())

class NovelMetricsAnalyzerApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass # 此方法已完全交由 Web API 层通过 run_headless 静默执行

    @staticmethod
    def run_analysis(file_path, log_func=print):
        if not file_path:
            log_func("[ERROR] 请先选择小说源文件！")
            return False

        try:
            novel_name = os.path.splitext(os.path.basename(file_path))[0]
            style_novel_dir = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation")
            os.makedirs(style_novel_dir, exist_ok=True)
            
            ref_path = os.path.join(style_novel_dir, "reference.txt")
            if not os.path.exists(ref_path):
                shutil.copy2(file_path, ref_path)
                log_func(">> 已自动备份原文至 reference.txt")

            out_dir = os.path.join(style_novel_dir, "statistics")
            os.makedirs(out_dir, exist_ok=True)

            log_func(f"开始分析《{novel_name}》物理指标 (流式处理)...")
            
            # 使用 smart_yield_text 替代一次性读取
            p_stats = WelfordStats()
            s_stats = WelfordStats()
            c_stats = WelfordStats()
            punc_counts = Counter()
            pos_counter = Counter()
            quote_lengths = []
            
            front, mid, rear, none = 0, 0, 0, 0
            speak_verbs = ['说', '道', '问', '答', '叹', '喊', '吼', '笑']
            
            unique_words = set()
            total_tokens = 0
            total_chars = 0
            total_pos = 0

            s_pattern = re.compile(r'[。！？]+|(?<!\d)[.!?]+(?!\d)')
            c_pattern = re.compile(r'[，。！？；]+|(?<!\d)[.,!?;]+(?!\d)')

            for content_chunk in smart_yield_text(file_path):
                total_chars += len(content_chunk)
                
                # 1. 长度统计
                for line in content_chunk.split('\n'):
                    line = line.strip()
                    if not line: continue
                    p_stats.update(len(line))
                    
                    # 句长
                    start = 0
                    for match in s_pattern.finditer(line):
                        segment = line[start:match.start()].strip()
                        if segment: s_stats.update(len(segment))
                        start = match.end()
                    if start < len(line):
                        segment = line[start:].strip()
                        if segment: s_stats.update(len(segment))
                        
                    # 断句长
                    start = 0
                    for match in c_pattern.finditer(line):
                        segment = line[start:match.start()].strip()
                        if segment: c_stats.update(len(segment))
                        start = match.end()
                    if start < len(line):
                        segment = line[start:].strip()
                        if segment: c_stats.update(len(segment))

                # 2. 标点统计
                punc_counts.update(c for c in content_chunk if c in PUNCTUATIONS and re.match(r'[，。！？；：“”‘’（）《》、\.\,\?\!\:\;\-\[\]]', c))

                # 3. 对话统计
                quotes_iter = re.finditer(r'“([^”]*)”', content_chunk)
                for m in quotes_iter:
                    quote_lengths.append(len(m.group(1)))
                
                for p in content_chunk.split('\n'):
                    p = p.strip()
                    if not p: continue
                    q_in_p = re.findall(r'“([^”]*)”', p)
                    if not q_in_p: continue
                    has_verb = any(v in p for v in speak_verbs)
                    if len(q_in_p) == 1:
                        if p.startswith('“') and p.endswith('”') and not has_verb: none += 1
                        elif p.endswith('”') and has_verb: front += 1
                        elif p.startswith('“') and has_verb: rear += 1
                        else: none += 1
                    elif len(q_in_p) >= 2:
                        if has_verb: mid += 1
                        else: none += 1

                # 4. TTR 统计
                for w in jieba.cut(content_chunk):
                    w = w.strip()
                    if w and w not in PUNCTUATIONS:
                        total_tokens += 1
                        unique_words.add(w)

                # 5. 词性统计
                for w, flag in pseg.cut(content_chunk):
                    w = w.strip()
                    if not w or w in PUNCTUATIONS: continue
                    if flag.startswith('n'): pos_counter['名词'] += 1
                    elif flag.startswith('v'): pos_counter['动词'] += 1
                    elif flag.startswith('a'): pos_counter['形容词'] += 1
                    elif flag.startswith('d'): pos_counter['副词'] += 1
                    elif flag.startswith('r'): pos_counter['代词'] += 1
                    elif flag.startswith('u'): pos_counter['助词'] += 1
                    elif flag.startswith('p'): pos_counter['介词'] += 1
                    elif flag.startswith('c'): pos_counter['连词'] += 1
                    elif flag.startswith('m') or flag.startswith('q'): pos_counter['数量词'] += 1
                    else: pos_counter['其他'] += 1
                    total_pos += 1

            # 生成报告
            report = []
            report.append("【一、 文本骨架长度统计】")
            report.append(f"段落总数：{p_stats.count} 段")
            report.append(f"- 平均段落长度：{p_stats.mean:.2f} 字 (标准差: {p_stats.std_dev():.2f})")
            report.append(f"- 平均完整句长度：{s_stats.mean:.2f} 字 (标准差: {s_stats.std_dev():.2f})")
            report.append(f"- 平均断句(单句)长度：{c_stats.mean:.2f} 字 (标准差: {c_stats.std_dev():.2f})\n")

            total_punc = sum(punc_counts.values())
            report.append("【二、 标点符号使用率】")
            if total_punc > 0:
                report.append(f"总字数(含符号)：{total_chars} | 符号总数：{total_punc}")
                report.append(f"符号密度：{(total_punc / total_chars) * 100:.2f}%")
                report.append("常见符号占比(Top 10)：")
                for p, count in punc_counts.most_common(10):
                    report.append(f"  {p} : {count} 次 ({count / total_punc * 100:.2f}%)")
            else:
                report.append("未检测到有效标点。")
            report.append("")

            total_quotes = len(quote_lengths)
            report.append("【三、 对话结构偏好分析】")
            if total_quotes > 0:
                avg_quote_len = sum(quote_lengths) / total_quotes
                total_tags = front + mid + rear + none or 1
                report.append(f"双引号频率：共 {total_quotes} 次")
                report.append(f"引号内平均字数：{avg_quote_len:.2f} 字")
                report.append(f"- 前置: {front} 次 ({front / total_tags * 100:.1f}%)")
                report.append(f"- 中置: {mid} 次 ({mid / total_tags * 100:.1f}%)")
                report.append(f"- 后置: {rear} 次 ({rear / total_tags * 100:.1f}%)")
                report.append(f"- 无提示语: {none} 次 ({none / total_tags * 100:.1f}%)")
            else:
                report.append("未检测到双引号。")
            report.append("")

            report.append("【四、 词汇丰富度指标】")
            if total_tokens > 1:
                unique_count = len(unique_words)
                log_ttr = math.log10(unique_count) / math.log10(total_tokens)
                root_ttr = unique_count / math.sqrt(total_tokens)
                report.append(f"有效总词数(Tokens): {total_tokens} | 独立词汇数(Types): {unique_count}")
                report.append(f"- 对数 TTR: {log_ttr:.4f}")
                report.append(f"- 根号 TTR: {root_ttr:.2f}")
                report.append(f"- 基础篇幅重复率: {(1.0 - (unique_count / total_tokens)) * 100:.2f}%")
            else:
                report.append("文本过少，无法统计。")
            report.append("")

            report.append("【五、 宏观词性分布比例】")
            if total_pos > 0:
                for pos, count in pos_counter.most_common():
                    report.append(f"  {pos} : {count / total_pos * 100:.2f}%")
            else:
                report.append("无法统计词性分布。")
            report.append("")

            save_path = os.path.join(out_dir, "统计指标.txt")
            atomic_write(save_path, "\n".join(report), data_type='text')

            log_func(f"\n[INFO] 指标计算完成！文件保存至: {save_path}")
            return True
        except Exception as e:
            log_func(f"[ERROR] 错误: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

def run_headless(target_file):
    import sys
    if not os.path.exists(target_file):
        print(f"[ERROR] 未找到目标文件: {target_file}")
        sys.exit(1)
        
    success = NovelMetricsAnalyzerApp.run_analysis(target_file)
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    safe_run_app(app_class=NovelMetricsAnalyzerApp, headless_func=run_headless, target_file="")
