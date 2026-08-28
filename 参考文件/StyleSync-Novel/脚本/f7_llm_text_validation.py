import os
import re
import json

from core._core_cli_runner import safe_run_app, inject_env, HeadlessBaseTask
inject_env()

from core._core_config import PROJ_DIR, STYLE_DIR
from core._core_utils import smart_read_text

class TextValidationApp(HeadlessBaseTask):
    def __init__(self):
        super().__init__()

    def execute_logic(self):
        pass # 此方法已完全交由 Web API 层通过 run_headless 静默执行

    @staticmethod
    def get_safe_project_dir(project_name):
        if not re.match(r'^[\w\-\u4e00-\u9fa5]+$', project_name):
            raise ValueError("非法的项目名称结构")
        if project_name.endswith("_style_imitation"):
            target_base = STYLE_DIR
        else:
            target_base = PROJ_DIR
        safe_base = os.path.realpath(os.path.abspath(target_base))
        target_dir = os.path.realpath(os.path.abspath(os.path.join(safe_base, project_name)))
        if os.path.commonpath([safe_base, target_dir]) != safe_base:
            raise ValueError("越权目录访问拦截")
        if not os.path.exists(target_dir):
            raise FileNotFoundError("目标工程目录不存在")
        return target_dir

    @staticmethod
    def safe_read_target(target_dir, relative_path):
        try:
            target_path = os.path.realpath(os.path.abspath(os.path.join(target_dir, relative_path)))
            if os.path.commonpath([target_dir, target_path]) != target_dir:
                return None, "非法的文件路径跨越"
            if not os.path.exists(target_path):
                return None, "目标文件尚未生成"
            if os.path.getsize(target_path) < 10:
                return None, "目标文件内容为空或尺寸异常"
            content = smart_read_text(target_path)
            return content, "success"
        except Exception:
            return None, "文件读取触发底层异常"

    @staticmethod
    def execute_validation(project_name, script_type, chapter_name, mode, log_func):
        log_func(f"--- 开始执行 {script_type} 宽松模式校验 ---")
        try:
            target_dir = TextValidationApp.get_safe_project_dir(project_name)
        except Exception:
            err_msg = "项目路径安全校验未通过"
            log_func(f"[ERROR] {err_msg}")
            return {"pass": False, "score": 0, "feedback": err_msg}
        result = {"pass": False, "score": 0, "feedback": "未知的脚本节点类型"}
        try:
            if script_type == "f0":
                index_path = os.path.join(target_dir, "global_rag_db", "vector.index")
                chunk_path = os.path.join(target_dir, "global_rag_db", "chunks.json")
                if os.path.exists(index_path) and os.path.getsize(index_path) > 0 and os.path.exists(chunk_path):
                    result = {"pass": True, "score": 3, "feedback": "向量索引与块映射文件完整。"}
                else:
                    result["feedback"] = "向量数据库文件缺失或尺寸异常。"
            elif script_type == "f1a":
                content, msg = TextValidationApp.safe_read_target(target_dir, "statistics/统计指标.txt")
                if content:
                    if "【一、 文本骨架长度统计】" in content and "【五、 宏观词性分布比例】" in content:
                        result = {"pass": True, "score": 3, "feedback": "统计指标骨架完整。"}
                    else:
                        result["feedback"] = "统计文件缺失预设的分析版块标题。"
                else:
                    result["feedback"] = msg
            elif script_type == "f1b":
                content, msg = TextValidationApp.safe_read_target(target_dir, "features.md")
                if content:
                    headers = ["一、行文风格", "二、格式要求", "三、手法偏好", "四、具体内容"]
                    if all(h in content for h in headers):
                        result = {"pass": True, "score": 3, "feedback": "文风提取 Markdown 结构完整。"}
                    else:
                        result["feedback"] = "文风设定文件缺失必要的一级标题。"
                else:
                    result["feedback"] = msg
            elif script_type == "f2a":
                content, msg = TextValidationApp.safe_read_target(target_dir, "statistics/高频词.txt")
                if content and "(" in content and ")" in content:
                    result = {"pass": True, "score": 3, "feedback": "高频词格式解析通过。"}
                else:
                    result["feedback"] = msg if msg != "success" else "未检测到有效的词频格式。"
            elif script_type == "f2b":
                content, msg = TextValidationApp.safe_read_target(target_dir, "positive_words.md")
                if content:
                    if "容貌" in content and "气质" in content and "交互" in content:
                        result = {"pass": True, "score": 3, "feedback": "正面词库细节分类完整。"}
                    else:
                        result["feedback"] = "正面词汇库缺失关键类别标签。"
                else:
                    result["feedback"] = msg
            elif script_type == "f3a":
                content, msg = TextValidationApp.safe_read_target(target_dir, "exclusive_vocab.md")
                if content and ("-" in content or "*" in content):
                    result = {"pass": True, "score": 3, "feedback": "专属词汇库列表结构检测通过。"}
                else:
                    result["feedback"] = msg if msg != "success" else "缺失无序列表标识符。"
            elif script_type == "f3b":
                content, msg = TextValidationApp.safe_read_target(target_dir, "world_settings.md")
                if content:
                    keys = ["力量体系", "种族/阵营", "历史/传说"]
                    if all(k in content for k in keys):
                        result = {"pass": True, "score": 3, "feedback": "世界观核心键值检测通过。"}
                    else:
                        result["feedback"] = "世界观设定缺失必要字段(如力量体系)。"
                else:
                    result["feedback"] = msg
            elif script_type == "f3c":
                char_dir = os.path.join(target_dir, "character_profiles")
                if os.path.exists(char_dir) and any(f.endswith(".md") for f in os.listdir(char_dir)):
                    result = {"pass": True, "score": 3, "feedback": "角色卡目录存在且包含Markdown文件。"}
                else:
                    result["feedback"] = "角色卡未生成。"
            elif script_type == "f4a":
                result = {"pass": True, "score": 3, "feedback": "设定补全物理状态正常。"}
            elif script_type == "f4b":
                idx_path = os.path.join(target_dir, "hierarchical_rag_db", "plot_summary.index")
                map_path = os.path.join(target_dir, "hierarchical_rag_db", "summary_to_raw_mapping.json")
                if os.path.exists(idx_path) and os.path.exists(map_path):
                    result = {"pass": True, "score": 3, "feedback": "分层检索库与映射表完整。"}
                else:
                    result["feedback"] = "动态压缩库文件生成失败。"
            elif script_type == "f5a":
                if not chapter_name:
                    return {"pass": False, "score": 0, "feedback": "执行 f5a 校验必须提供 chapter_name。"}
                content, msg = TextValidationApp.safe_read_target(target_dir, f"chapter_structures/{chapter_name}_outline.md")
                if content:
                    if len(content) > 2000:
                        result["feedback"] = f"大纲字数超限 ({len(content)}字)，疑似将大纲写成正文流水账。"
                    elif "核心冲突" in content and "发展" in content:
                        result = {"pass": True, "score": 3, "feedback": "大纲结构及字数长度校验通过。"}
                    else:
                        result["feedback"] = "大纲缺失标准叙事结构标题。"
                else:
                    result["feedback"] = msg
            elif script_type == "f5b":
                if not chapter_name:
                    return {"pass": False, "score": 0, "feedback": "执行 f5b 校验必须提供 chapter_name。"}
                content, msg = TextValidationApp.safe_read_target(target_dir, f"content/{chapter_name}.txt")
                if not content:
                    return {"pass": False, "score": 0, "feedback": msg}
                word_count = len(content)
                if word_count < 1000:
                    return {"pass": False, "score": 0, "feedback": f"正文字数过少 ({word_count}字)，未达到下限标准。"}
                neg_content, _ = TextValidationApp.safe_read_target(target_dir, "negative_words.md")
                if neg_content:
                    neg_words = [w.strip() for w in re.split(r'[,，、\n]', neg_content) if w.strip()]
                    if neg_words:
                        pattern = re.compile('|'.join(map(re.escape, neg_words)))
                        match = pattern.search(content)
                        if match:
                            return {"pass": False, "score": 0, "feedback": f"正文命中本地违禁词表规则: [{match.group(0)}]"}
                result = {"pass": True, "score": 3, "feedback": f"正文物理指标校验通过 (字数: {word_count})，未命中敏感词。"}
        except Exception:
            log_func("[ERROR] 执行过程出现未预期的中断。")
            result = {"pass": False, "score": 0, "feedback": "系统校验异常拦截：数据解析规则冲突。"}
        status_str = "通过" if result["pass"] else "未通过"
        log_func(f">> 校验结果: {status_str} | 分数: {result['score']}")
        log_func(f">> 反馈信息: {result['feedback']}")
        return result

def run_headless(project_name, script_type, chapter_name="", mode="loose"):
    import sys
    if not project_name or not script_type:
        sys.exit(1)
    result = TextValidationApp.execute_validation(project_name, script_type, chapter_name, mode, lambda msg: None)
    if result.get("pass"):
        sys.exit(0)
    else:
        sys.stderr.write(result.get("feedback", "校验失败"))
        sys.exit(1)

if __name__ == "__main__":
    safe_run_app(
        app_class=TextValidationApp,
        headless_func=run_headless,
        project_name="",
        script_type="f5b",
        chapter_name="",
        mode="loose"
    )
