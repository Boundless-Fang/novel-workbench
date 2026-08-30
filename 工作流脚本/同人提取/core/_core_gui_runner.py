import sys
import os
import queue
import argparse
import threading

def inject_env():
    """微型引导函数：注入根目录环境变量，保留单脚本独立调试能力"""
    current_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
    parent_dir = os.path.dirname(current_dir)
    if parent_dir not in sys.path:
        sys.path.append(parent_dir)

class ThreadSafeBaseGUI:
    """
    统一的线程安全 GUI 抽象基类。
    处理公共的日志队列、窗口初始化与后台调度，消除子类模板代码。
    """
    def __init__(self, root, title, geometry="600x400"):
        self.root = root
        self.root.title(title)
        self.root.geometry(geometry)
        self.root.resizable(False, False)
        
        # 核心修复：线程安全的日志队列
        self.log_queue = queue.Queue()
        self.is_running = False
        
        self.setup_custom_widgets()
        self.setup_common_log_widget()
        
        # 启动主线程轮询
        self.root.after(100, self._process_log_queue)

    def setup_custom_widgets(self):
        """由子类覆写：渲染特有组件"""
        raise NotImplementedError

    def setup_common_log_widget(self):
        """渲染公共日志组件"""
        import tkinter as tk
        self.log_text = tk.Text(self.root, height=10, state="disabled", bg="#f8f9fa")
        self.log_text.pack(fill="x", padx=10, pady=5)
        self.log("系统就绪。")

    def log(self, message):
        """将日志压入队列，由主线程消费"""
        self.log_queue.put(message)

    def _process_log_queue(self):
        """主线程轮询，安全更新 UI"""
        import tkinter as tk
        try:
            while True:
                msg = self.log_queue.get_nowait()
                self.log_text.config(state="normal")
                self.log_text.insert(tk.END, msg + "\n")
                self.log_text.see(tk.END)
                self.log_text.config(state="disabled")
        except queue.Empty:
            pass
        finally:
            self.root.after(100, self._process_log_queue)

    def execute_logic(self):
        """由子类覆写：无头核心业务逻辑"""
        raise NotImplementedError

    def start_process_thread(self, btn_widget=None):
        """通用后台线程调度器 (增强版：修复传入 None 导致的 AttributeError 崩溃)"""
        if self.is_running:
            return
        self.is_running = True
        
        # 安全校验：仅当传入了真实 widget 时才调用其方法
        if btn_widget:
            btn_widget.config(state="disabled")
        
        def worker():
            try:
                self.execute_logic()
            finally:
                self.is_running = False
                # 通知主线程恢复按钮状态
                if btn_widget:
                    self.root.after(0, lambda: btn_widget.config(state="normal"))
                
        threading.Thread(target=worker, daemon=True).start()

def safe_run_app(app_class, headless_func, **headless_kwargs):
    """
    统一的安全启动器：
    1. 自动解析命令行参数
    2. 无参时尝试启动 GUI (安全拦截 Linux 无头环境异常)
    3. 有参时静默分发给 headless_func
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

    # GUI 启动分支 
    if not args.target_file and len(sys.argv) == 1 and not args.mode and not args.chapter:
        try:
            import tkinter as tk
            root = tk.Tk()
            app = app_class(root)
            root.mainloop()
        except Exception as e:
            print(f"\n[系统拦截] 无法启动图形界面，当前环境可能缺少显示驱动。")
            print(f"底层错误: {e}\n[操作建议] 请通过 Web 工作台或命令行参数执行。")
            sys.exit(1)
            
    # 静默执行分支 
    else:
        if not args.target_file and unknown and not unknown[0].startswith('--'):
            args.target_file = unknown[0]
        
        # 将解析到的参数更新到传入的字典中 
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
