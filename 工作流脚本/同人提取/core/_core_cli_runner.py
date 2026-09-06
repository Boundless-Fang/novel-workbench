import sys
import os
import argparse

def inject_env():
    """微型引导函数：注入根目录环境变量，保留单脚本独立调试能力"""
    current_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
    parent_dir = os.path.dirname(current_dir)
    if parent_dir not in sys.path:
        sys.path.append(parent_dir)

class HeadlessBaseTask:
    """
    无头任务基类 (平滑降级适配器)
    彻底移除了所有的 Tkinter 与多线程 UI 队列逻辑，统一标准输出。
    """
    def __init__(self, *args, **kwargs):
        self.is_running = False

    def log(self, message, append=False):
        """统一日志输出，自动对接外层的 subprocess.PIPE，屏蔽编码异常"""
        try:
            print(message, flush=True)
        except Exception:
            pass

    def execute_logic(self):
        """由子类覆写：核心业务逻辑"""
        raise NotImplementedError

    def start_process_thread(self, *args, **kwargs):
        """
        平滑兼容原有的执行接口。
        在无头模式下，剥离 threading，直接同步调用 execute_logic。
        """
        if self.is_running:
            return
        self.is_running = True
        try:
            self.execute_logic()
        except Exception as e:
            self.log(f"[ERROR] 执行异常: {str(e)}")
        finally:
            self.is_running = False

def safe_run_app(app_class, headless_func, **headless_kwargs):
    """
    统一的安全启动器：
    完全剔除 GUI 启动分支，强制走静默解析与底层任务分发。
    保留原有的参数契约，对上层 routeworkflow.py 完全透明。
    """
    parser = argparse.ArgumentParser()
    parser.add_argument("--target_file", type=str, default="")
    parser.add_argument("--project", type=str, default="")
    parser.add_argument("--model", type=str, default="deepseek-v4-flash")
    parser.add_argument("--character", type=str, default="")
    parser.add_argument("--mode", type=str, default="")
    parser.add_argument("--json_data", type=str, default="")
    parser.add_argument("--chapter", type=str, default="")
    parser.add_argument("--brief", type=str, default="")
    args, unknown = parser.parse_known_args()

    # 兼容隐式传参
    if not args.target_file and unknown and not unknown[0].startswith('--'):
        args.target_file = unknown[0]
        
    # 参数映射契约
    if 'target_file' in headless_kwargs: headless_kwargs['target_file'] = args.target_file
    if 'file_path' in headless_kwargs: headless_kwargs['file_path'] = args.target_file
    if 'project_name' in headless_kwargs: headless_kwargs['project_name'] = args.project
    if 'model' in headless_kwargs: headless_kwargs['model'] = args.model
    if 'character_list_str' in headless_kwargs: headless_kwargs['character_list_str'] = args.character
    if 'mode' in headless_kwargs: headless_kwargs['mode'] = args.mode
    if 'json_string' in headless_kwargs: headless_kwargs['json_string'] = args.json_data
    if 'json_data' in headless_kwargs: headless_kwargs['json_data'] = args.json_data
    if 'chapter_name' in headless_kwargs: headless_kwargs['chapter_name'] = args.chapter
    if 'chapter_brief_json' in headless_kwargs: headless_kwargs['chapter_brief_json'] = args.brief
        
    headless_func(**headless_kwargs)
