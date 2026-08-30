import re
import sys
import os
import tempfile
import uuid
import shutil
import glob
import json
import asyncio
import time
import random

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SANDBOX_DIR = os.path.join(tempfile.gettempdir(), "style_sync_sandbox")
os.makedirs(SANDBOX_DIR, exist_ok=True)

def mask_sensitive_info(error_msg: str) -> str:
    msg = str(error_msg)
    msg = msg.replace(PROJECT_ROOT, "[SERVER_WORKSPACE]")
    msg = msg.replace(SANDBOX_DIR, "[SECURE_SANDBOX]")
    msg = re.sub(r'[A-Za-z]:\\[^\s"\'<>]+', '[LOCAL_PATH]', msg)
    msg = re.sub(r'/(?:tmp|usr|opt|var|home|etc)/[^\s"\'<>]+', '[LOCAL_PATH]', msg)
    msg = re.sub(r'sk-[a-zA-Z0-9]{20,}', '[REDACTED_API_KEY]', msg)
    msg = re.sub(r'Bearer\s+[a-zA-Z0-9\-\.\_]{20,}', 'Bearer [REDACTED_TOKEN]', msg)
    return msg

def validate_safe_param(param: str) -> str:
    """白名单校验外部参数，防 Shell/Argparse 注入"""
    if not param: 
        return param
    param = str(param).strip()
    
    # 【修复1】：不再拦截 startswith("-")，防止误杀 Markdown 列表符号
    # 【修复2】：将 *、•、~ 等可能附带的 Markdown 标记加入白名单放行
    if not re.match(r'^[\w\-\s\u4e00-\u9fa5\(\)（），,\.、:：/\[\]\+\*•~]+$', param):
        raise ValueError(f"安全拦截：参数 [{param}] 包含非法特殊字符")
    return param

def create_sandbox_ticket(source_file_path: str) -> str:
    if not source_file_path or not os.path.exists(source_file_path):
        return ""
    ticket_id = f"TKT-{uuid.uuid4().hex}"
    ext = os.path.splitext(source_file_path)[1] or ".txt"
    sandbox_path = os.path.join(SANDBOX_DIR, f"{ticket_id}{ext}")
    try:
        os.link(source_file_path, sandbox_path)
    except OSError:
        shutil.copy2(source_file_path, sandbox_path)
    return ticket_id

def resolve_sandbox_ticket(ticket_id: str) -> str:
    ticket_base = os.path.splitext(os.path.basename(ticket_id))[0]
    if not ticket_base.startswith("TKT-") or not re.match(r'^TKT-[a-f0-9]{32}$', ticket_base):
        raise ValueError("非法的票据标识符")
    matches = glob.glob(os.path.join(SANDBOX_DIR, f"{ticket_base}.*"))
    if not matches:
        raise FileNotFoundError("票据生命周期已结束或文件不存在")
    safe_target = os.path.normcase(os.path.realpath(os.path.abspath(matches[0])))
    safe_base = os.path.normcase(os.path.realpath(os.path.abspath(SANDBOX_DIR)))
    if os.path.commonpath([safe_base, safe_target]) != safe_base:
        raise PermissionError("沙箱越权读取拦截")
    return safe_target

def cleanup_sandbox_ticket(ticket_id: str):
    if not ticket_id: 
        return
    ticket_base = os.path.splitext(os.path.basename(ticket_id))[0]
    if not ticket_base.startswith("TKT-"): 
        return
    matches = glob.glob(os.path.join(SANDBOX_DIR, f"{ticket_base}.*"))
    for match in matches:
        try:
            os.remove(match)
        except OSError:
            pass

def safe_faiss_read_index(index_path: str):
    import faiss
    import numpy as np
    if not os.path.exists(index_path):
        raise FileNotFoundError(f"FAISS 索引文件不存在: {index_path}")
    try:
        with open(index_path, "rb") as f:
            data = f.read()
        return faiss.deserialize_index(np.frombuffer(data, dtype=np.uint8))
    except Exception as e:
        raise RuntimeError(f"FAISS 索引底层反序列化失败: {str(e)}")

def smart_read_text(file_path, max_len=None):
    basename = os.path.basename(file_path)
    if basename.startswith("TKT-"):
        try:
            file_path = resolve_sandbox_ticket(basename)
        except (ValueError, FileNotFoundError, PermissionError) as e:
            raise RuntimeError(f"票据解析拦截: {mask_sensitive_info(str(e))}")

    encodings_to_try = ['utf-8', 'gb18030', 'utf-16']
    text = None
    for enc in encodings_to_try:
        try:
            with open(file_path, 'r', encoding=enc) as f:
                text = f.read(max_len) if max_len else f.read()
            return text
        except UnicodeDecodeError:
            continue
            
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read(max_len) if max_len else f.read()
        sample = text[:1000]
        chinese_chars = re.findall(r'[\u4e00-\u9fa5，。！？“”]', sample)
        if len(sample) > 100 and (len(chinese_chars) / len(sample)) < 0.2:
            raise ValueError("文件读取后汉字密度过低，判定为乱码或格式损坏，已拦截。")
        return text
    except (OSError, ValueError) as e:
        error_msg = f"文件解析彻底失败: {mask_sensitive_info(str(e))}"
        print(f"[ERROR] {error_msg}")
        raise RuntimeError(error_msg)

def smart_yield_text(file_path: str, chunk_size: int = 8192, high_water_mark: int = 1048576):
    basename = os.path.basename(file_path)
    if basename.startswith("TKT-"):
        try:
            file_path = resolve_sandbox_ticket(basename)
        except (ValueError, FileNotFoundError, PermissionError) as e:
            raise RuntimeError(f"票据解析拦截: {mask_sensitive_info(str(e))}")

    encodings_to_try = ['utf-8', 'gb18030', 'utf-16']
    target_encoding = None

    for enc in encodings_to_try:
        try:
            with open(file_path, 'r', encoding=enc) as f:
                f.read(100)
            target_encoding = enc
            break
        except UnicodeDecodeError:
            continue
            
    if not target_encoding:
        target_encoding = 'utf-8'

    buffer = ""
    try:
        with open(file_path, 'r', encoding=target_encoding, errors='ignore') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    if buffer:
                        yield buffer
                    break

                buffer += chunk
                
                if len(buffer) > high_water_mark:
                    print(f"[WARN] 触发内存高水位告警 ({high_water_mark} bytes)，执行强制截断以防 OOM。")
                    yield buffer
                    buffer = ""
                    continue

                last_newline_idx = buffer.rfind('\n')
                if last_newline_idx != -1:
                    yield buffer[:last_newline_idx + 1]
                    buffer = buffer[last_newline_idx + 1:]
                    
    except OSError as e:
        error_msg = f"流式文件解析异常: {mask_sensitive_info(str(e))}"
        print(f"[ERROR] {error_msg}")
        raise RuntimeError(error_msg)

def resolve_sandbox_path(base_dir: str, user_input_path: str, allowed_extensions=('.txt', '.md')) -> str:
    if not user_input_path:
        raise ValueError("输入路径不能为空")
    user_input_path = str(user_input_path).strip()
    if re.search(r'[\r\n\t\x00]', user_input_path):
        raise ValueError("【系统拦截】：输入路径包含非法控制字符")

    safe_base = os.path.normcase(os.path.realpath(os.path.abspath(base_dir)))
    raw_target = os.path.join(safe_base, user_input_path)
    safe_target = os.path.normcase(os.path.realpath(os.path.abspath(raw_target)))
    
    if os.path.commonpath([safe_base, safe_target]) != safe_base:
        raise PermissionError("【系统拦截】：检测到越权路径访问尝试！")
        
    if os.path.isdir(safe_target):
        raise IsADirectoryError("【系统拦截】：目标路径为文件夹，拒绝读取！")
        
    if allowed_extensions and not safe_target.endswith(allowed_extensions):
        raise ValueError(f"【系统拦截】：不支持的文件格式，仅允许 {allowed_extensions}")
        
    return safe_target

def atomic_write(target_path: str, data, data_type: str = 'text'):
    dirname = os.path.dirname(target_path)
    if dirname:
        os.makedirs(dirname, exist_ok=True)
        
    temp_path = f"{target_path}.{uuid.uuid4().hex}.tmp"
    
    try:
        if data_type == 'json':
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        elif data_type == 'faiss':
            import faiss
            chunk = faiss.serialize_index(data)
            with open(temp_path, 'wb') as f:
                f.write(chunk)
        else:  
            with open(temp_path, 'w', encoding='utf-8') as f:
                f.write(str(data))
                
        max_retries = 10     
        base_delay = 0.2     
        max_delay = 3.0      
        
        for attempt in range(max_retries):
            try:
                os.replace(temp_path, target_path)
                return True
            except PermissionError as e:
                if attempt < max_retries - 1:
                    sleep_time = min(max_delay, base_delay * (1.5 ** attempt)) + random.uniform(0, 0.1)
                    time.sleep(sleep_time)
                    continue
                else:
                    backup_path = f"{target_path}.backup-{int(time.time())}.txt"
                    try:
                        shutil.move(temp_path, backup_path) 
                        raise RuntimeError(f"目标文件被其它软件死死锁定，无法覆写。为防数据丢失，已生成紧急备份: {backup_path}")
                    except OSError:
                        raise RuntimeError(f"文件锁定且重命名失败。生成的数据已物理保留在临时文件中: {temp_path}")
                    
    except Exception as e:
        if not isinstance(e, RuntimeError) or ("紧急备份" not in str(e) and "临时文件保留" not in str(e)):
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
        raise RuntimeError(f"原子写入事务失败，详情: {str(e)}")

class AsyncFileLockManager:
    _locks = {}
    _dict_lock = asyncio.Lock()

class async_file_lock:
    def __init__(self, file_path: str):
        if not file_path:
            raise ValueError("系统拦截：文件路径不能为空")
        self.norm_path = os.path.normcase(os.path.realpath(os.path.abspath(file_path)))

    async def __aenter__(self):
        async with AsyncFileLockManager._dict_lock:
            if self.norm_path not in AsyncFileLockManager._locks:
                AsyncFileLockManager._locks[self.norm_path] = asyncio.Lock()
            self.lock = AsyncFileLockManager._locks[self.norm_path]
        
        await self.lock.acquire()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.lock.release()
        async with AsyncFileLockManager._dict_lock:
            if not self.lock.locked() and self.norm_path in AsyncFileLockManager._locks:
                del AsyncFileLockManager._locks[self.norm_path]

async def async_smart_read_text(file_path: str, max_len: int = None) -> str:
    async with async_file_lock(file_path):
        return await asyncio.to_thread(smart_read_text, file_path, max_len)

async def async_atomic_write(target_path: str, data, data_type: str = 'text') -> bool:
    async with async_file_lock(target_path):
        return await asyncio.to_thread(atomic_write, target_path, data, data_type)

async def async_append_text(target_path: str, content: str) -> bool:
    def _append():
        with open(target_path, "a", encoding="utf-8") as f:
            f.write(content)
        return True
        
    async with async_file_lock(target_path):
        return await asyncio.to_thread(_append)