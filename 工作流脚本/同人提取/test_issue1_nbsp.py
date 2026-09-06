import os
import time
import threading
import uuid

TARGET_FILE = r"D:\StyleSync-Novel\style_imitation_code\test_concurrency_target.json"
TEMP_FILE = f"{TARGET_FILE}.{uuid.uuid4().hex}.tmp"

def reader_thread():
    """
    模拟外部进程、高频状态轮询或子进程读取场景
    强制获取并保持目标文件的独占式读取锁
    """
    # 预先创建目标文件
    with open(TARGET_FILE, 'w', encoding='utf-8') as f:
        f.write('{"status": "init"}')
        
    print(f"[读取线程] 已启动。打开并持续锁定文件句柄: {TARGET_FILE}")
    with open(TARGET_FILE, 'r', encoding='utf-8') as f:
        time.sleep(4)  # 保持文件句柄打开4秒，模拟高并发下的时间重叠
    print("[读取线程] 释放文件句柄。")

def writer_thread():
    """
    模拟项目中 atomic_write 函数底层的 os.replace 行为
    """
    time.sleep(1)  # 延迟1秒，确保读取线程已率先锁定文件
    
    # 模拟生成带 UUID 的临时文件
    with open(TEMP_FILE, 'w', encoding='utf-8') as f:
        f.write('{"status": "updated"}')
        
    print(f"[写入线程] 临时文件已生成，尝试执行 os.replace 原子覆盖...")
    try:
        os.replace(TEMP_FILE, TARGET_FILE)
        print("[写入线程] 覆盖成功（预期外：当前 Windows 环境未执行强制文件锁定）。")
    except PermissionError as e:
        print("\n" + "=" * 50)
        print("[验证成功] 成功复现 WinError 32 缺陷！")
        print(f"底层报错拦截: {e}")
        print("结论：在 Windows 高并发环境下，原有的 os.replace 缺乏指数退避重试机制，必然导致守护协程崩溃。")
        print("=" * 50 + "\n")
    finally:
        # 清理测试产生的物理碎片
        for path in [TEMP_FILE, TARGET_FILE]:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except:
                    pass

if __name__ == "__main__":
    print("-" * 50)
    print("开始模拟 Windows 文件锁定并发冲突...")
    print("-" * 50)
    
    t1 = threading.Thread(target=reader_thread)
    t2 = threading.Thread(target=writer_thread)
    
    t1.start()
    t2.start()
    
    t1.join()
    t2.join()