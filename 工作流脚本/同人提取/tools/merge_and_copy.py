import os
import re  # 导入正则表达式模块用于清洗中文
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

# 默认路径
DEFAULT_PATH = r"D:\StyleSync-Novel\style_imitation_code"

# --- 定义允许合并的文件后缀名（支持原有的 .py 以及前端文件） ---
ALLOWED_EXTENSIONS = ('.py', '.js', '.html', '.css')

class CodeMergerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("代码整合工具 v3.0 - 文件夹精选版")
        self.root.geometry("600x500")

        self.folder_var = tk.StringVar(value=DEFAULT_PATH)
        self.check_vars = {}  # 存储 文件夹名: BooleanVar

        self.setup_ui()
        # 初始加载一次默认路径
        if os.path.exists(DEFAULT_PATH):
            self.refresh_folder_list()

    def setup_ui(self):
        # --- 顶部：路径选择 ---
        top_frame = tk.Frame(self.root)
        top_frame.pack(fill="x", padx=10, pady=10)

        tk.Label(top_frame, text="项目路径:").pack(side="left")
        self.path_entry = tk.Entry(top_frame, textvariable=self.folder_var, state='readonly')
        self.path_entry.pack(side="left", fill="x", expand=True, padx=5)
        
        tk.Button(top_frame, text="📂 浏览", command=self.select_directory).pack(side="left")

        # --- 中间：勾选列表说明 ---
        tk.Label(self.root, text="请勾选需要整合的文件夹 (默认全选):", font=("微软雅黑", 9, "bold")).pack(anchor="w", padx=10)

        # --- 中间：滚动列表区域 ---
        list_frame = tk.Frame(self.root)
        list_frame.pack(fill="both", expand=True, padx=10, pady=5)

        self.canvas = tk.Canvas(list_frame)
        self.scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = tk.Frame(self.canvas)

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )

        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

        # --- 底部：操作按钮 ---
        bottom_frame = tk.Frame(self.root)
        bottom_frame.pack(fill="x", pady=15)

        tk.Button(bottom_frame, text="全选 / 取消全选", command=self.toggle_all).pack(side="left", padx=10)
        
        # --- 清除中文的复选框 ---
        self.remove_cn_var = tk.BooleanVar(value=False) # 默认不清除
        tk.Checkbutton(bottom_frame, text="🧹 清洗所有中文", variable=self.remove_cn_var, font=("微软雅黑", 9)).pack(side="left", padx=10)
        
        self.copy_btn = tk.Button(bottom_frame, text="一键合并并复制", 
                                  command=self.merge_and_copy, 
                                  bg="#28a745", fg="white", font=("微软雅黑", 10, "bold"),
                                  padx=20, pady=8)
        self.copy_btn.pack(side="right", padx=10)

    def select_directory(self):
        selected = filedialog.askdirectory(initialdir=self.folder_var.get())
        if selected:
            self.folder_var.set(selected)
            self.refresh_folder_list()

    def refresh_folder_list(self):
        """扫描当前路径下的文件夹并生成勾选框"""
        # 清空旧的勾选框
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
        self.check_vars.clear()

        root_path = self.folder_var.get()
        if not os.path.exists(root_path):
            return

        # 获取子目录
        try:
            items = os.listdir(root_path)
            # 过滤出文件夹，并按字母排序
            subfolders = sorted([i for i in items if os.path.isdir(os.path.join(root_path, i))])
            
            # 增加一个特殊选项：根目录下的文件
            subfolders.insert(0, "[根目录下的文件]")

            for folder in subfolders:
                var = tk.BooleanVar(value=True) # 默认全选
                self.check_vars[folder] = var
                cb = tk.Checkbutton(self.scrollable_frame, text=folder, variable=var, font=("Consolas", 10))
                cb.pack(anchor="w", padx=5, pady=2)
        except Exception as e:
            messagebox.showerror("读取错误", str(e))

    def toggle_all(self):
        """切换全选或全部取消"""
        if not self.check_vars: return
        # 如果当前有任何一个是选中的，就全部取消；否则全部选中
        any_checked = any(var.get() for var in self.check_vars.values())
        new_state = not any_checked
        for var in self.check_vars.values():
            var.set(new_state)

    def merge_and_copy(self):
        root_path = self.folder_var.get()
        selected_folders = [name for name, var in self.check_vars.items() if var.get()]

        if not selected_folders:
            messagebox.showwarning("提示", "你一个文件夹都没选呀！")
            return

        combined_text = []
        file_count = 0

        try:
            # 1. 先处理“根目录下的文件” (如果勾选了)
            if "[根目录下的文件]" in selected_folders:
                files = sorted([f for f in os.listdir(root_path) if f.endswith(ALLOWED_EXTENSIONS) and os.path.isfile(os.path.join(root_path, f))])
                if files:
                    combined_text.append(f"\n{'='*60}\n# 位置: 项目根目录\n{'='*60}\n")
                    for f_name in files:
                        with open(os.path.join(root_path, f_name), 'r', encoding='utf-8') as f:
                            combined_text.append(f"\n# --- File: {f_name} ---")
                            combined_text.append(f.read())
                            file_count += 1

            # 2. 处理选中的子文件夹
            for folder_name in selected_folders:
                if folder_name == "[根目录下的文件]": continue
                
                folder_full_path = os.path.join(root_path, folder_name)
                # 递归读取该文件夹下的所有目标文件
                for root, dirs, files in os.walk(folder_full_path):
                    target_files = sorted([f for f in files if f.endswith(ALLOWED_EXTENSIONS)])
                    if target_files:
                        rel_path = os.path.relpath(root, root_path)
                        combined_text.append(f"\n\n{'#'*60}\n# 目录: {rel_path}\n{'#'*60}\n")
                        for f_name in target_files:
                            with open(os.path.join(root, f_name), 'r', encoding='utf-8') as f:
                                combined_text.append(f"\n# --- File: {f_name} ---")
                                combined_text.append(f.read())
                                file_count += 1

            if file_count == 0:
                messagebox.showinfo("提示", "所选范围内没找到代码。")
                return

            # --- 文本处理逻辑 ---
            final_text = "\n".join(combined_text)
            
            if self.remove_cn_var.get():
                # 匹配所有中文字符 (汉字) 并替换为空
                # 如果你想连中文标点一起删掉，把下面这行换成：final_text = re.sub(r'[^\x00-\x7F]+', '', final_text)
                final_text = re.sub(r'[\u4e00-\u9fa5]', '', final_text)

            # 复制到剪贴板
            self.root.clipboard_clear()
            self.root.clipboard_append(final_text)
            messagebox.showinfo("成功", f"整合完毕！共 {file_count} 个文件已存入剪贴板。")

        except Exception as e:
            messagebox.showerror("错误", f"发生意外：{str(e)}")

if __name__ == "__main__":
    root = tk.Tk()
    app = CodeMergerApp(root)
    root.mainloop()